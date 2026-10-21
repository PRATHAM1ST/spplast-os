import type { Workspace } from "./types";
import { D, sum, batchMath, productiveHours } from "./math";
export type ReportRow = Record<string, string | number>;
export const reports = [
  ["grinding", "Daily grinding production"],
  ["granules", "Daily granules production"],
  ["shift", "Shift & operator output"],
  ["machine", "Machine production"],
  ["material", "Material production"],
  ["bags", "Bag count & net weight"],
  ["yield", "Batch yield & loss"],
  ["consumption", "Raw material consumption"],
  ["outward", "Production versus dispatch"],
  ["stock", "Current book stock"],
  ["ledger", "Stock movement ledger"],
  ["job", "Customer job work"],
  ["pending", "Job-work pending balances"],
  ["recipe", "Color recipe usage"],
  ["quality", "Quality & rejected batches"],
  ["downtime", "Downtime & performance"],
  ["sales", "Customer sales"],
  ["monthly", "Month-end production"],
] as const;
export function buildReport(w: Workspace, type: string): ReportRow[] {
  const batches = w.batches.filter((b) => b.status === "approved");
  const material = (id: string) =>
    w.materials.find((m) => m.id === id)?.name || id;
  const lot = (id: string) => w.lots.find((l) => l.id === id);
  const party = (id: string | null) =>
    w.parties.find((p) => p.id === id)?.name || "Company";
  if (["grinding", "granules"].includes(type))
    return batches
      .filter((b) => b.process === type)
      .map((b) => ({
        Date: b.date,
        Batch: b.code,
        Operator: b.operator,
        "Input kg": sum(b.inputs.map((i) => i.quantity)).toFixed(3),
        "Usable kg": sum(
          b.outputs.filter((o) => o.kind === "usable").map((o) => o.quantity),
        ).toFixed(3),
        "Loss kg": b.loss_kg,
        Ownership: b.job_id ? "Customer" : "Company",
      }));
  if (["shift", "machine", "material", "monthly"].includes(type)) {
    const groups = new Map<string, ReturnType<typeof D>>();
    for (const b of batches)
      for (const o of b.outputs.filter((o) => o.kind === "usable")) {
        const key =
          type === "shift"
            ? `${w.shifts.find((s) => s.id === b.shift_id)?.name} / ${b.operator} / ${b.process}`
            : type === "machine"
              ? `${w.machines.find((m) => m.id === b.machine_id)?.name} / ${b.process}`
              : type === "material"
                ? `${material(o.material_id)} / ${b.process}`
                : `${b.date.slice(0, 7)} / ${b.process}`;
        groups.set(key, (groups.get(key) || D(0)).plus(o.quantity));
      }
    return [...groups].map(([Group, n]) => ({
      Group,
      "Output kg": n.toFixed(3),
    }));
  }
  if (type === "bags")
    return batches.flatMap((b) =>
      b.outputs.flatMap((o) =>
        o.bags.map((g) => ({
          Batch: b.code,
          Process: b.process,
          Material: material(o.material_id),
          Label: g.label,
          Serial: g.serial || "",
          Bags: g.count,
          "Per bag kg": g.weight,
          Basis: g.mode,
          "Tare kg": g.tare,
          "Net kg": D(g.weight)
            .minus(g.mode === "gross" ? g.tare : 0)
            .times(g.count)
            .toFixed(3),
        })),
      ),
    );
  if (type === "yield")
    return batches.map((b) => ({
      Batch: b.code,
      Process: b.process,
      ...Object.fromEntries(
        Object.entries(batchMath(b)).map(([k, v]) => [k, v ?? "Not measured"]),
      ),
      "Documented loss kg": b.loss_kg,
      Reason: b.loss_reason,
    }));
  if (type === "consumption")
    return batches.flatMap((b) =>
      b.inputs.map((i) => ({
        Date: b.date,
        Batch: b.code,
        Process: b.process,
        Lot: lot(i.lot_id)?.code || i.lot_id,
        Material: material(lot(i.lot_id)?.material_id || ""),
        "Consumed kg": i.quantity,
        Owner: party(lot(i.lot_id)?.owner_party_id || null),
      })),
    );
  if (type === "stock" || type === "pending")
    return w.lots
      .filter((l) => type === "stock" || l.job_id)
      .map((l) => ({
        Lot: l.code,
        Material: material(l.material_id),
        Owner: party(l.owner_party_id),
        "Job order": w.jobs.find((j) => j.id === l.job_id)?.code || "",
        Location: w.locations.find((s) => s.id === l.location_id)?.name || "",
        QC: l.qc,
        "Book kg": l.balance,
        "Physical count": "Not recorded",
      }));
  if (type === "ledger" || type === "outward")
    return w.movements
      .filter(
        (m) =>
          type === "ledger" ||
          ["grinding", "granules", "dispatch", "return"].includes(m.kind),
      )
      .map((m) => ({
        Date: m.date,
        Type: m.kind,
        Lot: lot(m.lot_id)?.code || m.lot_id,
        Owner: party(lot(m.lot_id)?.owner_party_id || null),
        "Signed kg": m.quantity,
        Transaction: m.transaction_id,
        "Source document": m.source_id,
        Actor: m.created_by,
        Reason: m.reason,
      }));
  if (type === "job")
    return w.jobs.map((j) => ({
      Order: j.code,
      Customer: party(j.customer_id),
      Process: j.process,
      Status: j.status,
      "Expected return": j.expected_date,
      "Pending physical kg": sum(
        w.lots.filter((l) => l.job_id === j.id).map((l) => l.balance),
      ).toFixed(3),
      ...(j.rate ? { Rate: j.rate, "Charge basis": j.charge_basis } : {}),
    }));
  if (type === "recipe")
    return w.recipes.map((r) => ({
      Recipe: r.name,
      Version: r.revision,
      Status: r.status,
      Basis: r.basis,
      "Batch count": batches.filter((b) => b.recipe_version_id === r.id).length,
      "Batch IDs": batches
        .filter((b) => b.recipe_version_id === r.id)
        .map((b) => b.code)
        .join("; "),
    }));
  if (type === "quality")
    return w.inspections.map((i) => ({
      Date: i.created_at,
      Lot: lot(i.lot_id)?.code || i.lot_id,
      Disposition: i.disposition,
      Reviewer: i.created_by,
      Shade: i.shade,
      Cleanliness: i.cleanliness,
      Notes: i.notes,
      Tests: i.measurements
        .map((m) => `${m.key}=${m.value} ${m.unit}`)
        .join("; "),
    }));
  if (type === "downtime")
    return batches.map((b) => {
      const hours = productiveHours(
        b.started_at,
        b.ended_at,
        b.downtime_minutes,
      );
      const elapsed = hours.times(60).plus(b.downtime_minutes);
      return {
        Batch: b.code,
        Machine: w.machines.find((m) => m.id === b.machine_id)?.name || "",
        "Productive hours": hours.toFixed(3),
        "Downtime minutes": b.downtime_minutes,
        "Downtime %": elapsed.isZero()
          ? "Not measured"
          : D(b.downtime_minutes).div(elapsed).times(100).toFixed(2),
        "Kg/hour": batchMath(b).kgHour || "Not measured",
        Reason: b.downtime_reason,
      };
    });
  if (type === "sales")
    return w.dispatches.map((d) => ({
      Date: d.date,
      Dispatch: d.code,
      Customer: party(d.customer_id),
      Status: d.status,
      Type: d.job_id ? "Job-work return" : "Company sale",
      "Quantity kg": sum(d.lines.map((l) => l.quantity)).toFixed(3),
      ...(d.rate
        ? {
            "Rate INR": d.rate,
            "Tax %": d.tax_percent || "0",
            "Total INR": d.total || "0",
          }
        : {}),
    }));
  return [];
}
export function safeCSVCell(value: unknown) {
  const text = String(value ?? "");
  const safe =
    /^[=+@\t\r]/.test(text) ||
    (/^\-/.test(text) && !/^\-\d+(\.\d+)?$/.test(text))
      ? `'${text}`
      : text;
  return `"${safe.replaceAll('"', '""')}"`;
}
export function toCSV(rows: ReportRow[]) {
  if (!rows.length) return "";
  const headers = Array.from(new Set(rows.flatMap(Object.keys)));
  return (
    "\uFEFF" +
    [headers, ...rows.map((r) => headers.map((h) => r[h] ?? ""))]
      .map((row) => row.map(safeCSVCell).join(","))
      .join("\r\n")
  );
}
