import { PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import sharp from "sharp";
import { createHash } from "node:crypto";
import { z } from "zod";
import { identity } from "@/lib/auth/server";
import { query } from "@/lib/db/server";
import { storage } from "@/lib/storage";
import { apiError, sameOrigin } from "@/lib/api";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const user = await identity();
    const form = await request.formData();
    const id = z.uuid().parse(form.get("id"));
    const org = z.uuid().parse(form.get("org_id"));
    const record = z.uuid().parse(form.get("record_id"));
    const type = z
      .enum([
        "lot",
        "batch",
        "recipe",
        "job",
        "dispatch",
        "inspection",
        "machine",
      ])
      .parse(form.get("record_type"));
    const file = form.get("file");
    if (
      !(file instanceof File) ||
      file.size > 8 * 1024 * 1024 ||
      !["image/jpeg", "image/png", "image/webp"].includes(file.type)
    )
      throw new Error("Upload a JPEG, PNG or WebP up to 8 MB");
    const tables = {
      lot: "lots",
      batch: "batches",
      recipe: "recipes",
      job: "jobs",
      dispatch: "dispatches",
      inspection: "inspections",
      machine: "machines",
    };
    const records = await query(
      user,
      `select id from app.${tables[type]} where id=$1 and org_id=$2 and private.allowed($2,'operate')`,
      [record, org],
    );
    if (!records.length)
      throw new Error("FORBIDDEN: Attachment record unavailable");
    const client = storage();
    const original = sharp(Buffer.from(await file.arrayBuffer()), {
      limitInputPixels: 40000000,
    }).rotate();
    const [main, thumb] = await Promise.all([
      original
        .clone()
        .resize({
          width: 2000,
          height: 2000,
          fit: "inside",
          withoutEnlargement: true,
        })
        .webp({ quality: 88 })
        .toBuffer(),
      original
        .clone()
        .resize(480, 480, { fit: "inside", withoutEnlargement: true })
        .webp({ quality: 75 })
        .toBuffer(),
    ]);
    // Content-addressed paths cannot overwrite a committed image on a changed retry.
    const digest = createHash("sha256").update(main).digest("hex");
    const path = `${org}/${record}/${id}-${digest}.webp`;
    const thumbnail_path = `${org}/${record}/${id}-${digest}-thumb.webp`;
    const existing = await query<{path: string; record_id: string}>(user,
      "select path,record_id from app.media where id=$1 and org_id=$2", [id, org]);
    if (existing.length) {
      if (existing[0].path !== path || existing[0].record_id !== record) throw new Error("CONFLICT: This photo identifier already belongs to another image");
      return Response.json({id, status: "saved"});
    }
    await Promise.all([
      client.send(
        new PutObjectCommand({
          Bucket: process.env.S3_BUCKET,
          Key: path,
          Body: main,
          ContentType: "image/webp",
        }),
      ),
      client.send(
        new PutObjectCommand({
          Bucket: process.env.S3_BUCKET,
          Key: thumbnail_path,
          Body: thumb,
          ContentType: "image/webp",
        }),
      ),
    ]);
    const payload = {
      id,
      record_id: record,
      record_type: type,
      caption: String(form.get("caption") || "").slice(0, 500),
      category: String(form.get("category") || "material").slice(0, 60),
      path,
      thumbnail_path,
      mime: "image/webp",
      size: main.length,
    };
    // Same upload id and deterministic encoding make retries safe after a lost response.
    const result = await query<{ data: unknown }>(
      user,
      "select app.command($1,$2,$3,$4::jsonb,null) as data",
      [org, id, "media", JSON.stringify(payload)],
    );
    return Response.json(result[0].data);
  } catch (e) {
    return apiError(e);
  }
}
export async function GET(request: Request) {
  try {
    const user = await identity();
    const url = new URL(request.url);
    const id = z.uuid().parse(url.searchParams.get("id"));
    const rows = await query<{ path: string; thumbnail_path: string }>(
      user,
      "select path,thumbnail_path from app.media where id=$1",
      [id],
    );
    if (!rows.length) throw new Error("FORBIDDEN: Media unavailable");
    const signed = await getSignedUrl(
      storage(),
      new GetObjectCommand({
        Bucket: process.env.S3_BUCKET,
        Key: url.searchParams.get("full")
          ? rows[0].path
          : rows[0].thumbnail_path,
      }),
      { expiresIn: 60 },
    );
    return Response.redirect(signed);
  } catch (e) {
    return apiError(e);
  }
}
