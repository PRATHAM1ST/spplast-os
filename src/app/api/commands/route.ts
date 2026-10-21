import { identity } from "@/lib/auth/server";
import { query } from "@/lib/db/server";
import { apiError, sameOrigin } from "@/lib/api";
import { validateCommand } from "@/lib/domain/validation";
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const user = await identity();
    const raw = await request.text();
    if (raw.length > 500000) throw new Error("Request too large");
    const c = validateCommand(JSON.parse(raw));
    if (c.action === "media")
      throw new Error("Use the verified media upload endpoint");
    const rows = await query<{ data: unknown }>(
      user,
      "select app.command($1,$2,$3,$4::jsonb,$5) as data",
      [
        c.org_id,
        c.id,
        c.action,
        JSON.stringify(c.payload),
        c.expected_version ?? null,
      ],
    );
    return Response.json(rows[0].data);
  } catch (e) {
    return apiError(e);
  }
}
