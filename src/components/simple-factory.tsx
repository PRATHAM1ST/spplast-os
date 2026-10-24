"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import {
  Plus,
  Pencil,
  Trash2,
  Search,
  ArrowDownLeft,
  ArrowUpRight,
  Layers3,
  Package,
  Check,
  X,
  LogOut,
} from "lucide-react";
import { useWorkspace } from "./providers";
import { Button } from "./ui/button";
import { Field, Loading, Modal } from "./ui/common";
import { ColorPicker } from "./color-picker";
import { queuePhotos } from "./photos";
import { SyncPage } from "./sync-page";
import { InstallApp } from "./device-tools";
import {
  can,
  type Command,
  type EntryKind,
  type Media,
  type SimpleBag,
  type SimpleEntry,
  type StockItem,
} from "@/lib/domain/types";
import {
  entryLabels,
  bagWeight,
  simpleView,
  stockKind,
} from "@/lib/domain/simple";
import { simpleEntrySchema } from "@/lib/domain/validation";
import { D } from "@/lib/domain/math";
import {
  local,
  open,
  read,
  seal,
  fileData,
  dataFile,
} from "@/lib/offline/vault";
import type { QueuedPhoto } from "@/lib/offline/sync";
import { kg, today, uid, dateLabel } from "@/lib/utils";
import type { ColorReference } from "@/lib/color";

const kinds = ["scrap", "grinding", "granules", "sale"] as const;
const icons = {
  scrap: ArrowDownLeft,
  grinding: Layers3,
  granules: Package,
  sale: ArrowUpRight,
};
const permitted = (kind: EntryKind) =>
  kind === "scrap" ? "inventory" : kind === "sale" ? "dispatch" : "operate";
function yearAgo() {
  const date = new Date();
  date.setDate(date.getDate() - 365);
  return date.toISOString().slice(0, 10);
}

export function SimpleFactory() {
  const {
    data,
    session,
    loading,
    error,
    refresh,
    pending,
    online,
    signOut,
    from,
    to,
    setRange,
    loadMore,
  } = useWorkspace();
  const pathname = usePathname();
  const tab =
    pathname === "/entries"
      ? "entries"
      : pathname === "/stock"
        ? "stock"
        : "home";
  const [filter, setFilter] = useState<EntryKind | "all">("all");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<{
    kind: EntryKind;
    entry?: SimpleEntry;
    source?: StockItem;
  } | null>(null);
  const [removing, setRemoving] = useState<SimpleEntry | null>(null);
  const [syncOpen, setSyncOpen] = useState(false);
  const [chooseEntry, setChooseEntry] = useState(false);
  const initialized = useRef(false);
  const [commands, setCommands] = useState<Command[]>([]);
  const queued = useLiveQuery(
    () =>
      local.rows
        .where("user")
        .equals(session.user_id)
        .filter((r) => r.kind === "queue")
        .sortBy("order"),
    [session.user_id],
  );
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    setRange(yearAgo(), today());
  }, [setRange]); // Initial history covers the last year; stock is all-time.
  useEffect(() => {
    let active = true;
    void Promise.all(
      (queued || [])
        .filter((r) => r.state !== "conflict")
        .map((r) => open<Command>(r)),
    )
      .then((rows) => {
        if (active) setCommands(rows);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [queued]);
  const view = useMemo(
    () => (data ? simpleView(data, commands) : null),
    [data, commands],
  );
  const issues =
    queued?.filter((r) => r.state === "conflict" || r.state === "failed") || [];
  const match = (s: string) => s.toLowerCase().includes(search.toLowerCase());
  if (loading || !data || !view)
    return (
      <main className="simple-app">
        <Loading label="Opening your stock…" />
        {error && (
          <>
            <p role="alert">{error.message}</p>
            <Button onClick={refresh}>Try again</Button>
          </>
        )}
      </main>
    );
  const entries = view.entries.filter(
    (e) =>
      (filter === "all" || e.kind === filter) && match(`${e.name} ${e.color}`),
  );
  const stock = view.stock.filter(
    (s) =>
      (filter === "all" || stockKind(s.form) === filter) &&
      match(`${s.name} ${s.color}`),
  );
  return (
    <div className="simple-app">
      <header className="simple-header">
        <Link href="/" className="simple-brand">
          sp plast <span>Stock</span>
        </Link>
        <div className="simple-header-actions">
          <button
            type="button"
            className={`simple-sync ${issues.length ? "has-issue" : ""}`}
            onClick={() => setSyncOpen(true)}
          >
            {issues.length
              ? "Needs attention"
              : pending
                ? `${pending} saving`
                : online
                  ? "Saved"
                  : "Offline"}
          </button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Sign out"
            onClick={() => void signOut()}
          >
            <LogOut size={18} />
          </Button>
        </div>
      </header>
      <main id="main">
        {session.demo && <p className="simple-demo">Demo · sample stock</p>}
        {tab === "home" && (
          <>
            <div className="simple-title">
              <h1>What’s in stock</h1>
              <p>Scrap, grinding and granules. All in one place.</p>
            </div>
            <div className="simple-totals">
              {(["scrap", "grinding", "granules"] as const).map((kind) => (
                <Link
                  href="/stock"
                  key={kind}
                  onClick={() => setFilter(kind)}
                  className="simple-total"
                >
                  <span>
                    {kind === "scrap"
                      ? "Scrap"
                      : kind === "grinding"
                        ? "Grinding"
                        : "Granules"}
                  </span>
                  <strong>
                    {kg(view.totals[kind])}
                    <small> kg</small>
                  </strong>
                </Link>
              ))}
            </div>
            <div className="simple-actions">
              {kinds
                .filter((k) => can(session, permitted(k)))
                .map((kind) => {
                  const Icon = icons[kind];
                  return (
                    <button
                      type="button"
                      key={kind}
                      onClick={() => setEditing({ kind })}
                    >
                      <Icon size={22} />
                      <span>{entryLabels[kind]}</span>
                      <Plus size={18} />
                    </button>
                  );
                })}
            </div>
          </>
        )}
        <nav className="simple-nav" aria-label="Main navigation">
          <Link
            href="/"
            aria-current={tab === "home" ? "page" : undefined}
            onClick={() => setFilter("all")}
          >
            Home
          </Link>
          <Link
            href="/stock"
            aria-current={tab === "stock" ? "page" : undefined}
            onClick={() => setFilter("all")}
          >
            Stock
          </Link>
          <Link
            href="/entries"
            aria-current={tab === "entries" ? "page" : undefined}
            onClick={() => setFilter("all")}
          >
            Entries
          </Link>
        </nav>
        <div className="simple-section-heading">
          <h2>
            {tab === "stock"
              ? "Available material"
              : tab === "entries"
                ? "Your entries"
                : "Recent entries"}
          </h2>
          {tab !== "home" && kinds.some((k) => can(session, permitted(k))) && (
            <Button onClick={() => setChooseEntry(true)}>
              <Plus size={16} />
              Add entry
            </Button>
          )}
        </div>
        <div className="simple-search">
          <Search size={18} />
          <input
            aria-label="Find material or colour"
            placeholder="Find material or colour"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {tab !== "home" && (
          <div className="simple-filters" aria-label="Filter entries">
            {(
              [
                "all",
                "scrap",
                "grinding",
                "granules",
                ...(tab === "entries" ? ["sale"] : []),
              ] as (EntryKind | "all")[]
            ).map((k) => (
              <button
                type="button"
                key={k}
                aria-pressed={filter === k}
                onClick={() => setFilter(k)}
              >
                {k === "all"
                  ? "All"
                  : k === "sale"
                    ? "Sold"
                    : k[0].toUpperCase() + k.slice(1)}
              </button>
            ))}
          </div>
        )}
        {tab === "entries" && (
          <details className="simple-dates">
            <summary>
              Dates · {dateLabel(from)} to {dateLabel(to)}
            </summary>
            <div className="form-grid">
              <Field label="From date">
                <input
                  type="date"
                  value={from}
                  onChange={(e) =>
                    e.target.value && setRange(e.target.value, to)
                  }
                />
              </Field>
              <Field label="To date">
                <input
                  type="date"
                  value={to}
                  onChange={(e) =>
                    e.target.value && setRange(from, e.target.value)
                  }
                />
              </Field>
            </div>
            <small>Choose a range up to one year.</small>
          </details>
        )}
        {tab === "stock" ? (
          <div className="simple-list">
            {stock.map((s) => (
              <article className="simple-stock-row" key={s.id}>
                <span
                  className="simple-swatch"
                  style={{ background: s.color_hex }}
                />
                <div>
                  <h3>{s.name}</h3>
                  <p>
                    {s.color || "Colour unspecified"} · {stockKind(s.form)}
                    {s.qc !== "pass" ? " · On hold" : ""}
                  </p>
                </div>
                <strong>{kg(s.quantity)} kg</strong>
                {can(session, "dispatch") && s.qc === "pass" && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setEditing({ kind: "sale", source: s })}
                  >
                    Sell
                  </Button>
                )}
              </article>
            ))}
            {!stock.length && (
              <p className="simple-empty">
                No material here yet. Add scrap or a production output to begin.
              </p>
            )}
          </div>
        ) : (
          <div className="simple-list">
            {(tab === "home" ? entries.slice(0, 8) : entries).map((entry) => (
              <article className="simple-entry-row" key={entry.id}>
                <EntryPhoto
                  record={entry.id}
                  media={data.media.filter(
                    (m) =>
                      m.record_type === "entry" && m.record_id === entry.id,
                  )}
                  fallback={entry.color_hex}
                />
                <div className="simple-entry-info">
                  <span className="simple-entry-kind">
                    {entryLabels[entry.kind]} · {dateLabel(entry.date)}
                  </span>
                  <h3>{entry.name}</h3>
                  <p>
                    {entry.color || "Colour unspecified"}
                    {entry.bags.length
                      ? ` · ${entry.bags.reduce((n, b) => n + b.count, 0)} bags`
                      : ""}
                  </p>
                </div>
                <strong className="simple-entry-weight">
                  {entry.kind === "sale" ? "−" : "+"}
                  {kg(entry.quantity)} kg
                </strong>
                {can(session, permitted(entry.kind)) && (
                  <div className="simple-row-actions">
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={`Edit ${entry.name}`}
                      onClick={() => setEditing({ kind: entry.kind, entry })}
                    >
                      <Pencil size={16} />
                      Edit
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Delete ${entry.name}`}
                      onClick={() => setRemoving(entry)}
                    >
                      <Trash2 size={16} />
                    </Button>
                  </div>
                )}
              </article>
            ))}
            {!entries.length && (
              <p className="simple-empty">
                No entries yet. Tap an action above to record your first bags.
              </p>
            )}
          </div>
        )}
        {tab === "home" && entries.length > 8 && (
          <Link href="/entries" className="simple-more">
            View all entries
          </Link>
        )}
        {data.has_more && (
          <Button variant="outline" onClick={() => void loadMore()}>
            Load more
          </Button>
        )}
        {tab === "entries" && data.batches.length > 0 && (
          <details className="simple-dates">
            <summary>Earlier production records</summary>
            {data.batches.map((b) => (
              <div className="simple-stock-row" key={b.id}>
                <div>
                  <h3>{b.code}</h3>
                  <p>
                    {b.process} · {dateLabel(b.date)} · {b.status}
                  </p>
                </div>
                <strong>
                  {kg(b.outputs.reduce((n, o) => n + Number(o.quantity), 0))} kg
                </strong>
              </div>
            ))}
            <p className="small">
              Earlier records are preserved; their posted stock is included
              above.
            </p>
          </details>
        )}
      </main>
      {chooseEntry && (
        <Modal
          open
          title="Add entry"
          description="What would you like to record?"
          onClose={() => setChooseEntry(false)}
        >
          <div className="simple-actions">
            {kinds
              .filter((k) => can(session, permitted(k)))
              .map((kind) => (
                <button
                  type="button"
                  key={kind}
                  onClick={() => {
                    setChooseEntry(false);
                    setEditing({ kind });
                  }}
                >
                  {entryLabels[kind]}
                </button>
              ))}
          </div>
        </Modal>
      )}
      {editing && (
        <EntryForm
          key={editing.entry?.id || editing.kind}
          {...editing}
          stock={view.stock}
          onClose={() => setEditing(null)}
        />
      )}
      {removing && (
        <DeleteEntry
          entry={removing}
          stock={view.stock}
          onClose={() => setRemoving(null)}
        />
      )}
      {syncOpen && (
        <Modal
          open
          wide
          title="Saving & connection"
          onClose={() => setSyncOpen(false)}
        >
          <SyncPage />
        </Modal>
      )}
      <InstallApp />
    </div>
  );
}

function EntryPhoto({
  record,
  media,
  fallback,
  onRemove,
  hidden = [],
}: {
  record: string;
  media: Media[];
  fallback: string;
  onRemove?: (id: string) => void;
  hidden?: string[];
}) {
  const { session } = useWorkspace();
  const [urls, setUrls] = useState<{ id: string; url: string }[]>([]);
  const rows = useLiveQuery(
    () =>
      local.rows
        .where("user")
        .equals(session.user_id)
        .filter((r) => r.kind === "photo")
        .toArray(),
    [session.user_id],
  );
  const mediaKey = media.map((m) => m.id).join(",");
  useEffect(() => {
    let active = true;
    void Promise.all(
      (rows || []).map(async (row) => ({
        id: row.id,
        photo: await open<QueuedPhoto>(row),
      })),
    )
      .then((photos) => {
        const localPhotos = photos
          .filter((p) => p.photo.record_id === record)
          .map((p) => ({
            id: p.id,
            url: `data:${p.photo.type};base64,${p.photo.data}`,
          }));
        const ids = mediaKey.split(",").filter(Boolean);
        const all = session.demo
          ? localPhotos.filter(
              (p) =>
                ids.includes(p.id) ||
                rows?.find((r) => r.id === p.id)?.state !== "synced",
            )
          : [
              ...ids.map((id) => ({ id, url: `/api/media?id=${id}` })),
              ...localPhotos.filter((p) => !ids.includes(p.id)),
            ];
        if (active) setUrls(all);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [rows, record, mediaKey, session.demo]);
  if (!urls.length)
    return (
      <span
        className="simple-photo-fallback"
        style={{ background: fallback }}
      />
    );
  return (
    <div className={onRemove ? "simple-existing-photos" : "simple-entry-photo"}>
      {(onRemove ? urls : urls.slice(0, 1))
        .filter((p) => !hidden.includes(p.id))
        .map((p) => (
          <div key={p.id}>
            <a href={p.url} target="_blank" rel="noreferrer">
              <img src={p.url} alt="Material photo" />
            </a>
            {onRemove && (
              <button
                type="button"
                aria-label="Remove saved photo"
                onClick={() => onRemove(p.id)}
              >
                <X size={16} />
              </button>
            )}
          </div>
        ))}
    </div>
  );
}

type EntryDraft = {
  id: string;
  date: string;
  name: string;
  color: ColorReference | null;
  bags: SimpleBag[];
  bulk: string;
  useBags: boolean;
  input: string;
  inputQuantity: string;
  files: { name: string; type: string; data: string }[];
};
function EntryForm({
  kind,
  entry,
  source,
  stock,
  onClose,
}: {
  kind: EntryKind;
  entry?: SimpleEntry;
  source?: StockItem;
  stock: StockItem[];
  onClose: () => void;
}) {
  const { session, data, execute, sync } = useWorkspace();
  const [id, setId] = useState(entry?.id || uid());
  const [date, setDate] = useState(entry?.date || today());
  const [name, setName] = useState(entry?.name || source?.name || "");
  const [color, setColor] = useState<ColorReference | null>(
    entry
      ? { name: entry.color, hex: entry.color_hex }
      : source
        ? { name: source.color, hex: source.color_hex }
        : null,
  );
  const [bags, setBags] = useState<SimpleBag[]>(
    entry?.bags.length ? entry.bags : [{ count: 1, weight: "25" }],
  );
  const [useBags, setUseBags] = useState(entry ? !!entry.bags.length : true);
  const [bulk, setBulk] = useState(entry?.quantity || "");
  const [input, setInput] = useState(entry?.input_lot_id || source?.id || "");
  const [inputQuantity, setInputQuantity] = useState(
    entry?.input_quantity || "",
  );
  const [files, setFiles] = useState<File[]>([]);
  const [removed, setRemoved] = useState<string[]>([]);
  const [ready, setReady] = useState(!!entry);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [error, setError] = useState("");
  const draftKey = `${session.user_id}:simple-draft:${kind}`;
  useEffect(() => {
    if (entry) return;
    let active = true;
    void read<EntryDraft>(draftKey)
      .then((d) => {
        if (!active) return;
        if (d && !source) {
          setId(d.id);
          setDate(d.date);
          setName(d.name);
          setColor(d.color);
          setBags(d.bags);
          setBulk(d.bulk);
          setUseBags(d.useBags);
          setInput(d.input);
          setInputQuantity(d.inputQuantity);
          setFiles(
            d.files.map(
              (f) =>
                new File([dataFile(f.data, f.type)], f.name, { type: f.type }),
            ),
          );
        }
        setReady(true);
      })
      .catch((e: Error) => setError(e.message));
    return () => {
      active = false;
    };
  }, [draftKey, entry, source]);
  useEffect(() => {
    if (!ready || entry || saved) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      void Promise.all(
        files.map(async (f) => ({
          name: f.name,
          type: f.type,
          data: await fileData(f),
        })),
      )
        .then((photos) => {
          if (!cancelled)
            return seal(draftKey, "draft", {
              id,
              date,
              name,
              color,
              bags,
              bulk,
              useBags,
              input,
              inputQuantity,
              files: photos,
            });
        })
        .catch((e: Error) => setError(e.message));
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [
    ready,
    entry,
    saved,
    draftKey,
    id,
    date,
    name,
    color,
    bags,
    bulk,
    useBags,
    input,
    inputQuantity,
    files,
  ]);
  let quantity = "0";
  try {
    quantity = useBags ? bagWeight(bags) : D(bulk || 0).toFixed(3);
  } catch {}
  const sources = [...stock];
  if (
    entry?.input_lot_id &&
    !sources.some((s) => s.id === entry.input_lot_id)
  ) {
    const lot = data?.lots.find((l) => l.id === entry.input_lot_id),
      material = data?.materials.find((m) => m.id === lot?.material_id);
    if (lot && material)
      sources.push({
        id: lot.id,
        code: lot.code,
        name: material.name,
        color: material.color,
        color_hex: material.color_hex,
        form: material.form,
        qc: lot.qc,
        quantity: "0",
      });
  }
  const selected = sources.find((s) => s.id === input);
  const available = D(selected?.quantity || 0).plus(
    entry?.input_lot_id === input ? entry.input_quantity : 0,
  );
  const materialName =
    name.trim() ||
    [
      color?.name,
      kind === "scrap"
        ? "Scrap"
        : kind === "grinding"
          ? "Grinding"
          : "Granules",
    ]
      .filter(Boolean)
      .join(" ");
  async function closeDraft() {
    if (busy || photoBusy) return;
    try {
      if (!entry && ready && !saved) {
        setBusy(true);
        const photos = await Promise.all(
          files.map(async (file) => ({
            name: file.name,
            type: file.type,
            data: await fileData(file),
          })),
        );
        await seal(draftKey, "draft", {
          id,
          date,
          name,
          color,
          bags,
          bulk,
          useBags,
          input,
          inputQuantity,
          files: photos,
        });
      }
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      open
      onClose={() => void closeDraft()}
      title={
        entry ? `Edit ${entryLabels[kind].toLowerCase()}` : entryLabels[kind]
      }
      description="Date, bags, colour and a photo. That’s it."
      className="simple-entry-modal"
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (busy || photoBusy) return;
          setBusy(true);
          setError("");
          try {
            if (!saved) {
              const payload = simpleEntrySchema.parse({
                id,
                kind,
                date,
                name:
                  kind === "sale"
                    ? selected?.name || materialName
                    : materialName,
                color:
                  kind === "sale" ? selected?.color || "" : color?.name || "",
                color_hex:
                  kind === "sale"
                    ? selected?.color_hex || "#ded8bd"
                    : color?.hex || "#ded8bd",
                quantity,
                bags: useBags ? bags : [],
                input_lot_id: input || null,
                input_quantity:
                  kind === "sale" ? quantity : input ? inputQuantity : "0",
                remove_photo_ids: removed,
              });
              if (kind === "sale" && !input)
                throw new Error("Choose the material being sold.");
              if (
                input &&
                (D(payload.input_quantity).lte(0) ||
                  D(payload.input_quantity).gt(available))
              )
                throw new Error(
                  `Available input: ${kg(available.toString())} kg. Check the weight.`,
                );
              if (
                entry &&
                kind !== "sale" &&
                D(quantity).lt(
                  D(entry.quantity).minus(
                    stock.find((s) => s.id === entry.id)?.quantity || 0,
                  ),
                )
              )
                throw new Error(
                  "Some material is already used or sold. Edit those entries first, or keep enough stock.",
                );
              await execute("save_entry", payload, entry?.version);
              setSaved(true);
            }
            await queuePhotos(
              files,
              session,
              id,
              "entry",
              color ? `${color.name} · ${materialName}` : materialName,
            );
            for (const photoId of removed) {
              const row = await local.rows.get(photoId);
              if (row?.user === session.user_id && row.kind === "photo")
                await local.rows.delete(photoId);
            }
            if (!entry) await seal(draftKey, "draft", null);
            void sync();
            onClose();
          } catch (e) {
            setError(
              e instanceof Error ? e.message : "Unable to save. Try again.",
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        <fieldset disabled={busy || saved || !ready} className="simple-fields">
          <div className="form-grid">
            <Field label="Date">
              <input
                required
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </Field>
            {kind !== "sale" && (
              <Field label="Material name (optional)">
                <input
                  maxLength={150}
                  placeholder={materialName}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </Field>
            )}
          </div>
          {kind === "sale" && (
            <Field label="Material to sell">
              <select
                required
                value={input}
                onChange={(e) => setInput(e.target.value)}
              >
                <option value="">Choose stock</option>
                {sources
                  .filter((s) => s.qc === "pass")
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} · {s.color} ·{" "}
                      {kg(
                        D(s.quantity)
                          .plus(
                            entry?.input_lot_id === s.id
                              ? entry.input_quantity
                              : 0,
                          )
                          .toString(),
                      )}{" "}
                      kg
                    </option>
                  ))}
              </select>
            </Field>
          )}
          <div className="simple-weight-heading">
            <h3>{kind === "sale" ? "Bags sold" : "Bags"}</h3>
            <button type="button" onClick={() => setUseBags(!useBags)}>
              {useBags ? "Enter total kg instead" : "Use bag count"}
            </button>
          </div>
          {useBags ? (
            <>
              <div className="simple-bag-presets">
                {[25, 30, 35, 50].map((w) => (
                  <button
                    type="button"
                    key={w}
                    onClick={() =>
                      setBags((b) =>
                        b.map((row, i) =>
                          i === 0 ? { ...row, weight: String(w) } : row,
                        ),
                      )
                    }
                  >
                    {w} kg bags
                  </button>
                ))}
              </div>
              {bags.map((bag, i) => (
                <div className="simple-bag-row" key={i}>
                  <Field label={`Bags ${i + 1}`}>
                    <input
                      required
                      type="number"
                      min="1"
                      max="100000"
                      step="1"
                      inputMode="numeric"
                      value={bag.count || ""}
                      onChange={(e) =>
                        setBags(
                          bags.map((b, j) =>
                            j === i
                              ? { ...b, count: Number(e.target.value) }
                              : b,
                          ),
                        )
                      }
                    />
                  </Field>
                  <span>×</span>
                  <Field label={`Kg per bag ${i + 1}`}>
                    <input
                      required
                      type="number"
                      min="0.001"
                      step="0.001"
                      inputMode="decimal"
                      value={bag.weight}
                      onChange={(e) =>
                        setBags(
                          bags.map((b, j) =>
                            j === i ? { ...b, weight: e.target.value } : b,
                          ),
                        )
                      }
                    />
                  </Field>
                  {bags.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Remove bag size ${i + 1}`}
                      onClick={() => setBags(bags.filter((_, j) => j !== i))}
                    >
                      <X size={16} />
                    </Button>
                  )}
                </div>
              ))}
              <button
                type="button"
                className="simple-text-button"
                onClick={() => setBags([...bags, { count: 1, weight: "25" }])}
              >
                + Another bag size
              </button>
            </>
          ) : (
            <Field label="Total weight (kg)">
              <input
                required
                type="number"
                min="0.001"
                step="0.001"
                inputMode="decimal"
                value={bulk}
                onChange={(e) => setBulk(e.target.value)}
              />
            </Field>
          )}
          <div className="simple-weight-total">
            <span>Total</span>
            <strong>{kg(quantity)} kg</strong>
          </div>
          {(kind === "grinding" || kind === "granules") && (
            <details
              className="optional-details"
              open={input ? true : undefined}
            >
              <summary>Also record material used (optional)</summary>
              <Field label="Input material">
                <select
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                >
                  <option value="">Output only</option>
                  {sources
                    .filter((s) => s.id !== id && s.qc === "pass")
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ·{" "}
                        {kg(
                          D(s.quantity)
                            .plus(
                              entry?.input_lot_id === s.id
                                ? entry.input_quantity
                                : 0,
                            )
                            .toString(),
                        )}{" "}
                        kg
                      </option>
                    ))}
                </select>
              </Field>
              {input && (
                <Field label="Input used (kg)">
                  <input
                    required
                    type="number"
                    min="0.001"
                    step="0.001"
                    value={inputQuantity}
                    onChange={(e) => setInputQuantity(e.target.value)}
                  />
                </Field>
              )}
            </details>
          )}
          <details
            className="optional-details"
            open={files.length || color ? true : undefined}
          >
            <summary>
              {color
                ? `${color.name || "Selected colour"} · Photos & colour`
                : "Add photo & colour"}
            </summary>
            <ColorPicker
              files={files}
              onFilesChange={setFiles}
              value={color}
              onChange={setColor}
              onBusyChange={setPhotoBusy}
            />
          </details>
          {entry && (
            <EntryPhoto
              record={entry.id}
              media={(data?.media || []).filter(
                (m) =>
                  m.record_type === "entry" &&
                  m.record_id === entry.id &&
                  !removed.includes(m.id),
              )}
              fallback={entry.color_hex}
              onRemove={(photoId) => setRemoved([...removed, photoId])}
              hidden={removed}
            />
          )}
        </fieldset>
        {error && (
          <p className="error" role="alert">
            {saved ? "Entry saved. Retry to attach photos. " : ""}
            {error}
          </p>
        )}
        <div className="form-actions">
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => void closeDraft()}
          >
            Close
          </Button>
          <Button disabled={busy || photoBusy || !ready}>
            <Check size={17} />
            {busy
              ? "Saving…"
              : saved
                ? "Retry photos"
                : entry
                  ? "Save changes"
                  : "Save entry"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function DeleteEntry({
  entry,
  stock,
  onClose,
}: {
  entry: SimpleEntry;
  stock: StockItem[];
  onClose: () => void;
}) {
  const { execute } = useWorkspace();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const consumed =
    entry.kind !== "sale" &&
    D(stock.find((s) => s.id === entry.id)?.quantity || 0).lt(entry.quantity);
  return (
    <Modal
      open
      title={`Delete ${entry.name}?`}
      description="The entry will disappear and its stock change will be undone."
      onClose={onClose}
    >
      <p>
        {kg(entry.quantity)} kg · {dateLabel(entry.date)}
      </p>
      {consumed && (
        <p className="error">
          Some of this material is already used or sold. Edit or delete those
          later entries first.
        </p>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <div className="form-actions">
        <Button variant="outline" onClick={onClose}>
          Keep entry
        </Button>
        <Button
          disabled={busy || consumed}
          onClick={async () => {
            setBusy(true);
            try {
              await execute("delete_entry", { id: entry.id }, entry.version);
              onClose();
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <Trash2 size={16} />
          {busy ? "Deleting…" : "Delete entry"}
        </Button>
      </div>
    </Modal>
  );
}
