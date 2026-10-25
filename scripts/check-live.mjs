// Explicit live acceptance check. Database fixtures are always rolled back;
// storage writes use one random diagnostic key that is removed in finally.
import nextEnv from "@next/env";
import postgres from "postgres";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadBucketCommand,
} from "@aws-sdk/client-s3";
nextEnv.loadEnvConfig(process.cwd());

const required = [
  "DATABASE_ADMIN_URL",
  "DATABASE_URL",
  "S3_ENDPOINT",
  "S3_BUCKET",
  "S3_ACCESS_KEY_ID",
  "S3_SECRET_ACCESS_KEY",
];
if (required.some((key) => !process.env[key])) {
  console.error(
    `Missing: ${required.filter((key) => !process.env[key]).join(", ")}`,
  );
  process.exit(1);
}
const admin = new URL(process.env.DATABASE_ADMIN_URL);
const runtime = new URL(process.env.DATABASE_URL);
assert.equal(
  admin.hostname.replace("-pooler", ""),
  runtime.hostname.replace("-pooler", ""),
  "Admin and runtime must target the same branch",
);
assert.equal(
  admin.pathname,
  runtime.pathname,
  "Admin and runtime must target the same database",
);
const sql = postgres(process.env.DATABASE_ADMIN_URL, {
  ssl: "require",
  max: 1,
  connect_timeout: 15,
});
const org = randomUUID();
const actor = `sync-check-${randomUUID()}`;
const rollback = new Error("ROLLBACK_SUCCESSFUL_CHECK");
try {
  try {
    await sql.begin(async (tx) => {
      await tx`insert into app.organizations(id,name) values(${org},'Temporary sync check')`;
      await tx`insert into app.memberships(org_id,user_id,email,role) values(${org},${actor},'sync-check@example.invalid','owner')`;
      await tx`insert into app.settings(org_id,value) values(${org},'{}'::jsonb)`;
      // The owner need not inherit the runtime role. This grant is confined to
      // the same rollback-only transaction as the diagnostic fixtures.
      await tx.unsafe("grant spplast_app to current_user");
      await tx.unsafe("set local role spplast_app");
      await tx`select set_config('app.user_id',${actor},true),set_config('app.user_email','sync-check@example.invalid',true)`;
      const date = new Date().toISOString().slice(0, 10);
      const entry = (kind, quantity, input = null) => ({
        id: randomUUID(),
        kind,
        date,
        name: `Sync check ${kind}`,
        quantity,
        bags: [],
        color: "Green",
        color_hex: "#49705a",
        input_lot_id: input,
        input_quantity: input ? quantity : "0",
        remove_photo_ids: [],
      });
      const command = (action, payload, expected = null, id = randomUUID()) =>
        tx`select app.command(${org},${id},${action},${tx.json(payload)}::jsonb,${expected}::integer)`;
      const balance = async (id, expected) =>
        assert.equal(
          Number((await tx`select private.balance(${org},${id}) as q`)[0].q),
          expected,
        );
      const scrap = entry("scrap", "100");
      const commandId = randomUUID();
      await command("save_entry", scrap, null, commandId);
      await command("save_entry", scrap, null, commandId);
      await balance(scrap.id, 100);
      const grinding = entry("grinding", "80", scrap.id);
      await command("save_entry", grinding);
      const granules = entry("granules", "60", grinding.id);
      await command("save_entry", granules);
      const sale = entry("sale", "20", granules.id);
      await command("save_entry", sale);
      await balance(granules.id, 40);
      await command("save_entry", { ...sale, quantity: "10" }, 1);
      await balance(granules.id, 50);
      const workspace = (
        await tx`select app.workspace(${org},${date}::date,${date}::date,0) as data`
      )[0].data;
      assert.equal(workspace.simple_entries.length, 4);
      assert.equal(Number(workspace.stock_totals.granules), 50);
      await command("delete_entry", { id: sale.id }, 2);
      await command("delete_entry", { id: granules.id }, 1);
      await command("delete_entry", { id: grinding.id }, 1);
      await balance(scrap.id, 100);
      await command("delete_entry", { id: scrap.id }, 1);
      await balance(scrap.id, 0);
      throw rollback;
    });
  } catch (error) {
    if (error !== rollback) throw error;
  }
  assert.equal(
    (await sql`select id from app.organizations where id=${org}`).length,
    0,
  );
  console.log(
    "Live Neon: create, edit, delete, inputs, sales, idempotency and workspace totals passed under the app role. All fixtures rolled back.",
  );
} finally {
  await sql.end();
}

const storage = new S3Client({
  endpoint: process.env.S3_ENDPOINT,
  region: process.env.S3_REGION || "us-east-1",
  forcePathStyle: true,
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
  },
  maxAttempts: 2,
});
const Bucket = process.env.S3_BUCKET;
const Key = `_diagnostics/${randomUUID()}.txt`;
let attempted = false;
try {
  await storage.send(new HeadBucketCommand({ Bucket }));
  attempted = true;
  await storage.send(
    new PutObjectCommand({
      Bucket,
      Key,
      Body: "SP Plast storage check",
      ContentType: "text/plain",
    }),
  );
  const object = await storage.send(new GetObjectCommand({ Bucket, Key }));
  assert.equal(await object.Body.transformToString(), "SP Plast storage check");
} finally {
  try {
    if (attempted) await storage.send(new DeleteObjectCommand({ Bucket, Key }));
  } finally {
    storage.destroy();
  }
}
console.log(
  "Live storage: bucket, upload, download and deletion passed. Temporary object removed.",
);
