import { PGlite } from "@electric-sql/pglite";
import { beforeAll, afterAll, expect, test } from "vitest";
import { migrations } from "@/lib/db/migrations";
import { seedDemo, DEMO_ORG, DEMO_USER } from "@/lib/db/seed";
import { uid, today } from "@/lib/utils";
import { simpleView } from "@/lib/domain/simple";
import type { Workspace } from "@/lib/domain/types";
let db: PGlite;
beforeAll(async () => {
  db = new PGlite();
  await db.exec(migrations);
  await seedDemo(db);
});
afterAll(async () => {
  await db.close();
});
const payload = (kind = "grinding", quantity = "100") => ({
  id: uid(),
  kind,
  date: today(),
  name: `Test ${kind}`,
  color: "Green",
  color_hex: "#49705a",
  quantity,
  bags: [],
  input_lot_id: null as string | null,
  input_quantity: "0",
  remove_photo_ids: [],
});
async function command(
  action: string,
  p: Record<string, unknown>,
  expected?: number,
  key = uid(),
) {
  return db.query("select app.command($1,$2,$3,$4::jsonb,$5)", [
    DEMO_ORG,
    key,
    action,
    JSON.stringify(p),
    expected ?? null,
  ]);
}
async function balance(id: string) {
  return Number(
    (
      await db.query<{ q: string }>("select private.balance($1,$2)::text q", [
        DEMO_ORG,
        id,
      ])
    ).rows[0].q,
  );
}
test("output-only create, edit and delete update stock exactly once", async () => {
  const p = payload(),
    key = uid();
  await command("save_entry", p, undefined, key);
  await command("save_entry", p, undefined, key);
  expect(await balance(p.id)).toBe(100);
  await command("save_entry", { ...p, quantity: "150" }, 1);
  expect(await balance(p.id)).toBe(150);
  await expect(
    command("save_entry", { ...p, quantity: "180" }, 1),
  ).rejects.toThrow(/CONFLICT/);
  await command("delete_entry", { id: p.id }, 2);
  expect(await balance(p.id)).toBe(0);
  expect(
    (
      await db.query<{ deleted: boolean }>(
        "select deleted from app.simple_entries where id=$1",
        [p.id],
      )
    ).rows[0].deleted,
  ).toBe(true);
});
test("optional grinding input, sale, and deleting dependent entries restore stock", async () => {
  const grind = payload(),
    granules = {
      ...payload("granules", "90"),
      input_lot_id: grind.id,
      input_quantity: "100",
    };
  await command("save_entry", grind);
  await command("save_entry", granules);
  expect(await balance(grind.id)).toBe(0);
  expect(await balance(granules.id)).toBe(90);
  await expect(command("delete_entry", { id: grind.id }, 1)).rejects.toThrow(
    /already used or sold/,
  );
  const sale = {
    ...payload("sale", "40"),
    input_lot_id: granules.id,
    input_quantity: "40",
  };
  await command("save_entry", sale);
  expect(await balance(granules.id)).toBe(50);
  await command(
    "save_entry",
    { ...sale, quantity: "30", input_quantity: "30" },
    1,
  );
  expect(await balance(granules.id)).toBe(60);
  await expect(
    command("save_entry", { ...granules, quantity: "20" }, 1),
  ).rejects.toThrow(/already used or sold/);
  await command("delete_entry", { id: sale.id }, 2);
  expect(await balance(granules.id)).toBe(90);
  await command("delete_entry", { id: granules.id }, 1);
  expect(await balance(granules.id)).toBe(0);
  expect(await balance(grind.id)).toBe(100);
});
test("scrap trading reduces the selected stock and rejects overselling", async () => {
  const scrap = payload("scrap", "75");
  await command("save_entry", scrap);
  await expect(
    command("save_entry", {
      ...payload("sale", "80"),
      input_lot_id: scrap.id,
      input_quantity: "80",
    }),
  ).rejects.toThrow(/already used or sold/);
  expect(await balance(scrap.id)).toBe(75);
  await command("save_entry", {
    ...payload("sale", "25"),
    input_lot_id: scrap.id,
    input_quantity: "25",
  });
  expect(await balance(scrap.id)).toBe(50);
});
test("bag totals, self input, and permissions are enforced by the database", async () => {
  const p = payload();
  await expect(
    command("save_entry", { ...p, bags: [{ count: 2, weight: "25" }] }),
  ).rejects.toThrow(/Bag weights/);
  await expect(
    command("save_entry", { ...p, input_lot_id: p.id, input_quantity: "100" }),
  ).rejects.toThrow(/own output/);
  await db.query("select set_config('app.user_id','stranger',false)");
  await expect(command("save_entry", p)).rejects.toThrow(/FORBIDDEN/);
  await db.query("select set_config('app.user_id',$1,false)", [DEMO_USER]);
  await command("save_entry", { ...p, bags: [{ count: 4, weight: "25" }] });
  expect(await balance(p.id)).toBe(100);
});
test("workspace and offline projection agree after create/update/delete sequences", async () => {
  const w = (
    await db.query<{ data: Workspace }>("select app.workspace($1,$2,$2) data", [
      DEMO_ORG,
      today(),
    ])
  ).rows[0].data;
  const p = payload("scrap", "50");
  const commands = [
    { id: uid(), org_id: DEMO_ORG, action: "save_entry", payload: p },
    {
      id: uid(),
      org_id: DEMO_ORG,
      action: "save_entry",
      payload: { ...p, quantity: "100" },
      expected_version: 1,
    },
  ];
  const local = simpleView(w, commands);
  expect(local.stock.find((s) => s.id === p.id)?.quantity).toBe("100.000");
  expect(local.entries.find((e) => e.id === p.id)?.version).toBe(2);
  for (const c of commands)
    await command(c.action, c.payload, c.expected_version, c.id);
  const fresh = (
    await db.query<{ data: Workspace }>("select app.workspace($1,$2,$2) data", [
      DEMO_ORG,
      today(),
    ])
  ).rows[0].data;
  expect(simpleView(fresh, commands).totals).toEqual(fresh.stock_totals);
  expect(fresh.simple_stock?.find((s) => s.id === p.id)?.quantity).toBe(
    "100.000",
  );
});
test("a queued edit outside the loaded date range does not double-count stock", async () => {
  const p = payload("scrap", "50");
  await command("save_entry", p);
  const w = (
    await db.query<{ data: Workspace }>(
      "select app.workspace($1,'2020-01-01','2020-01-02') data",
      [DEMO_ORG],
    )
  ).rows[0].data;
  const projected = simpleView(w, [
    {
      id: uid(),
      org_id: DEMO_ORG,
      action: "save_entry",
      payload: { ...p, quantity: "75" },
      expected_version: 1,
    },
  ]);
  expect(projected.totals).toEqual(w.stock_totals);
});
