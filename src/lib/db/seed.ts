import type { PGlite } from "@electric-sql/pglite";
import { today, uid } from "@/lib/utils";
export const DEMO_ORG = "00000000-0000-4000-8000-000000000001";
export const DEMO_USER = "demo-owner";
export async function seedDemo(db: PGlite) {
  await db.query("select set_config('app.user_id',$1,false)", [DEMO_USER]);
  await db.query("insert into app.organizations(id,name) values($1,$2)", [
    DEMO_ORG,
    "SP Plast • Demonstration",
  ]);
  await db.query(
    "insert into app.memberships values($1,$2,'demo@spplast.local','owner','{}')",
    [DEMO_ORG, DEMO_USER],
  );
  await db.query("insert into app.settings values($1,$2::jsonb)", [
    DEMO_ORG,
    JSON.stringify({
      company_name: "SP Plast Industries",
      site_name: "Ahmedabad · Demo factory",
      bag_presets: [25, 30, 35, 50],
      photo_limit_mb: 8,
      qc_fields: [],
      loss_tolerance_percent: "0",
      locale: "en",
      tax_rates: [],
    }),
  ]);
  const cmd = async (
    action: string,
    payload: Record<string, unknown>,
    expected?: number,
  ) =>
    db.query("select app.command($1,$2,$3,$4::jsonb,$5)", [
      DEMO_ORG,
      uid(),
      action,
      JSON.stringify(payload),
      expected ?? null,
    ]);
  const master = async (table: string, record: Record<string, unknown>) =>
    cmd("master", { table, record });
  const raw = uid(),
    ground = uid(),
    granules = uid(),
    loc = uid(),
    grinder = uid(),
    extruder = uid(),
    shift = uid(),
    customer = uid();
  for (const m of [
    {
      id: raw,
      code: "PP-RAW",
      name: "PP incoming scrap",
      polymer: "PP",
      form: "incoming_scrap",
      color: "Mixed",
      color_hex: "#acb3a6",
    },
    {
      id: ground,
      code: "PP-GRD",
      name: "PP natural grinding",
      polymer: "PP",
      form: "grinding_flakes",
      color: "Natural",
      color_hex: "#c9c6b3",
    },
    {
      id: granules,
      code: "PP-GRN",
      name: "PP forest green granules",
      polymer: "PP",
      form: "granules",
      color: "Forest green",
      color_hex: "#49705a",
    },
  ])
    await master("materials", m);
  for (const polymer of [
    "CP",
    "HDPE",
    "LDPE",
    "ABS",
    "PC",
    "HI",
    "PS",
    "Other",
  ])
    await master("materials", {
      id: uid(),
      code: polymer,
      name: polymer,
      polymer,
      form: "incoming_scrap",
    });
  await master("locations", {
    id: loc,
    name: "Demo main storage",
    code: "MAIN",
  });
  await master("machines", {
    id: grinder,
    name: "Demo grinder 01",
    code: "DEMO-G01",
    category: "grinder",
    notes: "Fictional machine. Configure actual equipment before factory use.",
  });
  await master("machines", {
    id: extruder,
    name: "Demo extruder 01",
    code: "DEMO-E01",
    category: "extruder",
    notes: "Fictional equipment; no temperature targets assumed.",
  });
  await master("shifts", {
    id: shift,
    name: "Demo day shift",
    starts_at: "08:00",
    ends_at: "20:00",
  });
  await master("parties", {
    id: customer,
    name: "Sample customer • DEMO",
    kind: "customer",
  });
  const day = today();
  const rawLot = uid();
  await cmd("inward", {
    id: rawLot,
    code: `RAW-${day.replaceAll("-", "")}-DEMO`,
    date: day,
    material_id: raw,
    location_id: loc,
    gross: "1000",
    tare: "0",
    bags: 40,
    notes: "Fictional demonstration opening stock",
  });
  await cmd(
    "qc",
    { lot_id: rawLot, disposition: "pass", notes: "Demo inspection" },
    1,
  );
  async function produce(
    process: string,
    input: string,
    material: string,
    amount: string,
    out: string,
    loss: string,
    machine: string,
    bags: number,
    bagWeight: string,
  ) {
    const batch = uid(),
      output = uid();
    await cmd("save_batch", {
      id: batch,
      code: `${process === "grinding" ? "GRD" : "GRN"}-DEMO-${batch.slice(0, 6)}`,
      date: day,
      process,
      machine_id: machine,
      shift_id: shift,
      operator: "Demo operator",
      supervisor: "Demo supervisor",
      job_id: null,
      inputs: [{ lot_id: input, quantity: amount }],
      outputs: [
        {
          id: output,
          material_id: material,
          location_id: loc,
          quantity: out,
          disposition: "hold",
          kind: "usable",
          bags: [
            {
              id: uid(),
              label: "Weighed bags",
              count: bags,
              weight: bagWeight,
              tare: "0",
              mode: "net",
            },
          ],
        },
      ],
      loss_kg: loss,
      loss_reason: "Fictional documented process loss",
      notes: "Demonstration only",
      started_at: `${day}T08:00:00+05:30`,
      ended_at: `${day}T12:00:00+05:30`,
      downtime_minutes: 15,
      downtime_reason: "Demo cleaning",
      recipe_version_id: null,
      recipe_actuals: [],
      readings: [],
    });
    await cmd("submit_batch", { id: batch }, 1);
    await cmd("approve_batch", { id: batch }, 2);
    await cmd(
      "qc",
      { lot_id: output, disposition: "pass", notes: "Demo QC review" },
      1,
    );
    return output;
  }
  const grinding = await produce(
    "grinding",
    rawLot,
    ground,
    "600",
    "570",
    "30",
    grinder,
    19,
    "30",
  );
  const finished = await produce(
    "granules",
    grinding,
    granules,
    "400",
    "380",
    "20",
    extruder,
    19,
    "20",
  );
  await cmd("dispatch", {
    id: uid(),
    code: "DSP-DEMO-001",
    date: day,
    customer_id: customer,
    job_id: null,
    lines: [{ lot_id: finished, quantity: "120" }],
    bags: 6,
    vehicle: "DEMO VEHICLE",
    reference: "Demo challan",
    notes: "Fictional dispatch",
    rate: "65",
    tax_percent: "0",
    transport: "0",
    discount: "0",
    supply_location: "Demo only",
    tax_effective_date: day,
  });
  const job = uid();
  await cmd("save_job", {
    id: job,
    code: "JW-DEMO-001",
    customer_id: customer,
    process: "grinding",
    material_id: raw,
    expected_date: day,
    notes: "Customer-owned demonstration material",
    rate: "5",
    charge_basis: "input_kg",
  });
  await cmd("inward", {
    id: uid(),
    code: "JW-RAW-DEMO-001",
    date: day,
    material_id: raw,
    location_id: loc,
    gross: "500",
    tare: "0",
    bags: 20,
    job_id: job,
    owner_party_id: customer,
    notes: "Customer-owned stock; excluded from company inventory",
  });
  await cmd("save_recipe", {
    id: uid(),
    master_id: uid(),
    name: "Fictional green study • DEMO",
    color: "Forest green",
    color_hex: "#49705a",
    polymer: "PP",
    basis: "total_percent",
    base_quantity: "100",
    change_reason: "Educational sample only; not a production formula",
    notes: "Fictional placeholders. Never use as manufacturing instructions.",
    ingredients: [
      {
        id: uid(),
        name: "Fictional base A",
        material_id: null,
        category: "base_resin",
        amount: "99",
        unit: "%",
        is_base: true,
      },
      {
        id: uid(),
        name: "Fictional additive B",
        material_id: null,
        category: "sample",
        amount: "1",
        unit: "%",
        is_base: false,
      },
    ],
  });
}
