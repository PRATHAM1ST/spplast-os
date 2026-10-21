import { configured, identity } from "@/lib/auth/server";
import { query } from "@/lib/db/server";
import { apiError } from "@/lib/api";
import type { Session } from "@/lib/domain/types";
export async function GET() {
  if (!configured()) return Response.json({ configured: false });
  try {
    const user = await identity();
    const rows = await query<Session>(
      user,
      "select user_id,email,org_id,role,permissions from app.memberships where user_id=$1 order by org_id limit 1",
      [user.id],
    );
    return Response.json({
      configured: true,
      session: rows[0] ? { ...rows[0], demo: false } : null,
      needsOnboarding: !rows.length,
      email: user.email,
    });
  } catch (e) {
    return apiError(e);
  }
}
