// Generate consistent tenant keys. Commit output; use new migrations after deployment.
import { mkdirSync, writeFileSync } from "node:fs";
const definitions = {
  factory_sites: `name text not null, address text not null default ''`,
  parties: `name text not null, kind text not null default 'both', phone text not null default '', gstin text not null default '', address text not null default ''`,
  materials: `code text not null, name text not null, polymer text not null, form text not null, color text not null default '', color_hex text not null default '#a8b6a0', grade text not null default '', active boolean not null default true, notes text not null default '', unique(org_id,code)`,
  locations: `name text not null, code text not null, unique(org_id,code)`,
  machines: `name text not null, code text not null, category text not null, status text not null default 'available', capacity_kg_hour numeric(15,3), parameters jsonb not null default '[]' check(jsonb_typeof(parameters)='array'), notes text not null default '', unique(org_id,code)`,
  shifts: `name text not null, starts_at time not null, ends_at time not null`,
  jobs: `code text not null, customer_id uuid not null, process text not null check(process in ('grinding','granules')), material_id uuid not null, expected_date date, status text not null default 'awaiting_processing', notes text not null default '', unique(org_id,code), foreign key(org_id,customer_id) references app.parties(org_id,id), foreign key(org_id,material_id) references app.materials(org_id,id)`,
  job_charges: `job_id uuid not null, rate numeric(15,4) not null check(rate>=0), charge_basis text not null check(charge_basis in ('input_kg','output_kg','flat','custom')), foreign key(org_id,job_id) references app.jobs(org_id,id), unique(org_id,job_id)`,
  recipe_masters: `name text not null, polymer text not null`,
  recipes: `master_id uuid not null, name text not null, color text not null, color_hex text not null, polymer text not null, basis text not null check(basis in ('total_percent','per_100','per_1000','fixed','base_resin')), base_quantity numeric(15,6) not null check(base_quantity>0), status text not null default 'experimental' check(status in ('experimental','approved')), revision integer not null check(revision>0), change_reason text not null, notes text not null default '', unique(org_id,master_id,revision), foreign key(org_id,master_id) references app.recipe_masters(org_id,id)`,
  recipe_ingredients: `recipe_id uuid not null, name text not null, material_id uuid, category text not null, amount numeric(15,6) not null check(amount>0), unit text not null check(unit in ('kg','g','%')), is_base boolean not null default false, position integer not null, foreign key(org_id,recipe_id) references app.recipes(org_id,id), foreign key(org_id,material_id) references app.materials(org_id,id)`,
  batches: `code text not null, date date not null, process text not null check(process in ('grinding','granules')), machine_id uuid not null, shift_id uuid not null, operator text not null, supervisor text not null default '', job_id uuid, status text not null default 'draft' check(status in ('draft','submitted','approved','reversed')), loss_kg numeric(15,3) not null default 0 check(loss_kg>=0), loss_reason text not null default '', notes text not null default '', started_at timestamptz, ended_at timestamptz, downtime_minutes integer not null default 0 check(downtime_minutes>=0), downtime_reason text not null default '', recipe_version_id uuid, unique(org_id,code), foreign key(org_id,machine_id) references app.machines(org_id,id), foreign key(org_id,shift_id) references app.shifts(org_id,id), foreign key(org_id,job_id) references app.jobs(org_id,id), foreign key(org_id,recipe_version_id) references app.recipes(org_id,id), check(ended_at is null or started_at is null or ended_at>=started_at)`,
  lots: `code text not null, material_id uuid not null, location_id uuid not null, owner_party_id uuid, job_id uuid, qc text not null default 'hold' check(qc in ('hold','pass','rework','reject')), source_batch_id uuid, notes text not null default '', unique(org_id,code), foreign key(org_id,material_id) references app.materials(org_id,id), foreign key(org_id,location_id) references app.locations(org_id,id), foreign key(org_id,owner_party_id) references app.parties(org_id,id), foreign key(org_id,source_batch_id) references app.batches(org_id,id), foreign key(org_id,job_id) references app.jobs(org_id,id), check(job_id is null or owner_party_id is not null)`,
  batch_inputs: `batch_id uuid not null, lot_id uuid not null, quantity numeric(15,3) not null check(quantity>0), foreign key(org_id,batch_id) references app.batches(org_id,id), foreign key(org_id,lot_id) references app.lots(org_id,id), unique(org_id,batch_id,lot_id)`,
  batch_outputs: `batch_id uuid not null, material_id uuid not null, location_id uuid not null, quantity numeric(15,3) not null check(quantity>0), disposition text not null check(disposition in ('hold','pass','rework','reject')), kind text not null check(kind in ('usable','scrap','rework')), foreign key(org_id,batch_id) references app.batches(org_id,id), foreign key(org_id,material_id) references app.materials(org_id,id), foreign key(org_id,location_id) references app.locations(org_id,id)`,
  bag_groups: `output_id uuid not null, label text not null default '', count integer not null check(count>0), weight numeric(15,3) not null check(weight>=0), tare numeric(15,3) not null default 0 check(tare>=0), mode text not null check(mode in ('net','gross')), serial text, foreign key(org_id,output_id) references app.batch_outputs(org_id,id), unique(org_id,serial), check(mode='net' or weight>=tare)`,
  batch_recipe_actuals: `batch_id uuid not null, ingredient_id uuid not null, quantity numeric(15,3) not null check(quantity>=0), foreign key(org_id,batch_id) references app.batches(org_id,id), foreign key(org_id,ingredient_id) references app.recipe_ingredients(org_id,id)`,
  machine_readings: `batch_id uuid not null, key text not null, value text not null, unit text not null, measured_at timestamptz not null, foreign key(org_id,batch_id) references app.batches(org_id,id)`,
  inventory_transactions: `kind text not null, source_id uuid not null, date date not null, reason text not null default '', reversed_by uuid, reference text not null default '', gross numeric(15,3), tare numeric(15,3), bags integer, party_id uuid, vehicle text not null default '', foreign key(org_id,party_id) references app.parties(org_id,id)`,
  movements: `transaction_id uuid not null, lot_id uuid not null, quantity numeric(15,3) not null check(quantity<>0), foreign key(org_id,transaction_id) references app.inventory_transactions(org_id,id), foreign key(org_id,lot_id) references app.lots(org_id,id)`,
  dispatches: `code text not null, date date not null, customer_id uuid not null, job_id uuid, bags integer not null default 0 check(bags>=0), status text not null default 'approved' check(status in ('approved','reversed')), vehicle text not null default '', reference text not null default '', notes text not null default '', unique(org_id,code), foreign key(org_id,customer_id) references app.parties(org_id,id), foreign key(org_id,job_id) references app.jobs(org_id,id)`,
  dispatch_lines: `dispatch_id uuid not null, lot_id uuid not null, quantity numeric(15,3) not null check(quantity>0), foreign key(org_id,dispatch_id) references app.dispatches(org_id,id), foreign key(org_id,lot_id) references app.lots(org_id,id)`,
  dispatch_finances: `dispatch_id uuid not null, rate numeric(15,4) not null check(rate>=0), tax_percent numeric(8,4) not null check(tax_percent>=0 and tax_percent<=100), transport numeric(15,2) not null check(transport>=0), discount numeric(15,2) not null check(discount>=0), total numeric(15,2) not null check(total>=0), supply_location text not null, tax_effective_date date not null, foreign key(org_id,dispatch_id) references app.dispatches(org_id,id), unique(org_id,dispatch_id)`,
  inspections: `lot_id uuid not null, disposition text not null check(disposition in ('hold','pass','rework','reject')), shade text not null default '', cleanliness text not null default '', notes text not null default '', measurements jsonb not null default '[]' check(jsonb_typeof(measurements)='array'), foreign key(org_id,lot_id) references app.lots(org_id,id)`,
  media: `record_id uuid not null, record_type text not null check(record_type in ('lot','batch','recipe','job','dispatch','inspection','machine')), caption text not null default '', category text not null, path text not null, thumbnail_path text not null, mime text not null, size integer not null check(size>0), unique(org_id,path)`,
  approval_events: `record_id uuid not null, action text not null, reason text not null`,
  audit: `action text not null, record_id uuid not null, detail text not null`,
};
let sql = `-- Generated by scripts/schema.mjs. Use NEW migrations after deployment.
create schema if not exists app;
create schema if not exists private;
create table app.organizations(id uuid primary key default gen_random_uuid(),name text not null,created_at timestamptz not null default now());
create table app.memberships(org_id uuid not null references app.organizations(id),user_id text not null,email text not null,role text not null check(role in ('owner','admin','manager','supervisor','operator','accountant','viewer')),permissions jsonb not null default '{}',primary key(org_id,user_id));
create function private.actor() returns text language sql stable as $$ select nullif(current_setting('app.user_id',true),'') $$;
create function private.member(o uuid) returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from app.memberships where org_id=o and user_id=private.actor()) $$;
create function private.allowed(o uuid,p text) returns boolean language sql stable security definer set search_path='' as $$ select coalesce((select case when role in ('owner','admin') then true when permissions ? p then (permissions->>p)::boolean else case role when 'manager' then p=any(array['operate','approve','inventory','dispatch']) when 'supervisor' then p='operate' when 'operator' then p='operate' when 'accountant' then p=any(array['finance','dispatch']) else false end end from app.memberships where org_id=o and user_id=private.actor()),false) $$;
`;
for (const [name, definition] of Object.entries(definitions)) {
  sql += `\ncreate table app.${name}(id uuid primary key default gen_random_uuid(),org_id uuid not null references app.organizations(id),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),created_by text not null default private.actor(),updated_by text not null default private.actor(),version integer not null default 1,unique(org_id,id),${definition});\ncreate index ${name}_org_created on app.${name}(org_id,created_at desc);\n`;
}
sql += `
create table app.settings(org_id uuid primary key references app.organizations(id),value jsonb not null);
create table app.locked_days(org_id uuid not null references app.organizations(id),date date not null,locked_by text not null,primary key(org_id,date));
create table app.idempotency_records(org_id uuid not null references app.organizations(id),id uuid not null,actor text not null,request jsonb not null,response jsonb not null,created_at timestamptz not null default now(),primary key(org_id,id));
create index batches_org_date on app.batches(org_id,date desc);
create index movements_lot on app.movements(org_id,lot_id);
create index lots_material on app.lots(org_id,material_id);
create index batch_inputs_lot on app.batch_inputs(org_id,lot_id);
create index lots_source on app.lots(org_id,source_batch_id);
create index transactions_date on app.inventory_transactions(org_id,date desc);
create index dispatches_date on app.dispatches(org_id,date desc);
create index media_record on app.media(org_id,record_id);
create function private.immutable() returns trigger language plpgsql as $$ begin raise exception 'Posted history is immutable; use a reversal'; end $$;
create trigger immutable_movements before update or delete on app.movements for each row execute function private.immutable();
create trigger immutable_audit before update or delete on app.audit for each row execute function private.immutable();
create function private.recipe_guard() returns trigger language plpgsql set search_path='' as $$ begin
 if TG_TABLE_NAME='recipes' then if old.status='approved' then raise exception 'Approved recipe is immutable'; end if;
 else if exists(select 1 from app.recipes where id=old.recipe_id and status='approved') then raise exception 'Approved ingredients are immutable'; end if; end if;
 if TG_OP='DELETE' then return old; end if; return new; end $$;
create trigger recipe_immutable before update or delete on app.recipes for each row execute function private.recipe_guard();
create trigger ingredients_immutable before update or delete on app.recipe_ingredients for each row execute function private.recipe_guard();
create function private.balance(o uuid,l uuid) returns numeric language sql stable set search_path='' as $$ select coalesce(sum(quantity),0) from app.movements where org_id=o and lot_id=l $$;
`;
for (const table of [
  "organizations",
  "memberships",
  ...Object.keys(definitions),
  "settings",
  "locked_days",
  "idempotency_records",
]) {
  const col = table === "organizations" ? "id" : "org_id";
  let policy = `private.member(${col})`;
  if (
    [
      "recipes",
      "recipe_ingredients",
      "recipe_masters",
      "batch_recipe_actuals",
    ].includes(table)
  )
    policy = `private.allowed(org_id,'recipes')`;
  if (["job_charges", "dispatch_finances"].includes(table))
    policy = `private.allowed(org_id,'finance')`;
  if (["audit", "memberships", "idempotency_records"].includes(table))
    policy += ` and (private.allowed(org_id,'configure') or ${table === "memberships" ? "user_id" : table === "idempotency_records" ? "actor" : "created_by"}=private.actor())`;
  if (table === "media")
    policy += ` and (record_type<>'recipe' or private.allowed(org_id,'recipes'))`;
  sql += `alter table app.${table} enable row level security;\ncreate policy tenant_read on app.${table} for select using (${policy});\n`;
}
sql += `
do $$ begin if not exists(select 1 from pg_roles where rolname='spplast_app') then create role spplast_app nologin nosuperuser nobypassrls; end if; end $$;
grant usage on schema app,private to spplast_app;
grant select on all tables in schema app to spplast_app;
revoke all on all functions in schema private from public;
grant execute on function private.actor(),private.member(uuid),private.allowed(uuid,text),private.balance(uuid,uuid) to spplast_app;
`;
mkdirSync("db/migrations", { recursive: true });
writeFileSync("db/migrations/001_schema.sql", sql);
