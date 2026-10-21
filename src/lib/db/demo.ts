import { PGlite } from "@electric-sql/pglite";
import { migrations, migrationFiles } from "./migrations";
import type { Command, Workspace } from "@/lib/domain/types";
import { seedDemo, DEMO_ORG, DEMO_USER } from "./seed";
import type { Trace } from "@/lib/domain/trace";
let instance: Promise<PGlite> | undefined;
export function demoDB() {
  return (instance ??= (async () => {
    const db = new PGlite("idb://spplast-demo-postgres-v1");
    await db.waitReady;
    const exists = await db.query<{ present: string | null }>(
      "select to_regclass('app.organizations')::text as present",
    );
    if (!exists.rows[0].present) {
      await db.exec(migrations);
      await seedDemo(db);
    }
    await db.exec(
      "create table if not exists public.demo_migrations(name text primary key, checksum text not null)",
    );
    for (const file of migrationFiles) {
      const previous = await db.query<{ checksum: string }>(
        "select checksum from public.demo_migrations where name=$1",
        [file.name],
      );
      if (previous.rows[0]?.checksum === file.checksum) continue;
      if (previous.rows.length)
        throw new Error(
          `Demo migration ${file.name} changed. Export any demo work and reset the isolated demo from Settings.`,
        );
      if (exists.rows[0].present) {
        // Upgrade development previews predating migration tracking without deleting their records.
        if (file.name.startsWith("002") || file.name.startsWith("003"))
          await db.exec(
            file.sql
              .replaceAll("create function ", "create or replace function ")
              .replace(
                "create table private.installation",
                "create table if not exists private.installation",
              ),
          );
        else if (!file.name.startsWith("001")) await db.exec(file.sql);
      }
      await db.query("insert into public.demo_migrations values($1,$2)", [
        file.name,
        file.checksum,
      ]);
    }
    return db;
  })());
}
export async function demoCommand(c: Command) {
  const db = await demoDB();
  return db.transaction(async (tx) => {
    await tx.query("select set_config('app.user_id',$1,true)", [DEMO_USER]);
    return tx.query("select app.command($1,$2,$3,$4::jsonb,$5)", [
      c.org_id,
      c.id,
      c.action,
      JSON.stringify(c.payload),
      c.expected_version ?? null,
    ]);
  });
}
export async function demoWorkspace(from: string, to: string, offset = 0) {
  const db = await demoDB();
  return db.transaction(async (tx) => {
    await tx.query("select set_config('app.user_id',$1,true)", [DEMO_USER]);
    await tx.exec("set local role spplast_app");
    const result = await tx.query<{ data: Workspace }>(
      "select app.workspace($1,$2,$3,$4) as data",
      [DEMO_ORG, from, to, offset],
    );
    return result.rows[0].data;
  });
}
export async function resetDemo() {
  const db = await demoDB();
  await db.exec("drop schema app cascade; drop schema private cascade;");
  await db.exec(migrations);
  await seedDemo(db);
  await db.exec("truncate public.demo_migrations");
  for (const file of migrationFiles)
    await db.query("insert into public.demo_migrations values($1,$2)", [
      file.name,
      file.checksum,
    ]);
}
export async function demoTrace(id: string) {
  const db = await demoDB();
  return db.transaction(async (tx) => {
    await tx.query("select set_config('app.user_id',$1,true)", [DEMO_USER]);
    await tx.exec("set local role spplast_app");
    return (
      await tx.query<{ data: Trace }>("select app.trace($1,$2) as data", [
        DEMO_ORG,
        id,
      ])
    ).rows[0].data;
  });
}
