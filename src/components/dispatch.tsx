"use client";
import { ResponsiveTable } from "./ui/responsive-table";
import { useState } from "react";
import { Plus, Trash2, Truck, Printer, RotateCcw } from "lucide-react";
import { useWorkspace } from "./providers";
import { Button } from "./ui/button";
import { Badge, Empty, Field, Modal, PageHeading } from "./ui/common";
import { can, type Dispatch, type Input } from "@/lib/domain/types";
import { saleTotal, sum } from "@/lib/domain/math";
import { dateLabel, inr, kg, today, uid } from "@/lib/utils";
import { RangeFilter } from "./dashboard";
import { PhotoPicker, queuePhotos } from "./photos";
export function DispatchForm({ onClose }: { onClose: () => void }) {
  const { data, session, execute, sync } = useWorkspace();
  const [customer, setCustomer] = useState("");
  const [job, setJob] = useState("");
  const [lines, setLines] = useState<Input[]>([{ lot_id: "", quantity: "0" }]);
  const [date, setDate] = useState(today());
  const [bags, setBags] = useState("0");
  const [rate, setRate] = useState("0");
  const [tax, setTax] = useState("0");
  const [transport, setTransport] = useState("0");
  const [discount, setDiscount] = useState("0");
  const [supply, setSupply] = useState("");
  const [vehicle, setVehicle] = useState("");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  if (!data) return null;
  const quantity = sum(lines.map((l) => l.quantity || "0")).toString();
  let totals = { taxable: "0", taxes: "0", total: "0" };
  try {
    totals = saleTotal(
      quantity,
      rate || "0",
      tax || "0",
      transport || "0",
      discount || "0",
    );
  } catch {}
  return (
    <Modal
      open
      onClose={onClose}
      wide
      title="Material, ready to move."
      description="Dispatch specific QC-passed lots. Available stock is validated atomically when synced."
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setError("");
          setBusy(true);
          try {
            if (
              !customer ||
              lines.some((l) => !l.lot_id || Number(l.quantity) <= 0)
            )
              throw new Error(
                "Select a customer and positive quantities for all lots",
              );
            if (!Number.isInteger(Number(bags)) || Number(bags) < 0)
              throw new Error("Bag count must be a non-negative whole number");
            saleTotal(quantity, rate, tax, transport, discount);
            const id = uid();
            await execute("dispatch", {
              id,
              code: `DSP-${date.replaceAll("-", "")}-${id.slice(0, 6)}`,
              date,
              customer_id: customer,
              job_id: job || null,
              lines,
              bags: Number(bags),
              vehicle,
              reference,
              notes,
              ...(can(session, "finance")
                ? {
                    rate,
                    tax_percent: tax,
                    transport,
                    discount,
                    supply_location: supply,
                    tax_effective_date: date,
                  }
                : {}),
            });
            await queuePhotos(files, session, id, "dispatch");
            void sync();
            onClose();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="form-grid">
          <Field label="Dispatch date">
            <input
              type="date"
              required
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </Field>
          <Field label="Customer">
            <select
              required
              value={customer}
              onChange={(e) => {
                setCustomer(e.target.value);
                setJob("");
                setLines([{ lot_id: "", quantity: "0" }]);
              }}
            >
              <option value="">Select customer</option>
              {data.parties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Ownership / job">
            <select
              value={job}
              onChange={(e) => {
                setJob(e.target.value);
                setLines([{ lot_id: "", quantity: "0" }]);
              }}
            >
              <option value="">Company-owned sale</option>
              {data.jobs
                .filter((j) => j.customer_id === customer)
                .map((j) => (
                  <option key={j.id} value={j.id}>
                    Customer return · {j.code}
                  </option>
                ))}
            </select>
          </Field>
          <Field label="Bags loaded">
            <input
              type="number"
              min="0"
              step="1"
              value={bags}
              onChange={(e) => setBags(e.target.value)}
            />
          </Field>
        </div>
        <div className="form-section">
          <div className="row">
            <h3>Finished stock lots</h3>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() =>
                setLines([...lines, { lot_id: "", quantity: "0" }])
              }
            >
              <Plus size={15} />
              Add lot
            </Button>
          </div>
          {lines.map((line, i) => (
            <div
              key={i}
              className="row"
              style={{ marginBottom: 12, alignItems: "flex-end" }}
            >
              <Field label="Available lot">
                <select
                  value={line.lot_id}
                  required
                  onChange={(e) =>
                    setLines(
                      lines.map((l, j) =>
                        j === i ? { ...l, lot_id: e.target.value } : l,
                      ),
                    )
                  }
                >
                  <option value="">Select QC-passed stock</option>
                  {data.lots
                    .filter(
                      (l) =>
                        l.qc === "pass" &&
                        Number(l.balance) > 0 &&
                        (job ? l.job_id === job : !l.owner_party_id),
                    )
                    .map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.code} · {kg(l.balance)} kg
                      </option>
                    ))}
                </select>
              </Field>
              <Field label="Net weight (kg)">
                <input
                  type="number"
                  min="0.001"
                  step="0.001"
                  required
                  value={line.quantity}
                  onChange={(e) =>
                    setLines(
                      lines.map((l, j) =>
                        j === i ? { ...l, quantity: e.target.value } : l,
                      ),
                    )
                  }
                />
              </Field>
              {lines.length > 1 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Remove dispatch line"
                  onClick={() => setLines(lines.filter((_, j) => j !== i))}
                >
                  <Trash2 size={16} />
                </Button>
              )}
            </div>
          ))}
        </div>
        {can(session, "finance") && (
          <div className="form-section">
            <h3>Commercial details · INR</h3>
            <div className="form-grid">
              <Field label="Rate per kg (₹)">
                <input
                  type="number"
                  min="0"
                  step="0.0001"
                  required
                  value={rate}
                  onChange={(e) => setRate(e.target.value)}
                />
              </Field>
              <Field
                label="Explicit tax percentage"
                hint="Confirm the applicable tax treatment for this transaction."
              >
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  required
                  value={tax}
                  onChange={(e) => setTax(e.target.value)}
                />
              </Field>
              <Field label="Transportation charges (₹)">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  required
                  value={transport}
                  onChange={(e) => setTransport(e.target.value)}
                />
              </Field>
              <Field label="Discount (₹)">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  required
                  value={discount}
                  onChange={(e) => setDiscount(e.target.value)}
                />
              </Field>
              <Field
                label="Supply location / tax selection"
                hint="Tax effective date is the dispatch date."
              >
                <input
                  required
                  value={supply}
                  onChange={(e) => setSupply(e.target.value)}
                  placeholder="State and applicable tax reference"
                />
              </Field>
            </div>
            <div className="notice" style={{ marginTop: 18 }}>
              <div className="row">
                <span>
                  {kg(quantity)} kg × {inr(rate || "0")} = {inr(totals.taxable)}
                </span>
                <strong>Total {inr(totals.total)}</strong>
              </div>
              <small>Tax {inr(totals.taxes)} + transport − discount</small>
            </div>
          </div>
        )}
        <div className="form-grid">
          <Field label="Vehicle number">
            <input
              value={vehicle}
              onChange={(e) => setVehicle(e.target.value)}
            />
          </Field>
          <Field label="Invoice / challan reference">
            <input
              value={reference}
              onChange={(e) => setReference(e.target.value)}
            />
          </Field>
          <Field label="Loading / transporter notes">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </Field>
        </div>
        <PhotoPicker files={files} onChange={setFiles} />
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="form-actions">
          <Button disabled={busy}>
            <Truck size={16} />
            Save dispatch
          </Button>
        </div>
      </form>
    </Modal>
  );
}
export function DispatchPage({
  onAction,
}: {
  onAction: (kind: string, record?: Record<string, unknown>) => void;
}) {
  const { data, session } = useWorkspace();
  const [selected, setSelected] = useState<Dispatch | null>(null);
  if (!data) return null;
  return (
    <>
      <PageHeading
        eyebrow="OUTWARD MATERIAL"
        title="Sales & dispatch"
        description="The right material. The right weight. A complete trail."
        actions={
          can(session, "dispatch") ? (
            <Button onClick={() => onAction("dispatch")}>
              <Plus size={16} />
              New dispatch
            </Button>
          ) : null
        }
      />
      <div className="toolbar">
        <RangeFilter />
        <Button variant="outline" onClick={() => onAction("return")}>
          <RotateCcw size={15} />
          Record return
        </Button>
      </div>
      <div className="panel">
        {data.dispatches.length ? (
          <div className="table-wrap">
            <ResponsiveTable>
              <thead>
                <tr>
                  <th>DISPATCH</th>
                  <th>CUSTOMER</th>
                  <th>DATE</th>
                  <th>NET WEIGHT</th>
                  <th>OWNERSHIP</th>
                  {can(session, "finance") && <th>VALUE</th>}
                  <th>STATUS</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.dispatches.map((d) => (
                  <tr key={d.id}>
                    <td>
                      <strong>{d.code}</strong>
                      <small>{d.reference || "No external reference"}</small>
                    </td>
                    <td>
                      {data.parties.find((p) => p.id === d.customer_id)?.name}
                    </td>
                    <td>{dateLabel(d.date)}</td>
                    <td>
                      {kg(sum(d.lines.map((l) => l.quantity)).toString())} kg
                    </td>
                    <td>
                      {d.job_id ? "Customer-owned return" : "Company sale"}
                    </td>
                    {can(session, "finance") && (
                      <td>{d.total ? inr(d.total) : "—"}</td>
                    )}
                    <td>
                      <Badge status={d.status} />
                    </td>
                    <td>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setSelected(d)}
                      >
                        View
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </ResponsiveTable>
          </div>
        ) : (
          <Empty
            title="Ready when your material is"
            description="Dispatch stock after production approval and quality release."
          />
        )}
      </div>
      <Modal
        open={!!selected}
        onClose={() => setSelected(null)}
        title={selected?.code || "Dispatch"}
        description="SP Plast Industries · Operational dispatch summary"
      >
        {selected && (
          <div className="stack">
            <div className="stats-inline">
              <div>
                <span>Customer</span>
                <strong style={{ fontSize: 16 }}>
                  {
                    data.parties.find((p) => p.id === selected.customer_id)
                      ?.name
                  }
                </strong>
              </div>
              <div>
                <span>Date</span>
                <strong style={{ fontSize: 16 }}>
                  {dateLabel(selected.date)}
                </strong>
              </div>
            </div>
            {selected.lines.map((l, i) => (
              <div className="row" key={i}>
                <span>
                  {data.lots.find((x) => x.id === l.lot_id)?.code || l.lot_id}
                </span>
                <strong>{kg(l.quantity)} kg</strong>
              </div>
            ))}
            <div className="divider" />
            <p>
              Vehicle: {selected.vehicle || "—"} · Bags: {selected.bags}
            </p>
            {selected.total && <h2>Total: {inr(selected.total)}</h2>}
            <p className="small">{selected.notes}</p>
            <p className="small">
              Operational summary only. Use your validated invoicing workflow
              for statutory documents.
            </p>
            <div className="row no-print">
              <Button variant="outline" onClick={() => window.print()}>
                <Printer size={15} />
                Print / PDF
              </Button>
              {can(session, "configure") && (
                <Button
                  variant="outline"
                  onClick={() => {
                    const tx = data.movements.find(
                      (m) =>
                        m.source_id === selected.id && m.kind === "dispatch",
                    );
                    if (tx) {
                      setSelected(null);
                      onAction("reverse", {
                        transaction_id: tx.transaction_id,
                      });
                    }
                  }}
                >
                  Reverse dispatch
                </Button>
              )}
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
