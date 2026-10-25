import { readdir, readFile } from "node:fs/promises";
import {
  migrationChecksum,
  matchesMigrationChecksum,
} from "./migration-checksum.mjs";
import postgres from "postgres";
import nextEnv from "@next/env";
nextEnv.loadEnvConfig(process.cwd());
if (!process.env.DATABASE_ADMIN_URL)
  throw new Error("Set DATABASE_ADMIN_URL in .env.local to migrate Neon");
const sql = postgres(process.env.DATABASE_ADMIN_URL, {
  max: 1,
  ssl: "require",
});
try {
  await sql`create table if not exists public.spplast_migrations(name text primary key,checksum text not null,applied_at timestamptz default now())`;
  for (const name of (await readdir("db/migrations"))
    .filter((n) => n.endsWith(".sql"))
    .sort()) {
    const source = await readFile(`db/migrations/${name}`, "utf8");
    const checksum = migrationChecksum(source);
    const existing =
      await sql`select checksum from public.spplast_migrations where name=${name}`;
    if (existing.length) {
      if (!matchesMigrationChecksum(source, existing[0].checksum))
        throw new Error(`Applied migration changed: ${name}`);
      continue;
    }
    await sql.begin(async (tx) => {
      await tx.unsafe(source);
      await tx`insert into public.spplast_migrations(name,checksum) values(${name},${checksum})`;
    });
    console.log(`Applied ${name}`);
  }
  if (process.env.BOOTSTRAP_ADMIN_EMAIL)
    await sql`insert into private.installation values('bootstrap_email',${process.env.BOOTSTRAP_ADMIN_EMAIL.toLowerCase()}) on conflict(key) do update set value=excluded.value`;
  console.log(
    "Migrations complete. Grant spplast_app to a separate runtime login; put its URL in DATABASE_URL.",
  );
} finally {
  await sql.end();
}
