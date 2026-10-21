import { readdirSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
const files = readdirSync("db/migrations")
  .filter((f) => f.endsWith(".sql"))
  .sort()
  .map((name) => {
    const sql = readFileSync(`db/migrations/${name}`, "utf8");
    return {
      name,
      sql,
      checksum: createHash("sha256").update(sql).digest("hex"),
    };
  });
const sql = files.map((f) => f.sql).join("\n");
mkdirSync("src/lib/db", { recursive: true });
writeFileSync(
  "src/lib/db/migrations.ts",
  `// Generated demo/test migration bundle. Do not edit.\nexport const migrations = ${JSON.stringify(sql)};\nexport const migrationFiles = ${JSON.stringify(files)};\n`,
);
