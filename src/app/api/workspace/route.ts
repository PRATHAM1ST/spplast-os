import { identity } from "@/lib/auth/server";
import { query } from "@/lib/db/server";
import { apiError } from "@/lib/api";
import { z } from "zod";
export async function GET(request: Request) {
  try {
    const user = await identity();
    const url = new URL(request.url);
    const org = z.uuid().parse(url.searchParams.get("org"));
    const from = z.iso.date().parse(url.searchParams.get("from"));
    const to = z.iso.date().parse(url.searchParams.get("to"));
    const offset = z.coerce
      .number()
      .int()
      .min(0)
      .max(1000000)
      .parse(url.searchParams.get("offset") || 0);
    const rows = await query<{ data: unknown }>(
      user,
      "select app.workspace($1,$2,$3,$4) as data",
      [org, from, to, offset],
    );
    return Response.json(rows[0].data);
  } catch (e) {
    return apiError(e);
  }
}
