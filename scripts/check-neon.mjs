import nextEnv from "@next/env";
import { neon } from "@neondatabase/serverless";
nextEnv.loadEnvConfig(process.cwd());
const required = [
  "DATABASE_URL",
  "NEON_AUTH_BASE_URL",
  "NEON_AUTH_COOKIE_SECRET",
  "APP_URL",
  "BOOTSTRAP_ADMIN_EMAIL",
];
const missing = required.filter((k) => !process.env[k]);
if (missing.length) {
  console.error(
    `Unconfigured: ${missing.join(", ")}. Save values in .env or .env.local in ${process.cwd()}. No connection attempted.`,
  );
  process.exit(1);
}
if (process.env.NEON_AUTH_COOKIE_SECRET.length < 32)
  throw new Error("NEON_AUTH_COOKIE_SECRET must have at least 32 characters");
try {
  let url;
  try {
    url = new URL(process.env.DATABASE_URL);
  } catch {
    throw new Error(
      "DATABASE_URL must be a complete PostgreSQL connection URL",
    );
  }
  if (!["postgres:", "postgresql:"].includes(url.protocol))
    throw new Error("DATABASE_URL must use postgresql://");
  if (url.username === "spplast_app")
    throw new Error(
      "spplast_app is a NOLOGIN permissions role. Use the login created by npm run db:provision-runtime.",
    );
  if (!url.username || !url.password)
    throw new Error(
      "DATABASE_URL needs both the runtime username and password",
    );
  const sql = neon(process.env.DATABASE_URL);
  const [role] =
    await sql`select rolname,rolsuper,rolbypassrls from pg_roles where rolname=current_user`;
  if (role.rolsuper || role.rolbypassrls)
    throw new Error(
      "Use a restricted runtime login without superuser/BYPASSRLS",
    );
  const [schema] =
    await sql`select to_regclass('app.simple_entries') is not null as ready`;
  if (!schema.ready)
    throw new Error(
      "The simple-entry schema is missing. Run npm run db:migrate with DATABASE_ADMIN_URL pointing to this same database and branch.",
    );
  const results = await sql.transaction([
    sql.query("set local role spplast_app", []),
    sql.query(
      "select current_user as role,has_table_privilege(current_user,'app.movements','INSERT') as direct_write,(select count(*) from app.lots) as visible_without_identity,to_regprocedure('app.command(uuid,uuid,text,jsonb,integer)') is not null as posting_ready",
      [],
    ),
  ]);
  const check = results[1][0];
  if (
    check.direct_write ||
    Number(check.visible_without_identity) !== 0 ||
    !check.posting_ready
  )
    throw new Error("Database security check failed");
  console.log(
    "Neon database reachable; restricted role, posting function and identity-free RLS isolation verified.",
  );
  console.log(
    "Auth email verification and private object uploads still require a signed-in browser acceptance test.",
  );
  console.log(
    [
      "S3_ENDPOINT",
      "S3_BUCKET",
      "S3_ACCESS_KEY_ID",
      "S3_SECRET_ACCESS_KEY",
    ].every((k) => process.env[k])
      ? "Storage environment present (not connectivity-tested)."
      : "Private storage unconfigured. Photos remain queued until configured.",
  );
} catch (e) {
  console.error(
    `Neon check failed: ${e instanceof Error ? e.message : "Unknown failure"}`,
  );
  process.exitCode = 1;
}
