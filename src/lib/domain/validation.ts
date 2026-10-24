import { z } from "zod";
export const quantity = z
  .string()
  .regex(/^\d{1,12}(\.\d{1,3})?$/, "Use kg with up to 3 decimal places");
export const id = z.uuid();
export const bagSchema = z.object({
  id,
  label: z.string().max(100),
  count: z.number().int().min(1).max(100000),
  weight: quantity,
  tare: quantity,
  mode: z.enum(["net", "gross"]),
  serial: z.string().max(100).optional(),
});
export const inputSchema = z.object({
  lot_id: id,
  quantity: quantity.refine(
    (v) => Number(v) > 0,
    "Quantity must be greater than zero",
  ),
});
export const outputSchema = z.object({
  id,
  material_id: id,
  location_id: id,
  quantity,
  bags: z.array(bagSchema),
  disposition: z.enum(["hold", "pass", "rework", "reject"]),
  kind: z.enum(["usable", "scrap", "rework"]),
});
export const batchSchema = z.object({
  id,
  code: z.string().max(100),
  date: z.iso.date(),
  process: z.enum(["grinding", "granules"]),
  machine_id: id,
  shift_id: id,
  operator: z.string().min(1).max(100),
  supervisor: z.string().max(100),
  job_id: id.nullable(),
  inputs: z.array(inputSchema).min(1),
  outputs: z.array(outputSchema).min(1),
  loss_kg: quantity,
  loss_reason: z.string().max(1000),
  notes: z.string().max(5000),
  started_at: z.string().nullable(),
  ended_at: z.string().nullable(),
  downtime_minutes: z.number().int().min(0),
  downtime_reason: z.string().max(1000),
  recipe_version_id: id.nullable(),
  target_input_kg: quantity.optional(),
  recipe_actuals: z.array(z.object({ ingredient_id: id, quantity })),
  readings: z.array(
    z.object({
      key: z.string(),
      value: z.string(),
      unit: z.string(),
      measured_at: z.string(),
    }),
  ),
});
export const commandSchema = z.object({
  id,
  org_id: id,
  action: z.enum([
    "inward",
    "save_batch",
    "submit_batch",
    "approve_batch",
    "save_recipe",
    "approve_recipe",
    "dispatch",
    "save_job",
    "qc",
    "transfer",
    "adjust",
    "reverse",
    "return",
    "master",
    "settings",
    "membership",
    "lock_day",
    "media",
    "save_entry",
    "delete_entry",
  ]),
  payload: z.record(z.string(), z.unknown()),
  expected_version: z.number().int().nonnegative().optional(),
});
export function validateCommand(value: unknown) {
  const c = commandSchema.parse(value);
  if (c.action === "save_entry") c.payload = simpleEntrySchema.parse(c.payload);
  if (c.action === "delete_entry")
    c.payload = z.object({ id }).parse(c.payload);
  if (c.action === "save_batch") c.payload = batchSchema.parse(c.payload);
  if (c.action === "master") {
    const field = z.object({
      key: z.string().regex(/^[a-z][a-z0-9_]*$/),
      label: z.string().min(1).max(100),
      type: z.enum(["number", "text", "select"]),
      unit: z.string().max(30),
      required: z.boolean(),
      options: z.array(z.string().max(100)).optional(),
      min: z.number().optional(),
      max: z.number().optional(),
    });
    const common = { id, name: z.string().min(1).max(150) };
    const schemas = {
      materials: z.object({
        ...common,
        code: z.string().min(1).max(50),
        polymer: z.string().min(1).max(50),
        form: z.enum([
          "incoming_scrap",
          "grinding_flakes",
          "mixed_feedstock",
          "granules",
          "waste",
          "other",
        ]),
        color: z.string().max(100).default(""),
        color_hex: z.string().regex(/^#[a-fA-F0-9]{6}$/),
        grade: z.string().max(100).default(""),
        active: z.boolean(),
        notes: z.string().max(5000).default(""),
      }),
      parties: z.object({
        ...common,
        kind: z.enum(["supplier", "customer", "both"]),
        phone: z.string().max(30),
        gstin: z.string().max(30),
        address: z.string().max(1000),
      }),
      locations: z.object({ ...common, code: z.string().min(1).max(50) }),
      shifts: z.object({
        ...common,
        starts_at: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/),
        ends_at: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/),
      }),
      machines: z.object({
        ...common,
        code: z.string().min(1).max(50),
        category: z.enum([
          "grinder",
          "extruder",
          "washing",
          "drying",
          "custom",
        ]),
        status: z.enum(["available", "running", "maintenance", "inactive"]),
        capacity_kg_hour: z.union([
          quantity,
          z.number().nonnegative(),
          z.null(),
        ]),
        parameters: z.array(field).max(50),
        notes: z.string().max(5000),
      }),
    };
    const table = z
      .enum(["materials", "parties", "locations", "shifts", "machines"])
      .parse(c.payload.table);
    c.payload = { table, record: schemas[table].parse(c.payload.record) };
  }
  if (c.action === "inward")
    c.payload = z
      .object({
        id,
        code: z.string().min(1).max(100),
        date: z.iso.date(),
        material_id: id,
        location_id: id,
        gross: quantity,
        tare: quantity,
        bags: z.number().int().nonnegative(),
        party_id: id.nullable(),
        owner_party_id: id.nullable(),
        job_id: id.nullable(),
        reference: z.string().max(200),
        vehicle: z.string().max(100),
        notes: z.string().max(5000),
      })
      .parse(c.payload);
  return c;
}
export const simpleEntrySchema = z.object({
  id,
  kind: z.enum(["scrap", "grinding", "granules", "sale"]),
  date: z.iso.date(),
  name: z.string().trim().min(1).max(150),
  color: z.string().max(100),
  color_hex: z.string().regex(/^#[a-fA-F0-9]{6}$/),
  quantity: quantity.refine(
    (v) => Number(v) > 0,
    "Enter a weight greater than zero",
  ),
  bags: z
    .array(
      z.object({
        count: z.number().int().min(1).max(100000),
        weight: quantity.refine((v) => Number(v) > 0),
      }),
    )
    .max(100),
  input_lot_id: id.nullable(),
  input_quantity: quantity,
  remove_photo_ids: z.array(id).max(100).default([]),
});
