import { identity } from '@/lib/auth/server';
import { query } from '@/lib/db/server';
import { apiError, sameOrigin } from '@/lib/api';
export async function POST(request: Request) {
  try {
    sameOrigin(request); const user = await identity();
    if (!user.verified || user.email.toLowerCase() !== process.env.BOOTSTRAP_ADMIN_EMAIL?.toLowerCase()) throw new Error('FORBIDDEN: Verify the configured administrator email first');
    const rows = await query<{ org_id: string }>(user, 'select app.bootstrap($1,$2) as org_id', [user.email, 'SP Plast Industries']);
    return Response.json(rows[0]);
  } catch (e) { return apiError(e); }
}
