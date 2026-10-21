"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useWorkspace } from "./providers";
import { fetchJSON } from "@/lib/offline/sync";
import { read, seal } from "@/lib/offline/vault";
import type { Trace } from "@/lib/domain/trace";
import { Badge, Loading } from "./ui/common";
import { kg, dateLabel } from "@/lib/utils";
export function LotTrace({ id }: { id: string }) {
  const { session } = useWorkspace();
  const [selected, setSelected] = useState(id);
  const { data, error, isLoading } = useQuery({
    queryKey: ["trace", session.user_id, id],
    queryFn: async () => {
      const key = `${session.user_id}:trace:${id}`;
      try {
        const trace = session.demo
          ? await (await import("@/lib/db/demo")).demoTrace(id)
          : await fetchJSON<Trace>(
              `/api/trace?org=${session.org_id}&lot=${id}`,
            );
        await seal(key, "cache", trace, "synced");
        return { trace, cached: false };
      } catch (e) {
        if (e instanceof Error && /FORBIDDEN|UNAUTHORIZED/.test(e.message))
          throw e;
        const trace = await read<Trace>(key);
        if (trace) return { trace, cached: true };
        throw e;
      }
    },
  });
  if (isLoading) return <Loading label="Tracing all linked lots…" />;
  if (error || !data)
    return (
      <p role="alert">
        Unable to load history. Reconnect to retrieve this lot’s genealogy.
      </p>
    );
  const { trace, cached } = data;
  const lot = trace.lots.find((l) => l.id === selected);
  const edges = trace.edges.filter(
    (e) => e.parent === selected || e.child === selected,
  );
  const label = (key: string) =>
    trace.lots.find((l) => l.id === key)?.code || key;
  return (
    <div className="stack">
      <p className="small">
        {cached
          ? "Cached history. Reconnect to refresh."
          : "All-history genealogy, independent of dashboard dates."}{" "}
        Select a linked lot to follow splits, combinations and transfers. Input
        weights describe the batch contribution; they are not an allocation to
        each output.
      </p>
      {trace.truncated && (
        <p className="error">
          This network exceeds 1,000 lots. Narrow your lookup; the view is
          incomplete.
        </p>
      )}
      {lot && (
        <div className="genealogy-node">
          <small>SELECTED LOT</small>
          <h3>{lot.code}</h3>
          <p>
            {lot.material} · {kg(lot.balance)} kg remaining
          </p>
          <Badge status={lot.qc} />
          <p className="small">{lot.owner || "SP Plast Industries"}</p>
        </div>
      )}
      {edges.map((e, i) => (
        <div className="genealogy-node" key={`${e.document}-${i}`}>
          <small>
            {e.child === selected ? "UPSTREAM" : "DOWNSTREAM"} ·{" "}
            {dateLabel(e.date)} · {e.status}
          </small>
          <h3>
            {e.code} · {e.stage}
          </h3>
          <button className="text-button" onClick={() => setSelected(e.parent)}>
            {label(e.parent)}
          </button>{" "}
          →{" "}
          <button className="text-button" onClick={() => setSelected(e.child)}>
            {label(e.child)}
          </button>
          <p className="small">
            Input contribution {kg(e.input_kg)} kg · Output lot{" "}
            {kg(e.output_kg)} kg
          </p>
          <p className="small">
            {e.machine} · {e.operator}
            {e.recipe && ` · ${e.recipe} v${e.revision}`}
          </p>
        </div>
      ))}
      {trace.dispatches
        .filter((d) => d.lot_id === selected)
        .map((d) => (
          <div key={`${d.id}-${d.lot_id}`} className="genealogy-node">
            <small>
              DISPATCH · {dateLabel(d.date)} · {d.status}
            </small>
            <h3>{d.code}</h3>
            <p>
              {kg(d.quantity)} kg → {d.customer}
            </p>
          </div>
        ))}
      {!edges.length && (
        <p className="small">
          No linked processing or transfer stages recorded.
        </p>
      )}
    </div>
  );
}
