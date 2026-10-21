import { z } from "zod";
import { identity } from "@/lib/auth/server";
import { query } from "@/lib/db/server";
import { apiError } from "@/lib/api";
export async function GET(request: Request) {
  try {
    const user = await identity();
    const url = new URL(request.url);
    const org = z.uuid().parse(url.searchParams.get("org"));
    const lot = z.uuid().parse(url.searchParams.get("lot"));
    const rows = await query<{ data: unknown }>(
      user,
      "select app.trace($1,$2) as data",
      [org, lot],
    );
    return Response.json(rows[0].data);
  } catch (e) {
    return apiError(e);
  }
}
