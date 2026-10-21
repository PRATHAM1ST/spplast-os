import "server-only";
import { neon } from "@neondatabase/serverless";
export async function query<T>(
  user: { id: string; email: string },
  statement: string,
  params: unknown[] = [],
): Promise<T[]> {
  if (!process.env.DATABASE_URL)
    throw new Error("UNCONFIGURED: Neon database is not connected");
  const sql = neon(process.env.DATABASE_URL);
  const results = await sql.transaction([
    sql.query("set local role spplast_app", []),
    sql`select set_config('app.user_id',${user.id},true),set_config('app.user_email',${user.email},true)`,
    sql.query(statement, params),
  ]);
  return results[2] as T[];
}
