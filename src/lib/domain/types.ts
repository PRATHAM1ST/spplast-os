export type Role =
  | "owner"
  | "admin"
  | "manager"
  | "supervisor"
  | "operator"
  | "accountant"
  | "viewer";
export type Permission =
  | "operate"
  | "approve"
  | "inventory"
  | "dispatch"
  | "finance"
  | "recipes"
  | "recipe_edit"
  | "configure";
export type Status = "draft" | "submitted" | "approved" | "reversed";
export type QC = "hold" | "pass" | "rework" | "reject";
export type Basis =
  "total_percent" | "per_100" | "per_1000" | "fixed" | "base_resin";
export interface Base {
  id: string;
  org_id: string;
  created_at: string;
  updated_at: string;
  created_by: string;
  version: number;
}
export interface Material extends Base {
  code: string;
  name: string;
  polymer: string;
  form: string;
  color: string;
  color_hex: string;
  grade: string;
  active: boolean;
  notes: string;
}
export interface Party extends Base {
  name: string;
  kind: string;
  phone: string;
  gstin: string;
  address: string;
}
export interface Location extends Base {
  name: string;
  code: string;
}
export interface Parameter {
  key: string;
  label: string;
  type: "number" | "text" | "select";
  unit: string;
  required: boolean;
  options?: string[];
  min?: number;
  max?: number;
}
export interface Machine extends Base {
  name: string;
  code: string;
  category: string;
  status: string;
  capacity_kg_hour: string | null;
  parameters: Parameter[];
  notes: string;
}
export interface Shift extends Base {
  name: string;
  starts_at: string;
  ends_at: string;
}
export interface Lot extends Base {
  code: string;
  material_id: string;
  location_id: string;
  owner_party_id: string | null;
  job_id: string | null;
  qc: QC;
  source_batch_id: string | null;
  balance: string;
  notes: string;
}
export interface BagGroup {
  id: string;
  label: string;
  count: number;
  weight: string;
  tare: string;
  mode: "net" | "gross";
  serial?: string;
}
export interface Input {
  lot_id: string;
  quantity: string;
}
export interface Output {
  id: string;
  material_id: string;
  location_id: string;
  quantity: string;
  bags: BagGroup[];
  disposition: QC;
  kind: "usable" | "scrap" | "rework";
}
export interface Batch extends Base {
  code: string;
  date: string;
  process: "grinding" | "granules";
  machine_id: string;
  shift_id: string;
  operator: string;
  supervisor: string;
  job_id: string | null;
  status: Status;
  inputs: Input[];
  outputs: Output[];
  loss_kg: string;
  loss_reason: string;
  notes: string;
  started_at: string | null;
  ended_at: string | null;
  downtime_minutes: number;
  downtime_reason: string;
  recipe_version_id: string | null;
  target_input_kg?: string;
  recipe_actuals: { ingredient_id: string; quantity: string }[];
  readings: { key: string; value: string; unit: string; measured_at: string }[];
}
export interface Movement extends Base {
  transaction_id: string;
  lot_id: string;
  quantity: string;
  kind: string;
  source_id: string;
  date: string;
  reason: string;
}
export interface Ingredient {
  id: string;
  name: string;
  material_id: string | null;
  category: string;
  amount: string;
  unit: "kg" | "g" | "%";
  is_base: boolean;
}
export interface Recipe extends Base {
  master_id: string;
  name: string;
  color: string;
  color_hex: string;
  polymer: string;
  basis: Basis;
  base_quantity: string;
  ingredients: Ingredient[];
  status: "experimental" | "approved";
  revision: number;
  change_reason: string;
  notes: string;
}
export interface Job extends Base {
  code: string;
  customer_id: string;
  process: string;
  material_id: string;
  expected_date: string;
  rate: string;
  charge_basis: string;
  status: string;
  notes: string;
}
export interface Dispatch extends Base {
  code: string;
  date: string;
  customer_id: string;
  job_id: string | null;
  lines: Input[];
  bags: number;
  status: Status;
  vehicle: string;
  reference: string;
  notes: string;
  rate?: string;
  tax_percent?: string;
  transport?: string;
  discount?: string;
  total?: string;
}
export interface Inspection extends Base {
  lot_id: string;
  disposition: QC;
  shade: string;
  cleanliness: string;
  notes: string;
  measurements: { key: string; value: string; unit: string }[];
}
export interface Media extends Base {
  record_id: string;
  record_type: string;
  caption: string;
  category: string;
  path: string;
  thumbnail_path: string;
  mime: string;
  size: number;
  url?: string;
}
export interface Audit extends Base {
  action: string;
  record_id: string;
  detail: string;
}
export interface Member {
  user_id: string;
  email: string;
  role: Role;
  permissions: Partial<Record<Permission, boolean>>;
}
export interface Settings {
  company_name: string;
  site_name: string;
  bag_presets: number[];
  photo_limit_mb: number;
  qc_fields: Parameter[];
  loss_tolerance_percent: string;
  locale: "en" | "hi" | "gu";
  tax_rates: {
    name: string;
    percent: string;
    effective_from: string;
    supply_location: string;
  }[];
}
export interface Workspace {
  simple_entries?: SimpleEntry[];
  simple_stock?: StockItem[];
  stock_totals?: Partial<Record<EntryKind, string>>;
  org_id: string;
  materials: Material[];
  parties: Party[];
  locations: Location[];
  machines: Machine[];
  shifts: Shift[];
  lots: Lot[];
  batches: Batch[];
  movements: Movement[];
  recipes: Recipe[];
  jobs: Job[];
  dispatches: Dispatch[];
  inspections: Inspection[];
  media: Media[];
  audit: Audit[];
  members: Member[];
  settings: Settings;
  locked_days: string[];
  has_more: boolean;
}
export type EntryKind = "scrap" | "grinding" | "granules" | "sale";
export interface SimpleBag { count: number; weight: string }
export interface SimpleEntry extends Base {
  kind: EntryKind;
  date: string;
  name: string;
  color: string;
  color_hex: string;
  quantity: string;
  bags: SimpleBag[];
  input_lot_id: string | null;
  input_quantity: string;
  deleted: boolean;
}
export interface StockItem {
  id: string; code: string; name: string; color: string; color_hex: string;
  form: string; qc: QC; quantity: string;
}
export interface Session {
  user_id: string;
  email: string;
  org_id: string;
  role: Role;
  permissions: Partial<Record<Permission, boolean>>;
  demo: boolean;
}
export interface Command {
  id: string;
  org_id: string;
  action: string;
  payload: Record<string, unknown>;
  expected_version?: number;
}
export const defaultSettings: Settings = {
  company_name: "SP Plast Industries",
  site_name: "Ahmedabad",
  bag_presets: [25, 30, 35, 50],
  photo_limit_mb: 8,
  qc_fields: [],
  loss_tolerance_percent: "0",
  locale: "en",
  tax_rates: [],
};
export const emptyWorkspace = (org_id: string): Workspace => ({
  org_id,
  materials: [],
  parties: [],
  locations: [],
  machines: [],
  shifts: [],
  lots: [],
  batches: [],
  movements: [],
  recipes: [],
  jobs: [],
  dispatches: [],
  inspections: [],
  media: [],
  audit: [],
  members: [],
  settings: defaultSettings,
  locked_days: [],
  has_more: false,
});
export function can(session: Session, permission: Permission) {
  if (["owner", "admin"].includes(session.role)) return true;
  if (session.permissions[permission] !== undefined)
    return session.permissions[permission];
  const defaults: Record<Role, Permission[]> = {
    owner: [],
    admin: [],
    manager: ["operate", "approve", "inventory", "dispatch"],
    supervisor: ["operate"],
    operator: ["operate"],
    accountant: ["finance", "dispatch"],
    viewer: [],
  };
  return defaults[session.role].includes(permission);
}
