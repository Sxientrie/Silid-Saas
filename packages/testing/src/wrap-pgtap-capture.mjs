// One-shot helper: wraps each pgTAP suite with a TAP-line capture table so a
// single result set carries the full assertion stream (the Management API
// query path shows only the last result set; `supabase db test` streams all
// lines where Docker exists). Not part of the test suite itself.
import { readdirSync, readFileSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const outDir = ".tmp-pgtap-wrapped";
rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir);

for (const file of readdirSync("supabase/tests").filter((f) => f.endsWith(".sql")).sort()) {
  let sql = readFileSync(join("supabase/tests", file), "utf8");
  sql = sql.replace(/(select plan\(\d+\);)/, (m) => `${m}
create temp table tap_lines(line text);
grant select, insert on tap_lines to authenticated, anon, service_role;`);
  sql = sql.replace(/^select (is\(|throws_ok\(|lives_ok\()/gm, "insert into tap_lines select $1");
  if (sql.includes("create function pg_temp._claims(p_user uuid, p_role text, p_org uuid, p_branch uuid)")) {
    sql = sql.replace("set local role authenticated;", `grant execute on function pg_temp._claims(uuid, text, uuid, uuid) to authenticated;

set local role authenticated;`);
  }
  sql = sql.replace("select * from finish();", "select * from finish();\nselect line from tap_lines order by ctid;");
  writeFileSync(join(outDir, file), sql);
}
console.log("wrapped:", readdirSync(outDir).join(", "));
