// Run explicitly after migrations. Never rotates an existing runtime credential.
import nextEnv from "@next/env";
import postgres from "postgres";
import { randomBytes } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
nextEnv.loadEnvConfig(process.cwd());
if (process.env.DATABASE_URL) {
  console.log("Runtime URL already configured; no changes made.");
  process.exit(0);
}
if (!process.env.DATABASE_ADMIN_URL)
  throw new Error("Configure DATABASE_ADMIN_URL first");
const sql = postgres(process.env.DATABASE_ADMIN_URL, {
  max: 1,
  ssl: "require",
});
const password = randomBytes(32).toString("hex");
let role = "spplast_runtime";
try {
  if ((await sql`select 1 from pg_roles where rolname=${role}`).length)
    role += `_${randomBytes(4).toString("hex")}`;
  // Both interpolated values are generated locally and restricted to ASCII alphanumeric/underscore.
  await sql.begin(async (tx) => {
    await tx.unsafe(
      `create role ${role} login password '${password}' nosuperuser nocreatedb nocreaterole nobypassrls`,
    );
    await tx.unsafe(`grant spplast_app to ${role}`);
  });
  const url = new URL(process.env.DATABASE_ADMIN_URL);
  url.username = role;
  url.password = password;
  let contents = "";
  try {
    contents = await readFile(".env.local", "utf8");
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }
  if (/^DATABASE_URL=.+$/m.test(contents))
    throw new Error(
      "Runtime URL was added during provisioning; refusing to replace it",
    );
  contents = /^DATABASE_URL=.*$/m.test(contents)
    ? contents.replace(/^DATABASE_URL=.*$/m, `DATABASE_URL=${url.href}`)
    : contents +
      `\n# Restricted runtime role, generated locally.\nDATABASE_URL=${url.href}\n`;
  await writeFile(".env.local", contents, { mode: 0o600 });
  console.log(
    "Restricted runtime role created; DATABASE_URL saved in gitignored .env.local. No credentials printed.",
  );
} finally {
  await sql.end();
}
