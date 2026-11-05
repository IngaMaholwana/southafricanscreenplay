import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// The archive's rule: the series catalogue is seeded through migration files —
// the schema (with public read grants) in the drizzle migration, and the rows
// as literal upserts in the generated data export. The series table is
// publicly readable so the browse/search pages can query it without a login.
const SCHEMA_MIGRATION = "drizzle/migrations/0001_create_series_table.sql";
const DATA_FILES = "supabase/migrations/*_za_series_data.sql";
import { globSync } from "node:fs";

describe("ZA TV series migrations", () => {
  const schema = readFileSync(resolve(process.cwd(), SCHEMA_MIGRATION), "utf8");
  const dataPaths = globSync(resolve(process.cwd(), DATA_FILES));
  const data = dataPaths.map((p) => readFileSync(p, "utf8")).join("\n");

  it("grants public read access so anon and authenticated users can browse", () => {
    expect(schema).toContain("GRANT SELECT ON public.series TO anon, authenticated;");
    expect(schema).toContain("FOR SELECT");
    expect(schema).toContain("USING (true)");
  });

  it("contains literal INSERTs for all 400 series", () => {
    expect((data.match(/'za_tv_/g) ?? []).length).toBe(400);
  });

  it("upserts by series id so re-applying an export is safe", () => {
    expect(data).toContain("ON CONFLICT (id) DO UPDATE SET");
  });
});
