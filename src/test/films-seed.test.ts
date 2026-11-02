import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// The archive's rule: every one of the 974 films is seeded through the
// migration file itself (literal INSERTs), and the films table is publicly
// readable so the browse/search app can query it without a login.
const MIGRATION = "supabase/migrations/20261102000000_za_films_seed.sql";

describe("ZA films seed migration", () => {
  const sql = readFileSync(
    resolve(fileURLToPath(import.meta.url), `../../${MIGRATION}`),
    "utf8",
  );


  it("contains literal INSERTs for all 974 films", () => {
    expect((sql.match(/'za_film_/g) ?? []).length).toBe(974);
  });

  it("grants public read access so anon and authenticated users can browse", () => {
    expect(sql).toContain("GRANT SELECT ON public.films TO anon;");
    expect(sql).toContain("GRANT SELECT ON public.films TO authenticated;");
    expect(sql).toContain("TO anon, authenticated");
  });
});
