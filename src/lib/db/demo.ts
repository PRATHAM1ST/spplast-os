import { PGlite } from '@electric-sql/pglite';
import { migrations } from './migrations';
import type { Command, Workspace } from '@/lib/domain/types';
import { seedDemo, DEMO_ORG, DEMO_USER } from './seed';
let instance: Promise<PGlite> | undefined;
export function demoDB() {
  return instance ??= (async () => {
    const db = new PGlite('idb://spplast-demo-postgres-v1'); await db.waitReady;
    const exists = await db.query<{ present: string | null }>("select to_regclass('app.organizations')::text as present");
    if (!exists.rows[0].present) { await db.exec(migrations); await seedDemo(db); }
    return db;
  })();
}
export async function demoCommand(c: Command) {
  const db = await demoDB();
  return db.transaction(async tx => { await tx.query("select set_config('app.user_id',$1,true)", [DEMO_USER]); return tx.query('select app.command($1,$2,$3,$4::jsonb,$5)', [c.org_id, c.id, c.action, JSON.stringify(c.payload), c.expected_version ?? null]); });
}
export async function demoWorkspace(from: string, to: string, offset = 0) {
  const db = await demoDB();
  return db.transaction(async tx => {
    await tx.query("select set_config('app.user_id',$1,true)", [DEMO_USER]);
    await tx.exec('set local role spplast_app');
    const result = await tx.query<{ data: Workspace }>('select app.workspace($1,$2,$3,$4) as data', [DEMO_ORG, from, to, offset]);
    return result.rows[0].data;
  });
}
export async function resetDemo() { const db = await demoDB(); await db.exec('drop schema app cascade; drop schema private cascade;'); await db.exec(migrations); await seedDemo(db); }
