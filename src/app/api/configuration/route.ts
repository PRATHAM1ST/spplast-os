import {z} from "zod";
import {identity} from "@/lib/auth/server";
import {query} from "@/lib/db/server";
import {apiError} from "@/lib/api";
export async function GET(request:Request) {
  try {
    const user=await identity();
    const org=z.uuid().parse(new URL(request.url).searchParams.get("org"));
    const [row]=await query<{allowed:boolean}>(user,"select private.allowed($1,'configure') as allowed",[org]);
    if(!row?.allowed)throw new Error("FORBIDDEN");
    return Response.json({database:"connected",auth:"authenticated",storage:["S3_ENDPOINT","S3_BUCKET","S3_ACCESS_KEY_ID","S3_SECRET_ACCESS_KEY"].every(k=>process.env[k])?"configured_unverified":"unconfigured"});
  }catch(e){return apiError(e);}
}
