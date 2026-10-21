"use client";
import { useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Layers3,
  Calculator as CalculatorIcon,
  Package,
  Palette,
  BriefcaseBusiness,
  Truck,
  Images,
  Factory,
  ShieldCheck,
  ChartNoAxesCombined,
  Settings,
  Search,
  Bell,
  Menu,
  Plus,
  ArrowUpRight,
  ChevronRight,
  LogOut,
  RefreshCw,
  Home,
  MoreHorizontal,
  Leaf,
  ArrowDownLeft,
  Camera,
} from "lucide-react";
import { useWorkspace } from "./providers";
import { Button } from "./ui/button";
import { Empty, Loading, Modal } from "./ui/common";
import { Dashboard } from "./dashboard";
import { Calculator } from "./bags";
import { DispatchForm, DispatchPage } from "./dispatch";
import {
  BatchDetail,
  ProductionPage,
  InventoryPage,
  LotDetail,
  JobsPage,
  MachinesPage,
  QualityPage,
} from "./operations";
import { ColorLab } from "./recipes";
import { GalleryPage, CaptureForm } from "./gallery";
import { InstallApp, QRScanner } from "./device-tools";
import { SyncPage } from "./sync-page";
import { can, type Batch, type Lot } from "@/lib/domain/types";
import { dateLabel, today } from "@/lib/utils";
import { toast } from "sonner";
import { useWideScreen } from "@/lib/use-wide-screen";
const ReportsPage = dynamic(
  () => import("./reports").then((m) => m.ReportsPage),
  { loading: () => <Loading label="Opening reports…" /> },
);
const SettingsPage = dynamic(
  () => import("./settings").then((m) => m.SettingsPage),
  { loading: () => <Loading label="Opening settings…" /> },
);
const OperationalForm = dynamic(
  () => import("./forms").then((m) => m.OperationalForm),
  { loading: () => <Loading label="Opening entry…" /> },
);
const ProductionForm = dynamic(
  () => import("./forms").then((m) => m.ProductionForm),
  { loading: () => <Loading label="Opening production…" /> },
);
const nav = [
  ["", "Overview", LayoutDashboard],
  ["production", "Production", Layers3],
  ["calculator", "Bag calculator", CalculatorIcon],
  ["inventory", "Materials & inventory", Package],
  ["color-lab", "Color lab", Palette],
  ["job-work", "Job work", BriefcaseBusiness],
  ["dispatch", "Sales & dispatch", Truck],
  ["gallery", "Material gallery", Images],
  ["machines", "Machines & shifts", Factory],
  ["quality", "Quality control", ShieldCheck],
  ["reports", "Reports", ChartNoAxesCombined],
  ["settings", "Settings", Settings],
] as const;
export function FactoryApp() {
  const wide = useWideScreen();
  const {
    data,
    session,
    loading,
    error,
    online,
    cached,
    pending,
    refresh,
    signOut,
    loadMore,
  } = useWorkspace();
  const pathname = usePathname();
  const router = useRouter();
  const section = pathname.split("/")[1] || "";
  const sub = pathname.split("/")[2];
  const [menu, setMenu] = useState(false);
  const [action, setAction] = useState("");
  const [record, setRecord] = useState<Record<string, unknown> | undefined>();
  const [batch, setBatch] = useState<Batch | null>(null);
  const [lot, setLot] = useState<Lot | null>(null);
  const [editing, setEditing] = useState<{
    batch: Batch;
    copy: boolean;
  } | null>(null);
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [recipeCreate, setRecipeCreate] = useState(false);
  function openAction(kind: string, r?: Record<string, unknown>) {
    setRecord(r);
    const permission =
      kind === "dispatch"
        ? "dispatch"
        : ["inward", "job", "transfer"].includes(kind)
          ? "inventory"
          : ["qc"].includes(kind)
            ? "approve"
            : ["adjust", "reverse"].includes(kind)
              ? "configure"
              : ["recipe"].includes(kind)
                ? "recipe_edit"
                : "operate";
    if (!["new", "calculator"].includes(kind) && !can(session, permission)) {
      toast.error("Your role does not allow this action");
      return;
    }
    if (kind === "calculator") {
      router.push("/calculator");
      return;
    }
    if (kind === "recipe") {
      router.push("/color-lab");
      setRecipeCreate(true);
      return;
    }
    setAction(kind);
  }
  const close = () => {
    setAction("");
    setEditing(null);
    setRecord(undefined);
  };
  const title =
    nav.find(([path]) => path === section)?.[1] ||
    (section === "sync" ? "Device & sync" : "Overview");
  const searchResults =
    data && search.trim()
      ? [
          ...data.batches
            .filter((b) =>
              `${b.code} ${b.date} ${b.operator}`
                .toLowerCase()
                .includes(search.toLowerCase()),
            )
            .map((b) => ({
              id: b.id,
              label: b.code,
              detail: `${b.process} · ${b.date}`,
              go: () => setBatch(b),
            })),
          ...data.lots
            .filter((l) =>
              `${l.code} ${data.materials.find((m) => m.id === l.material_id)?.name} ${data.materials.find((m) => m.id === l.material_id)?.color}`
                .toLowerCase()
                .includes(search.toLowerCase()),
            )
            .map((l) => ({
              id: l.id,
              label: l.code,
              detail: "Material lot",
              go: () => setLot(l),
            })),
          ...data.recipes
            .filter((r) =>
              `${r.name} ${r.color}`
                .toLowerCase()
                .includes(search.toLowerCase()),
            )
            .map((r) => ({
              id: r.id,
              label: r.name,
              detail: `Recipe v${r.revision}`,
              go: () => router.push("/color-lab"),
            })),
          ...data.parties
            .filter((p) => p.name.toLowerCase().includes(search.toLowerCase()))
            .map((p) => ({
              id: p.id,
              label: p.name,
              detail: "Customer / supplier",
              go: () => router.push("/settings"),
            })),
          ...data.machines
            .filter((m) =>
              `${m.name} ${m.code}`
                .toLowerCase()
                .includes(search.toLowerCase()),
            )
            .map((m) => ({
              id: m.id,
              label: m.name,
              detail: "Machine",
              go: () => router.push("/machines"),
            })),
          ...data.jobs
            .filter((j) => j.code.toLowerCase().includes(search.toLowerCase()))
            .map((j) => ({
              id: j.id,
              label: j.code,
              detail: "Job-work order",
              go: () => router.push("/job-work"),
            })),
          ...data.dispatches
            .filter((d) => d.code.toLowerCase().includes(search.toLowerCase()))
            .map((d) => ({
              id: d.id,
              label: d.code,
              detail: "Dispatch",
              go: () => router.push("/dispatch"),
            })),
          ...data.batches.flatMap((b) =>
            b.outputs.flatMap((o) =>
              o.bags
                .filter((g) =>
                  g.serial?.toLowerCase().includes(search.toLowerCase()),
                )
                .map((g) => ({
                  id: g.id,
                  label: g.serial || g.label,
                  detail: `Bag · ${b.code}`,
                  go: () => setBatch(b),
                })),
            ),
          ),
        ].slice(0, 30)
      : [];
  const quick = [
    ["grinding", "Grinding production", Layers3],
    ["granules", "Granules production", Leaf],
    ["calculator", "Bag calculator", CalculatorIcon],
    ["inward", "Material inward", ArrowDownLeft],
    ["dispatch", "Sales / dispatch", Truck],
    ["job", "Job-work order", BriefcaseBusiness],
    ["recipe", "Color recipe", Palette],
    ["photo", "Capture photographs", Camera],
  ] as const;
  return (
    <>
      <a href="#main" className="sr-only focus:not-sr-only">
        Skip to main content
      </a>
      <aside className={`sidebar ${menu ? "open" : ""}`}>
        <Link href="/" className="wordmark" onClick={() => setMenu(false)}>
          <img
            src="/icon.svg"
            width={28}
            height={28}
            alt=""
            style={{ borderRadius: 7 }}
          />
          sp plast<span>OS</span>
        </Link>
        <div className="brand-caption">FACTORY INTELLIGENCE</div>
        <div className="nav-label">WORKSPACE</div>
        <nav>
          {nav.map(([path, label, Icon]) => {
            if (path === "color-lab" && !can(session, "recipes")) return null;
            return (
              <div key={path}>
                {path === "settings" && <div className="nav-separator" />}
                <Link
                  href={`/${path}`}
                  className={`nav-item ${section === path ? "active" : ""}`}
                  onClick={() => setMenu(false)}
                >
                  <Icon size={17} />
                  {label}
                  {path === "production" && (
                    <ChevronRight size={12} style={{ marginLeft: "auto" }} />
                  )}
                </Link>
                {path === "production" && section === "production" && (
                  <>
                    <Link
                      className="nav-item nav-sub"
                      href="/production/grinding"
                    >
                      Grinding
                    </Link>
                    <Link
                      className="nav-item nav-sub"
                      href="/production/granules"
                    >
                      Granules
                    </Link>
                    <Link className="nav-item nav-sub" href="/production">
                      Production history
                    </Link>
                  </>
                )}
              </div>
            );
          })}
        </nav>
        <div className="sidebar-bottom">
          <div className="factory-card">
            <strong>
              <span style={{ color: "#b8ce8f" }}>●</span>{" "}
              {data?.settings.site_name || "Ahmedabad factory"}
            </strong>
            <small>Plastic. Made possible. Again.</small>
          </div>
          <div className="user-card">
            <span className="avatar">
              {session.email.slice(0, 2).toUpperCase()}
            </span>
            <div>
              <strong>
                {session.demo ? "Demo workspace" : session.email.split("@")[0]}
              </strong>
              <small>{session.role} access</small>
            </div>
            <button
              className="btn btn-ghost btn-sm"
              aria-label="Sign out and lock local data"
              onClick={() => void signOut()}
            >
              <LogOut size={15} />
            </button>
          </div>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <div className="breadcrumb">
            <Link href="/" className="mobile-brand">
              sp plast<span>OS</span>
            </Link>
            <button
              className="btn btn-ghost btn-icon mobile-menu"
              aria-label="Open navigation"
              onClick={() => setMenu(!menu)}
            >
              <Menu size={20} />
            </button>
            <span>Workspace</span>
            <ChevronRight size={12} />
            <strong>{title}</strong>
          </div>
          <div className="topbar-tools">
            <button
              className="global-search"
              aria-label="Open factory search"
              onClick={() => setSearchOpen(true)}
            >
              <Search size={15} />
              <span className="search-placeholder">Search your factory…</span>
              <kbd>⌕</kbd>
            </button>
            <Link href="/sync" className="sync-chip">
              <span
                className="sync-dot"
                style={{
                  background: !online
                    ? "#b18b46"
                    : pending
                      ? "#a79b52"
                      : undefined,
                }}
              />
              {pending
                ? `${pending} pending`
                : session.demo
                  ? "Demo saved"
                  : cached
                    ? "Cached data"
                    : online
                      ? "Up to date"
                      : "Offline"}
            </Link>
            <Link
              href="/quality"
              className="btn btn-ghost btn-icon"
              aria-label="Quality alerts"
            >
              <Bell size={18} />
            </Link>
            <span className="avatar">
              {session.demo ? "SP" : session.email.slice(0, 2).toUpperCase()}
            </span>
          </div>
        </header>
        <main id="main" className="content">
          {session.demo && (
            <div className="demo-banner">
              <span>
                DEMO WORKSPACE · Fictional records, safely isolated from real
                production.
              </span>
              <Link href="/settings">Manage demo ↗</Link>
            </div>
          )}
          {data?.has_more && (
            <div className="notice warning" style={{ marginBottom: 20 }}>
              Showing loaded records. More records exist; totals are partial
              until all pages load.{" "}
              <button className="text-button" onClick={() => void loadMore()}>
                Load more
              </button>
            </div>
          )}
          {loading ? (
            <Loading
              label={
                session.demo
                  ? "Preparing your isolated demo factory…"
                  : "Loading factory records…"
              }
            />
          ) : error ? (
            <Empty
              title="We couldn’t load the factory records"
              description={error.message}
              action={
                <Button onClick={refresh}>
                  <RefreshCw size={16} />
                  Try again
                </Button>
              }
            />
          ) : (
            <>
              {(!section || section === "offline") && (
                <Dashboard onAction={openAction} onBatch={setBatch} />
              )}{" "}
              {section === "production" && (
                <ProductionPage
                  process={
                    ["grinding", "granules"].includes(sub) ? sub : undefined
                  }
                  onAction={openAction}
                  onBatch={setBatch}
                />
              )}
              {section === "calculator" && <Calculator />}
              {section === "inventory" && (
                <InventoryPage onAction={openAction} onLot={setLot} />
              )}
              {section === "color-lab" && (
                <ColorLab
                  create={recipeCreate}
                  onCreated={() => setRecipeCreate(!recipeCreate)}
                />
              )}
              {section === "job-work" && <JobsPage onAction={openAction} />}
              {section === "dispatch" && <DispatchPage onAction={openAction} />}
              {section === "gallery" && (
                <GalleryPage onCapture={() => openAction("photo")} />
              )}
              {section === "machines" && <MachinesPage onAction={openAction} />}
              {section === "quality" && (
                <QualityPage onAction={openAction} onLot={setLot} />
              )}
              {section === "reports" && <ReportsPage />}
              {section === "settings" && <SettingsPage />}
              {section === "sync" && <SyncPage />}
              {!nav.some(([p]) => p === section) &&
                !["offline", "sync"].includes(section) && (
                  <Empty
                    title="This page is not in your workspace"
                    description="Return to the overview to continue."
                    action={
                      <Button asChild>
                        <Link href="/">Open overview</Link>
                      </Button>
                    }
                  />
                )}
            </>
          )}
        </main>
        <footer
          className="footer-note"
          style={{ padding: "0 36px 24px", margin: 0 }}
        >
          <span>SP PLAST OS · FACTORY PRODUCTION & MATERIAL INTELLIGENCE</span>
          <span>{dateLabel(today())} · INDIA STANDARD TIME</span>
        </footer>
      </div>
      <nav className="mobile-nav">
        {[
          ["", "Home", Home],
          ["production", "Production", Layers3],
          ["calculator", "Calculator", CalculatorIcon],
          ["inventory", "Stock", Package],
        ].map(([path, label, Icon]) => {
          const I = Icon as typeof Home;
          return (
            <Link
              key={String(path)}
              href={`/${path}`}
              className={section === path ? "active" : ""}
            >
              <I />
              {String(label)}
            </Link>
          );
        })}
        <button onClick={() => setMenu(!menu)}>
          <MoreHorizontal />
          More
        </button>
      </nav>
      <Modal
        open={menu && !wide}
        onClose={() => setMenu(false)}
        title="Your factory"
        description="Everything you need, in one place."
        className="mobile-menu-sheet"
      >
        <div className="mobile-menu-grid">
          {nav
            .filter(([path]) => path !== "color-lab" || can(session, "recipes"))
            .map(([path, label, Icon]) => (
              <Link
                key={path}
                href={`/${path}`}
                onClick={() => setMenu(false)}
                className={section === path ? "active" : ""}
              >
                <Icon size={22} />
                <span>{label}</span>
                <ChevronRight size={18} />
              </Link>
            ))}
          <Link href="/sync" onClick={() => setMenu(false)}>
            <RefreshCw size={22} />
            <span>Device & sync{pending ? ` · ${pending} pending` : ""}</span>
            <ChevronRight size={18} />
          </Link>
          <button
            onClick={() => {
              setMenu(false);
              void signOut();
            }}
          >
            <LogOut size={22} />
            <span>Sign out & lock device</span>
          </button>
        </div>
      </Modal>
      <button
        className="fab"
        hidden={section === "calculator" || section === ""}
        aria-label="Quick factory action"
        onClick={() => openAction("new")}
      >
        <Plus size={25} />
      </button>
      <Modal
        open={action === "new"}
        onClose={close}
        title="What’s happening on the floor?"
        description="Start a record in one tap. Keep your work moving."
      >
        <div className="form-grid">
          {quick.map(([kind, label, Icon]) => (
            <button
              className="quick-action"
              key={kind}
              onClick={() => {
                setAction("");
                openAction(kind);
              }}
            >
              <span>
                <Icon size={19} />
              </span>
              {label}
            </button>
          ))}
        </div>
      </Modal>
      {["grinding", "granules"].includes(action) && (
        <ProductionForm
          process={action as "grinding" | "granules"}
          onClose={close}
          batch={editing?.batch}
          copy={editing?.copy}
        />
      )}
      {[
        "inward",
        "job",
        "qc",
        "transfer",
        "adjust",
        "return",
        "reverse",
      ].includes(action) && (
        <OperationalForm kind={action} onClose={close} record={record} />
      )}{" "}
      {action === "dispatch" && <DispatchForm onClose={close} />}{" "}
      {action === "photo" && <CaptureForm onClose={close} />}
      {batch && (
        <BatchDetail
          batch={data?.batches.find((b) => b.id === batch.id) || batch}
          onClose={() => setBatch(null)}
          onAction={openAction}
          onLot={(l) => {
            setBatch(null);
            setLot(l);
          }}
          onEdit={(copy) => {
            setEditing({ batch, copy });
            setAction(batch.process);
            setBatch(null);
          }}
        />
      )}
      {lot && (
        <LotDetail
          lot={data?.lots.find((l) => l.id === lot.id) || lot}
          onClose={() => setLot(null)}
          onAction={openAction}
          onBatch={(b) => {
            setLot(null);
            setBatch(b);
          }}
        />
      )}
      <Modal
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        title="Find anything in your factory"
        description="Search loaded batches, lots, bags, materials, recipes, machines, parties and orders."
      >
        <input
          autoFocus
          placeholder="Batch ID, color, bag serial, machine…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="stack" style={{ marginTop: 18 }}>
          {searchResults.map((r) => (
            <button
              className="row btn btn-ghost"
              style={{ justifyContent: "space-between", textAlign: "left" }}
              key={r.id}
              onClick={() => {
                setSearchOpen(false);
                r.go();
              }}
            >
              <div>
                <strong>{r.label}</strong>
                <small style={{ display: "block" }}>{r.detail}</small>
              </div>
              <ArrowUpRight size={15} />
            </button>
          ))}
          {search && !searchResults.length && (
            <p>No matching records in the loaded date range.</p>
          )}
        </div>
        <div className="divider" />
        <QRScanner onCode={setSearch} />
      </Modal>
      {section === "settings" && (
        <div className="install-action">
          <InstallApp />
        </div>
      )}
    </>
  );
}
