import { D } from "./math";
import type {
  Command,
  EntryKind,
  SimpleBag,
  SimpleEntry,
  StockItem,
  Workspace,
} from "./types";

export const entryLabels: Record<EntryKind, string> = {
  scrap: "Scrap in",
  grinding: "Grinding output",
  granules: "Granules output",
  sale: "Material sold",
};
export const stockKind = (form: string): EntryKind =>
  form === "grinding_flakes"
    ? "grinding"
    : form === "granules"
      ? "granules"
      : "scrap";
export const entryForm = (kind: EntryKind) =>
  kind === "grinding"
    ? "grinding_flakes"
    : kind === "granules"
      ? "granules"
      : "incoming_scrap";
export function bagWeight(bags: SimpleBag[]) {
  return bags
    .reduce(
      (total, bag) => total.plus(D(bag.weight || 0).times(bag.count || 0)),
      D(0),
    )
    .toFixed(3);
}

// Project the encrypted queue over the last server snapshot for instant offline stock.
export function simpleView(data: Workspace, commands: Command[]) {
  const entries = new Map((data.simple_entries || []).map((e) => [e.id, e]));
  const stock = new Map((data.simple_stock || []).map((s) => [s.id, { ...s }]));
  const totals = {
    scrap: "0",
    grinding: "0",
    granules: "0",
    ...data.stock_totals,
  };
  for (const command of commands) {
    if (!["save_entry", "delete_entry"].includes(command.action)) continue;
    const p = command.payload as unknown as SimpleEntry;
    const old = entries.get(p.id);
    if (!old && command.expected_version !== undefined) continue;
    if (!old && command.expected_version === undefined && stock.has(p.id))
      continue;
    if (old && command.expected_version === undefined) continue;
    if (old && command.expected_version !== old.version) continue;
    if (!old && command.action === "delete_entry") continue;
    const next =
      command.action === "save_entry"
        ? {
            ...p,
            org_id: data.org_id,
            created_at: old?.created_at || new Date().toISOString(),
            updated_at: new Date().toISOString(),
            created_by: old?.created_by || "",
            deleted: false,
            version: (old?.version || 0) + 1,
          }
        : null;
    const deltas = new Map<string, ReturnType<typeof D>>();
    const add = (id: string | null, amount: string, sign: number) => {
      if (id)
        deltas.set(id, (deltas.get(id) || D(0)).plus(D(amount).times(sign)));
    };
    if (old) {
      if (old.kind !== "sale") add(old.id, old.quantity, -1);
      add(old.input_lot_id, old.input_quantity, 1);
    }
    if (next) {
      if (next.kind !== "sale") add(next.id, next.quantity, 1);
      add(
        next.input_lot_id,
        next.kind === "sale" ? next.quantity : next.input_quantity,
        -1,
      );
    }
    if (
      [...deltas].some(([id, q]) =>
        D(stock.get(id)?.quantity || 0)
          .plus(q)
          .lt(0),
      )
    )
      continue;
    for (const [id, delta] of deltas) {
      const entry =
        id === next?.id ? next : id === old?.id ? old : entries.get(id);
      const previous = stock.get(id);
      const item: StockItem = entry
        ? {
            id,
            code: previous?.code || "",
            name: entry.name,
            color: entry.color,
            color_hex: entry.color_hex,
            form: entryForm(entry.kind),
            qc: "pass",
            quantity: previous?.quantity || "0",
          }
        : previous || {
            id,
            code: "",
            name: "Material",
            color: "",
            color_hex: "#ded8bd",
            form: "incoming_scrap",
            qc: "pass",
            quantity: "0",
          };
      item.quantity = D(item.quantity).plus(delta).toFixed(3);
      stock.set(id, item);
      const kind = stockKind(item.form) as "scrap" | "grinding" | "granules";
      totals[kind] = D(totals[kind]).plus(delta).toFixed(3);
    }
    if (next) entries.set(next.id, next);
    else entries.delete(p.id);
  }
  return {
    entries: [...entries.values()].sort(
      (a, b) =>
        b.date.localeCompare(a.date) ||
        b.created_at.localeCompare(a.created_at),
    ),
    stock: [...stock.values()].filter((s) => D(s.quantity).gt(0)),
    totals,
  };
}
