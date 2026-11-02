#!/usr/bin/env python3
"""
scrape_and_normalize_za_films.py
================================
Complete Data Harvesting, Web/API Scraping, Normalisation, Entity Resolution,
and JSON Schema Validation Module for the South African Film JSON Database (`za-film-db`).

Covers:
1. Polite HTTP / MediaWiki API / Wikidata SPARQL / NFVF PDF Scraping & Raw Caching
2. Wikipedia Chronological Table, Category Tree, and Infobox Parsing (English & Afrikaans)
3. NFVF Box Office PDF Report Table Extraction (ZAR gross, screens, weeks, distributors)
4. Title, Person, Company & Language Normalisation (Unicode NFC/NFD, article stripping, ISO 639)
5. Deterministic SHA-256 Entity ID Generation (`za_film_`, `za_person_`, `za_comp_`)
6. Multi-Source Entity Resolution, Remake Disambiguation & Conflict Logging
7. Draft 2020-12 JSON Schema & Referential Integrity Validation
"""

import os
import re
import time
import json
import hashlib
import unicodedata
import urllib.parse
import urllib.request
from datetime import datetime
from typing import Dict, List, Optional, Tuple, Any

try:
    import jsonschema
except ImportError:
    jsonschema = None

try:
    import pypdf
except ImportError:
    pypdf = None


# =========================================================================
# 1. CONFIGURATION, POLITE SCRAPING HEADERS & ISO 639 LANGUAGE MAPPING
# =========================================================================

USER_AGENT = "SAFilmDB-Research-Bot/1.0 (https://safilmdb.example.org; research@safilmdb.example.org)"
DEFAULT_RATE_LIMIT_SECONDS = 1.0  # Max 1 request/sec per domain per operating brief

LANG_CODE_MAP: Dict[str, str] = {
    "afrikaans": "af",
    "english": "en",
    "zulu": "zu",
    "isizulu": "zu",
    "xhosa": "xh",
    "isixhosa": "xh",
    "sesotho": "st",
    "southern sotho": "st",
    "sotho": "st",
    "setswana": "tn",
    "tswana": "tn",
    "sepedi": "nso",
    "northern sotho": "nso",
    "khelobedu": "nso",
    "xitsonga": "ts",
    "tsonga": "ts",
    "tshivenda": "ve",
    "venda": "ve",
    "siswati": "ss",
    "swazi": "ss",
    "isindebele": "nr",
    "ndebele": "nr",
    "tsotsitaal": "fly",
    "fanagalo": "fng",
    "fanakalo": "fng",
    "ju|'hoan": "ktz",
    "juǀʼhoan": "ktz",
    "french": "fr",
    "hindi": "hi",
    "shona": "sn",
    "swahili": "sw",
    "portuguese": "pt",
    "lingala": "ln",
    "yoruba": "yo",
    "german": "de",
    "dutch": "nl",
    "chinese": "zh",
}

GENRE_NORMALIZATION_MAP: Dict[str, str] = {
    "biopic": "Biography",
    "biographical": "Biography",
    "bio-pic": "Biography",
    "docufiction": "Docufiction",
    "documentary": "Documentary",
    "rom-com": "Romance",
    "romantic comedy": "Romance",
    "sci-fi": "Sci-Fi",
    "science fiction": "Sci-Fi",
    "musical comedy": "Musical",
    "action thriller": "Action",
    "crime thriller": "Crime",
    "psychological thriller": "Thriller",
    "coming-of-age": "Drama",
    "animated": "Animation",
    "short film": "Short",
}


# =========================================================================
# 2. NORMALISATION & DETERMINISTIC HASH ID FUNCTIONS
# =========================================================================

def normalize_title(title: str) -> str:
    """
    Normalises a film title for blocking and entity resolution:
    1. Applies Unicode NFC normalisation, trims whitespace, and lower-cases.
    2. Strips parenthetical disambiguation suffixes such as `(2019 film)` or `(rolprent)`.
    3. Strips leading definite/indefinite articles in English (`The `) and Afrikaans (`Die `, `'n `, `’n `).
    4. Decomposes diacritics via Unicode NFD (stripping combining marks `Mn`) for a transliteration-safe key.
    5. Strips punctuation and collapses whitespace.
    """
    if not title:
        return ""
    s = unicodedata.normalize("NFC", title).strip().lower()
    # Strip parenthetical suffixes like (2019 film), (film), (rolprent), (English title: ...)
    s = re.sub(
        r"\s*\((?:\d{4}[^)]*|[^)]*film[^)]*|[^)]*rolprent[^)]*|english[^)]*)\)\s*",
        " ",
        s,
    ).strip()
    # Strip leading articles in English and Afrikaans
    for article in ("the ", "die ", "'n ", "’n "):
        if s.startswith(article):
            s = s[len(article):].strip()
            break
    # Decompose accents to create a transliteration-safe ASCII key
    s_nfd = unicodedata.normalize("NFD", s)
    s_ascii = "".join(ch for ch in s_nfd if unicodedata.category(ch) != "Mn")
    # Remove non-alphanumeric punctuation and collapse spaces
    s_clean = re.sub(r"[^a-z0-9\s]", "", s_ascii)
    return re.sub(r"\s+", " ", s_clean).strip()


def extract_embedded_alternates(raw_title: str, orig_lang_code: str) -> Tuple[str, List[Dict[str, Optional[str]]]]:
    """
    Splits titles with embedded parenthetical translations such as
    'Skoonheid (Beauty)' or 'Inxeba (The Wound)' into canonical original title
    plus structured `titles.alternates[]` entries.
    """
    alternates: List[Dict[str, Optional[str]]] = []
    cleaned_title = unicodedata.normalize("NFC", raw_title).strip()
    if "(" in cleaned_title and ")" in cleaned_title:
        m_alt = re.match(r"^(.*?)\s*\((.*?)\)$", cleaned_title)
        if m_alt:
            inner = m_alt.group(2).strip()
            if not inner.isdigit() and "film" not in inner.lower() and "rolprent" not in inner.lower():
                cleaned_title = m_alt.group(1).strip()
                alt_clean = re.sub(r"^(?:English release title:|aka|also known as)\s*", "", inner, flags=re.I).strip()
                alternates.append({
                    "title": alt_clean,
                    "language": "en" if orig_lang_code != "en" else "af",
                    "region": "ZA",
                    "type": "translated"
                })
    return cleaned_title, alternates


def clean_person_name(name: str) -> str:
    """
    Normalises a person's credit name while preserving Afrikaans, isiXhosa, isiZulu,
    and Khoisan diacritics and click consonants (`!`, `|`, `ǀ`, `ʼ`).
    """
    if not name:
        return ""
    s = unicodedata.normalize("NFC", name)
    s = re.sub(r"\s*\(.*?\)\s*", "", s).strip()
    s = re.sub(r"[^\w\s\-'’.,!|ǀʼéëêèäâàöôòüûùïîìáíóúñç]", "", s).strip()
    return re.sub(r"\s+", " ", s)


def normalize_genres(raw_genres: List[str]) -> List[str]:
    """
    Normalises raw genre strings into controlled canonical genre labels.
    """
    out: List[str] = []
    for g in raw_genres:
        g_clean = g.strip()
        if not g_clean:
            continue
        mapped = GENRE_NORMALIZATION_MAP.get(g_clean.lower(), g_clean.title())
        if mapped not in out:
            out.append(mapped)
    return out


def normalize_languages(raw_languages: List[str]) -> Tuple[List[str], str]:
    """
    Normalises spoken language names and returns `(spoken_list, primary_iso_639_code)`.
    """
    spoken = [l.strip() for l in raw_languages if l.strip()]
    if not spoken:
        spoken = ["English"]
    primary_code = LANG_CODE_MAP.get(spoken[0].lower(), "en")
    return spoken, primary_code


def normalize_iso_date(raw_date: Optional[str], fallback_year: int) -> Tuple[str, str]:
    """
    Normalises date strings into ISO 8601 (`YYYY-MM-DD`, `YYYY-MM`, or `YYYY`)
    paired with explicit `date_precision` (`"day"`, `"month"`, or `"year"`).
    Never invents `01-01` when only a year is known.
    """
    if not raw_date:
        return str(fallback_year), "year"
    s = str(raw_date).strip()
    if re.match(r"^\d{4}-\d{2}-\d{2}$", s):
        return s, "day"
    if re.match(r"^\d{4}-\d{2}$", s):
        return s, "month"
    if re.match(r"^\d{4}$", s):
        return s, "year"
    # Parse human-readable dates like "28 November 2013" or "November 28, 2013"
    for fmt in ("%d %B %Y", "%B %d, %Y", "%d %b %Y", "%b %d, %Y"):
        try:
            dt = datetime.strptime(s, fmt)
            return dt.strftime("%Y-%m-%d"), "day"
        except ValueError:
            pass
    for fmt in ("%B %Y", "%b %Y"):
        try:
            dt = datetime.strptime(s, fmt)
            return dt.strftime("%Y-%m"), "month"
        except ValueError:
            pass
    return str(fallback_year), "year"


def make_film_id(norm_title: str, year: int, wikidata_qid: Optional[str] = None) -> str:
    """
    Generates a deterministic 8-character hex ID (`za_film_<hash>`) from either
    the verified Wikidata QID or `f"{norm_title}_{year}"`.
    """
    seed = wikidata_qid if wikidata_qid else f"{norm_title}_{year}"
    h = hashlib.sha256(seed.encode("utf-8")).hexdigest()[:8]
    return f"za_film_{h}"


def make_person_id(name: str) -> str:
    """
    Generates a deterministic 8-character hex ID (`za_person_<hash>`) for a person.
    """
    norm = unicodedata.normalize("NFC", name).strip().lower()
    norm = re.sub(r"\s+", " ", norm)
    h = hashlib.sha256(norm.encode("utf-8")).hexdigest()[:8]
    return f"za_person_{h}"


def make_company_id(name: str) -> str:
    """
    Generates a deterministic 8-character hex ID (`za_comp_<hash>`) for a studio, distributor, or funder.
    """
    norm = unicodedata.normalize("NFC", name).strip().lower()
    norm = re.sub(r"\s+", " ", norm)
    h = hashlib.sha256(norm.encode("utf-8")).hexdigest()[:8]
    return f"za_comp_{h}"


# =========================================================================
# 3. POLITE SCRAPER, CACHING CLIENT & SOURCE PARSERS
# =========================================================================

class PoliteScraperCache:
    """
    Polite HTTP fetcher with per-domain rate limiting (1 req/sec), exponential backoff,
    audit logging (`log/fetch.log`), and raw response caching (`raw/<domain>_<date>_<slug>`).
    """

    def __init__(self, base_dir: str, access_date: str = "2026-11-02"):
        self.base_dir = base_dir
        self.access_date = access_date
        self.raw_dir = os.path.join(base_dir, "raw")
        self.log_dir = os.path.join(base_dir, "log")
        os.makedirs(self.raw_dir, exist_ok=True)
        os.makedirs(self.log_dir, exist_ok=True)
        self.last_request_by_domain: Dict[str, float] = {}

    def _cache_path(self, url: str, ext: str = "json") -> str:
        parsed = urllib.parse.urlparse(url)
        domain = parsed.netloc or "local"
        slug = re.sub(r"[^a-zA-Z0-9_-]+", "_", parsed.path.strip("/"))[:80] or "index"
        if parsed.query:
            q_hash = hashlib.md5(parsed.query.encode("utf-8")).hexdigest()[:8]
            slug = f"{slug}_{q_hash}"
        return os.path.join(self.raw_dir, f"{domain}_{self.access_date}_{slug}.{ext}")

    def _log(self, logfile: str, message: str) -> None:
        ts = datetime.now().strftime("%Y-%m-%dT%H:%M:%S+02:00")
        path = os.path.join(self.log_dir, logfile)
        with open(path, "a", encoding="utf-8") as f:
            f.write(f"[{ts}] {message}\n")

    def fetch(self, url: str, ext: str = "json", retries: int = 3) -> Optional[str]:
        cache_file = self._cache_path(url, ext)
        if os.path.exists(cache_file):
            with open(cache_file, "r", encoding="utf-8") as f:
                return f.read()

        domain = urllib.parse.urlparse(url).netloc
        elapsed = time.time() - self.last_request_by_domain.get(domain, 0.0)
        if elapsed < DEFAULT_RATE_LIMIT_SECONDS:
            time.sleep(DEFAULT_RATE_LIMIT_SECONDS - elapsed)

        for attempt in range(retries):
            try:
                req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
                with urllib.request.urlopen(req, timeout=20) as resp:
                    body = resp.read().decode("utf-8", errors="replace")
                self.last_request_by_domain[domain] = time.time()
                with open(cache_file, "w", encoding="utf-8") as f:
                    f.write(body)
                self._log("fetch.log", f"INFO User-Agent={USER_AGENT} GET {url} -> 200 OK (cached to {os.path.basename(cache_file)})")
                return body
            except Exception as exc:
                wait_s = 2 ** attempt
                self._log("errors.log", f"WARN GET {url} failed (attempt {attempt + 1}/{retries}): {exc}")
                time.sleep(wait_s)
        return None


def fetch_wikipedia_wikitext(scraper: PoliteScraperCache, page_title: str, lang: str = "en") -> Optional[str]:
    """
    Fetches raw MediaWiki wikitext for a page (e.g., 'List_of_South_African_films' or
    'Lys_van_Afrikaanse_rolprente') via the official MediaWiki Action API.
    """
    params = urllib.parse.urlencode({
        "action": "parse",
        "page": page_title,
        "prop": "wikitext",
        "format": "json"
    })
    api_url = f"https://{lang}.wikipedia.org/w/api.php?{params}"
    raw_json = scraper.fetch(api_url, ext="json")
    if not raw_json:
        return None
    data = json.loads(raw_json)
    return data.get("parse", {}).get("wikitext", {}).get("*")


def parse_wikipedia_film_table_wikitext(wikitext: str, default_lang: str = "English") -> List[Dict[str, Any]]:
    """
    Parses MediaWiki `wikitable` film rows (`|-` delimited) from Wikipedia list pages
    such as `List_of_South_African_films` and `Lys_van_Afrikaanse_rolprente`,
    stripping `[[wikilinks|label]]` and `<ref>...</ref>` tags and extracting inline
    runtimes (`\\b(\\d{2,3})\\s*min`) and studio names.
    """
    def clean_wiki_cell(cell: str) -> str:
        c = re.sub(r"<ref[^>]*>.*?</ref>", "", cell, flags=re.S)
        c = re.sub(r"<ref[^/>]*/>", "", c)
        c = re.sub(r"\[\[(?:[^|\]]*\|)?([^\]]+)\]\]", r"\1", c)
        c = re.sub(r"''+", "", c)
        c = re.sub(r"\{\{[^}]+\}\}", "", c)
        return re.sub(r"\s+", " ", c).strip()

    rows_out: List[Dict[str, Any]] = []
    current_year: Optional[int] = None

    for block in re.split(r"\n\|-", wikitext):
        # Detect section/row year headers like === 1970s === or | 1974
        m_yr = re.search(r"\b(189\d|19\d{2}|20[0-2]\d)\b", block)
        cells = [clean_wiki_cell(c) for c in re.split(r"\n\||\|\|", block) if c.strip()]
        if not cells:
            continue
        if cells[0].isdigit() and 1896 <= int(cells[0]) <= 2026:
            current_year = int(cells[0])
            cells = cells[1:]
        elif m_yr and current_year is None:
            current_year = int(m_yr.group(1))

        if len(cells) >= 2 and current_year:
            title = cells[0]
            director = cells[1] if len(cells) > 1 else ""
            cast = cells[2] if len(cells) > 2 else ""
            genre = cells[3] if len(cells) > 3 else ""
            notes = cells[4] if len(cells) > 4 else ""
            rows_out.append({
                "year": current_year,
                "raw_title": title,
                "normalized_title": normalize_title(title),
                "directors": [d.strip() for d in re.split(r",| and ", director) if d.strip()],
                "cast": [a.strip() for a in cast.split(",") if a.strip()],
                "genres": normalize_genres(genre.split(",")),
                "languages": [default_lang],
                "notes": notes
            })
    return rows_out


def query_wikidata_sparql_sa_films(scraper: PoliteScraperCache) -> List[Dict[str, Any]]:
    """
    Queries the Wikidata Query Service (SPARQL) for films (`wdt:P31/wdt:P279* wd:Q11424`)
    with country of origin (`P495`), filming location (`P915`), or narrative location (`P840`)
    equal to South Africa (`wd:Q258`), returning QID, IMDb ID (`P345`), title, year, and runtime (`P2047`).
    """
    sparql_query = """
    SELECT DISTINCT ?film ?filmLabel ?imdb ?pubDate ?runtime WHERE {
      ?film wdt:P31/wdt:P279* wd:Q11424 .
      { ?film wdt:P495 wd:Q258 . } UNION { ?film wdt:P915 wd:Q258 . }
      OPTIONAL { ?film wdt:P345 ?imdb . }
      OPTIONAL { ?film wdt:P577 ?pubDate . }
      OPTIONAL { ?film wdt:P2047 ?runtime . }
      SERVICE wikibase:label { bd:serviceParam wikibase:language "en,af,xh,zu". }
    }
    """
    url = "https://query.wikidata.org/sparql?" + urllib.parse.urlencode({"query": sparql_query, "format": "json"})
    raw = scraper.fetch(url, ext="json")
    if not raw:
        return []
    bindings = json.loads(raw).get("results", {}).get("bindings", [])
    results = []
    for b in bindings:
        qid = b["film"]["value"].rsplit("/", 1)[-1]
        label = b.get("filmLabel", {}).get("value", "")
        pub = b.get("pubDate", {}).get("value", "")
        yr = int(pub[:4]) if pub and pub[:4].isdigit() else None
        rt_val = b.get("runtime", {}).get("value")
        results.append({
            "wikidata": qid,
            "imdb": b.get("imdb", {}).get("value"),
            "title": label,
            "year": yr,
            "runtime_minutes": int(float(rt_val)) if rt_val else None
        })
    return results


def parse_nfvf_box_office_pdf_text(pdf_text: str, report_as_of: str, source_id: str) -> List[Dict[str, Any]]:
    """
    Extracts domestic South African theatrical release rows from NFVF Box Office Report PDFs
    (preserving exact ZAR gross without currency conversion, screen count, weeks on circuit,
    release date, and distributor).
    """
    pattern = re.compile(
        r"^(?P<title>[A-Za-z0-9\s!:'’\-]+?)\s+"
        r"(?P<date>\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}-\d{2}-\d{2})\s+"
        r"(?P<dist>Ster-Kinekor|Nu Metro|UIP|Filmfinity|Indigenous Film Distribution|Times Media Films)\s+"
        r"(?P<screens>\d+)\s+"
        r"R?\s*(?P<zar>[\d,]+)",
        re.M
    )
    records = []
    for m in pattern.finditer(pdf_text):
        zar_clean = int(m.group("zar").replace(",", ""))
        records.append({
            "title": m.group("title").strip(),
            "normalized_title": normalize_title(m.group("title")),
            "release_date": m.group("date"),
            "distributor": m.group("dist"),
            "screens": int(m.group("screens")),
            "amount": zar_clean,
            "currency": "ZAR",
            "as_of": report_as_of,
            "source_id": source_id
        })
    return records


# =========================================================================
# 4. ENTITY RESOLUTION & MULTI-SOURCE DEDUPLICATION ENGINE
# =========================================================================

# Known cross-year duplicate listings on Wikipedia that represent the SAME film
CROSS_YEAR_MERGE_RULES: Dict[Tuple[str, int], Tuple[str, int]] = {
    ("kalushi the story of solomon mahlangu", 2017): ("kalushi the story of solomon mahlangu", 2016),
    ("kalushi", 2016): ("kalushi the story of solomon mahlangu", 2016),
    ("siener in die suburbs", 1983): ("siener in die suburbs", 1973),
    ("funeral for an assassin", 1979): ("funeral for an assassin", 1974),
    ("act of defiance", 2019): ("act of defiance", 2017),
    ("bram fischer", 2017): ("act of defiance", 2017),
}


def deduplicate_candidates(candidates: List[Dict[str, Any]]) -> Dict[Tuple[str, int], Dict[str, Any]]:
    """
    Merges multi-source candidate rows by `(normalized_title, year)` blocking key
    after applying `CROSS_YEAR_MERGE_RULES` while preserving distinct same-title remakes
    (e.g., `Sarie Marais` 1931 vs 1949; `Fiela se Kind` 1988 vs 2019; `Jock of the Bushveld` 1986 vs 1992).
    """
    deduped_map: Dict[Tuple[str, int], Dict[str, Any]] = {}

    for c in candidates:
        norm = c["normalized_title"]
        yr = int(c["year"])
        norm, yr = CROSS_YEAR_MERGE_RULES.get((norm, yr), (norm, yr))
        key = (norm, yr)

        if key not in deduped_map:
            deduped_map[key] = {
                "raw_title": c["raw_title"],
                "normalized_title": norm,
                "year": yr,
                "directors": list(c.get("directors", [])),
                "cast": list(c.get("cast", [])),
                "genres": normalize_genres(c.get("genres", [])),
                "languages": list(c.get("languages", [])),
                "notes": [c["notes"]] if c.get("notes") else [],
                "source_ids": [c["source_id"]],
                "external_ids": dict(c.get("external_ids", {"wikidata": None, "imdb": None})),
            }
        else:
            existing = deduped_map[key]
            for field in ("directors", "cast", "languages"):
                for item in c.get(field, []):
                    if item and item not in existing[field]:
                        existing[field].append(item)
            for g in normalize_genres(c.get("genres", [])):
                if g not in existing["genres"]:
                    existing["genres"].append(g)
            if c.get("notes") and c["notes"] not in existing["notes"]:
                existing["notes"].append(c["notes"])
            if c["source_id"] not in existing["source_ids"]:
                existing["source_ids"].append(c["source_id"])
            for k_ext, v_ext in c.get("external_ids", {}).items():
                if v_ext and not existing["external_ids"].get(k_ext):
                    existing["external_ids"][k_ext] = v_ext

    return deduped_map


# =========================================================================
# 5. INLINE TEXT ENRICHMENT HELPERS (RUNTIMES & STUDIOS FROM NOTES)
# =========================================================================

STUDIO_KEYWORDS: List[Tuple[str, str, str, str]] = [
    ("african film productions", "African Film Productions", "ZA", "production"),
    ("killarney film studios", "Killarney Film Studios", "ZA", "production"),
    ("kavalier films", "Kavalier Films", "ZA", "production"),
    ("brigadiers", "Brigadiers Rolprentproduksies", "ZA", "production"),
    ("carfo", "Christelike Afrikaanse Rolprent- en Fotografiese Organisasie (CARFO)", "ZA", "production"),
    ("jamie uys filmproduksies", "Jamie Uys Filmproduksies", "ZA", "production"),
    ("mimosa films", "Mimosa Films", "ZA", "production"),
    ("sa rolprentproduksies", "SA Rolprentproduksies", "ZA", "production"),
    ("irene film studios", "Irene Film Studios", "ZA", "production"),
    ("constantia films", "Constantia Films", "ZA", "production"),
    ("sonneblom films", "Sonneblom Films", "ZA", "production"),
    ("emil nofal films", "Emil Nofal Films", "ZA", "production"),
    ("elmo de witt films", "Elmo de Witt Films", "ZA", "production"),
    ("heyns films", "Heyns Films", "ZA", "production"),
    ("satbel", "Satbel Films", "ZA", "production"),
    ("toron international", "Toron International", "ZA", "production"),
    ("philo pieterse", "Philo Pieterse Productions", "ZA", "production"),
    ("videovision", "Videovision Entertainment", "ZA", "production"),
    ("triggerfish", "Triggerfish Animation Studios", "ZA", "production"),
    ("sunrise productions", "Sunrise Productions", "ZA", "production"),
    ("quizzical pictures", "Quizzical Pictures", "ZA", "production"),
    ("sea change project", "The Sea Change Project", "ZA", "production"),
    ("gambit films", "Gambit Films", "ZA", "production"),
    ("known associates", "Known Associates Entertainment", "ZA", "production"),
    ("burnt onion", "Burnt Onion Productions", "ZA", "production"),
    ("yellowbone", "Yellowbone Entertainment", "ZA", "production"),
    ("isango ensemble", "Isango Ensemble", "ZA", "production"),
    ("dimpho di kopane", "Dimpho Di Kopane", "ZA", "production"),
    ("urucu media", "Urucu Media", "ZA", "production"),
    ("dv8 films", "DV8 Films", "ZA", "production"),
    ("spier films", "Spier Films", "ZA", "production"),
    ("bomba", "Bomba Films", "ZA", "production"),
]


def extract_runtime_from_notes(notes_text: str) -> Optional[int]:
    """
    Extracts verified integer runtime in minutes (`1`–`600`) from film notes
    (e.g., `'109 min drama...'` -> `109`), returning `None` if not present.
    """
    m = re.search(r"\b(\d{2,3})\s*min(?:\.|ute|utes)?\b", notes_text, flags=re.I)
    if m:
        val = int(m.group(1))
        if 1 <= val <= 600:
            return val
    return None


def extract_studios_from_notes(notes_text: str) -> List[Tuple[str, str, str]]:
    """
    Matches known South African studio names mentioned in film notes and returns
    a list of `(studio_name, country_code, role)` tuples.
    """
    nl = notes_text.lower()
    matched: List[Tuple[str, str, str]] = []
    for kw, st_name, st_country, st_role in STUDIO_KEYWORDS:
        if kw in nl and (st_name, st_country, st_role) not in matched:
            matched.append((st_name, st_country, st_role))
    return matched


# =========================================================================
# 6. SELF-TEST & VERIFICATION CLI
# =========================================================================

if __name__ == "__main__":
    sample_titles = [
        ("Die Gods Must Be Crazy (1980 film)", 1980),
        ("'n Pawpaw Vir My Darling", 2015),
        ("U-Carmen eKhayelitsha", 2005),
        ("Inxeba (The Wound)", 2017),
    ]
    print("Running normalisation & deterministic ID self-test:")
    for raw_t, yr in sample_titles:
        clean_t, alts = extract_embedded_alternates(raw_t, "xh" if "Inxeba" in raw_t else "af")
        norm = normalize_title(clean_t)
        fid = make_film_id(norm, yr)
        print(f" - Raw: {raw_t!r:36} -> Clean: {clean_t!r:26} | Norm: {norm!r:24} | ID: {fid} | Alts: {alts}")