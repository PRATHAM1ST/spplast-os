-- All writes enter through this API. The web login has SELECT + EXECUTE, never direct DML.
create function private.put(t text,o uuid,p jsonb,expected integer default null) returns uuid language plpgsql set search_path='' as $$
declare rid uuid:=coalesce((p->>'id')::uuid,gen_random_uuid()); cols text; vals text; sets text; old_version integer; changed integer;
begin
 if t<>all(array['materials','parties','locations','machines','shifts','jobs','job_charges','recipes','recipe_masters','recipe_ingredients','batches','batch_inputs','batch_outputs','bag_groups','batch_recipe_actuals','machine_readings','lots','inventory_transactions','movements','dispatches','dispatch_lines','dispatch_finances','inspections','media']) then raise exception 'Invalid entity'; end if;
 p:=p-'org_id'-'created_at'-'updated_at'-'created_by'-'updated_by'-'version';
 p:=p||jsonb_build_object('id',rid);
 select string_agg(format('%I',key),','),string_agg(format('r.%I',key),','),string_agg(format('%1$I=excluded.%1$I',key),',') into cols,vals,sets
 from jsonb_object_keys(p) key where key in(select column_name from information_schema.columns where table_schema='app' and table_name=t) and key<>'org_id';
 execute format('select version from app.%I where id=$1 and org_id=$2',t) into old_version using rid,o;
 if old_version is not null and (expected is null or old_version<>expected) then raise exception 'CONFLICT: record changed; review server version'; end if;
 execute format('insert into app.%1$I(%2$s,org_id) select %3$s,$1 from jsonb_populate_record(null::app.%1$I,$2) r on conflict(id) do update set %4$s,updated_at=now(),updated_by=private.actor(),version=app.%1$I.version+1 where app.%1$I.org_id=$1',t,cols,vals,sets) using o,p;
 get diagnostics changed = row_count;
 if changed=0 then raise exception 'Record unavailable'; end if;
 return rid;
end $$;

create function private.move(o uuid,t uuid,l uuid,q numeric) returns void language plpgsql set search_path='' as $$
begin
 if q=0 or q<>round(q,3) then raise exception 'Invalid movement precision or zero quantity'; end if;
 if not exists(select 1 from app.lots where org_id=o and id=l) then raise exception 'Lot unavailable'; end if;
 if private.balance(o,l)+q<0 then raise exception 'Insufficient available stock'; end if;
 insert into app.movements(org_id,transaction_id,lot_id,quantity) values(o,t,l,q);
end $$;

create function app.command(o uuid,command_id uuid,action text,p jsonb,expected integer default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare rid uuid; tx uuid; x jsonb; y jsonb; rec record; b app.batches; lot app.lots; old app.idempotency_records; perm text; result jsonb; own uuid; job uuid; qty numeric; total_in numeric; total_out numeric; bag_weight numeric; recipe app.recipes; request jsonb:=jsonb_build_object('action',action,'payload',p,'expected',expected);
begin
 if not private.member(o) then raise exception 'FORBIDDEN'; end if;
 perform pg_advisory_xact_lock(hashtextextended(o::text,0));
 select * into old from app.idempotency_records where org_id=o and id=command_id;
 if found then
  if old.actor<>private.actor() or old.request<>request then raise exception 'Idempotency key reused for different request'; end if;
  return old.response;
 end if;
 perm:=case when action in ('save_batch','submit_batch','media') then 'operate' when action in ('approve_batch','qc') then 'approve' when action in ('inward','transfer','save_job') then 'inventory' when action in ('dispatch','return') then 'dispatch' when action in ('save_recipe','approve_recipe') then 'recipe_edit' else 'configure' end;
 if not private.allowed(o,perm) then raise exception 'FORBIDDEN: permission % required',perm; end if;
 rid:=coalesce((p->>'id')::uuid,command_id);
 if p ? 'date' and exists(select 1 from app.locked_days where org_id=o and date=(p->>'date')::date) then raise exception 'Production day is locked'; end if;
 if action='master' then
  if p->>'table'<>all(array['materials','parties','locations','machines','shifts']) then raise exception 'Invalid master'; end if;
  rid:=private.put(p->>'table',o,p->'record',expected);
 elsif action='settings' then
  insert into app.settings values(o,p) on conflict(org_id) do update set value=excluded.value;
 elsif action='membership' then
  if p->>'role'='owner' or exists(select 1 from app.memberships where org_id=o and user_id=p->>'user_id' and role='owner') then raise exception 'Owner role cannot be changed here'; end if;
  insert into app.memberships(org_id,user_id,email,role,permissions) values(o,p->>'user_id',p->>'email',p->>'role',coalesce(p->'permissions','{}')) on conflict(org_id,user_id) do update set role=excluded.role,permissions=excluded.permissions,email=excluded.email;
 elsif action='lock_day' then
  if exists(select 1 from app.batches where org_id=o and date=(p->>'date')::date and status in ('draft','submitted')) then raise exception 'Resolve unfinished batches before locking'; end if;
  insert into app.locked_days values(o,(p->>'date')::date,private.actor()) on conflict do nothing;
 elsif action='inward' then
  qty:=(p->>'gross')::numeric-(p->>'tare')::numeric;
  if qty<=0 or (p->>'tare')::numeric<0 then raise exception 'Net weight must be positive'; end if;
  job:=(p->>'job_id')::uuid; own:=(p->>'owner_party_id')::uuid;
  if job is not null and not exists(select 1 from app.jobs where id=job and org_id=o and customer_id=own) then raise exception 'Job ownership mismatch'; end if;
  rid:=private.put('lots',o,jsonb_build_object('id',rid,'code',p->>'code','material_id',p->>'material_id','location_id',p->>'location_id','owner_party_id',own,'job_id',job,'qc','hold','notes',coalesce(p->>'notes','')));
  tx:=private.put('inventory_transactions',o,jsonb_build_object('kind',coalesce(p->>'kind','inward'),'source_id',rid,'date',p->>'date','reason',coalesce(p->>'notes',''),'reference',coalesce(p->>'reference',''),'gross',p->>'gross','tare',p->>'tare','bags',coalesce(p->>'bags','0'),'party_id',p->>'party_id','vehicle',coalesce(p->>'vehicle','')));
  perform private.move(o,tx,rid,qty);
 elsif action='save_batch' then
  select * into b from app.batches where id=rid and org_id=o;
  if found and (b.status<>'draft' or exists(select 1 from app.locked_days where org_id=o and date=b.date)) then raise exception 'Only unlocked draft batches may be edited'; end if;
  if not private.allowed(o,'recipes') and ((p->>'recipe_version_id') is not null or jsonb_array_length(coalesce(p->'recipe_actuals','[]'))>0) then raise exception 'FORBIDDEN: recipe access required'; end if;
  if (p->>'recipe_version_id') is not null and not exists(select 1 from app.recipes where org_id=o and id=(p->>'recipe_version_id')::uuid and status='approved') then raise exception 'Choose an approved recipe version'; end if;
  if (p->>'loss_kg')::numeric>0 and length(trim(p->>'loss_reason'))=0 then raise exception 'Document the loss category'; end if;
  if (p->>'started_at') is not null and (p->>'ended_at') is not null and extract(epoch from ((p->>'ended_at')::timestamptz-(p->>'started_at')::timestamptz))/60 < (p->>'downtime_minutes')::int then raise exception 'Downtime exceeds elapsed time'; end if;
  rid:=private.put('batches',o,(p-'inputs'-'outputs'-'readings'-'recipe_actuals'-'status')||jsonb_build_object('status','draft'),expected);
  delete from app.bag_groups where org_id=o and output_id in(select id from app.batch_outputs where org_id=o and batch_id=rid);
  delete from app.batch_inputs where org_id=o and batch_id=rid;
  delete from app.batch_outputs where org_id=o and batch_id=rid;
  delete from app.batch_recipe_actuals where org_id=o and batch_id=rid;
  delete from app.machine_readings where org_id=o and batch_id=rid;
  for x in select value from jsonb_array_elements(p->'inputs') loop perform private.put('batch_inputs',o,x||jsonb_build_object('batch_id',rid)); end loop;
  for x in select value from jsonb_array_elements(p->'outputs') loop
   perform private.put('batch_outputs',o,(x-'bags')||jsonb_build_object('batch_id',rid));
   for y in select value from jsonb_array_elements(x->'bags') loop perform private.put('bag_groups',o,y||jsonb_build_object('output_id',x->>'id')); end loop;
  end loop;
  for x in select value from jsonb_array_elements(p->'recipe_actuals') loop
   if not exists(select 1 from app.recipe_ingredients where org_id=o and id=(x->>'ingredient_id')::uuid and recipe_id=(p->>'recipe_version_id')::uuid) then raise exception 'Ingredient does not belong to selected version'; end if;
   perform private.put('batch_recipe_actuals',o,x||jsonb_build_object('batch_id',rid));
  end loop;
  for x in select value from jsonb_array_elements(p->'readings') loop
   if not exists(select 1 from app.machines m, jsonb_array_elements(m.parameters) f where m.org_id=o and m.id=(p->>'machine_id')::uuid and f->>'key'=x->>'key' and f->>'unit'=x->>'unit') then raise exception 'Reading must use a configured parameter and unit'; end if;
   perform private.put('machine_readings',o,x||jsonb_build_object('batch_id',rid));
  end loop;
 elsif action in ('submit_batch','approve_batch') then
  select * into b from app.batches where org_id=o and id=rid for update;
  if not found then raise exception 'Batch unavailable'; end if;
  if expected is null or b.version<>expected then raise exception 'CONFLICT: batch changed'; end if;
  if exists(select 1 from app.locked_days where org_id=o and date=b.date) then raise exception 'Production day is locked'; end if;
  if (action='submit_batch' and b.status<>'draft') or (action='approve_batch' and b.status<>'submitted') then raise exception 'Invalid batch transition'; end if;
  select sum(quantity) into total_in from app.batch_inputs where org_id=o and batch_id=rid;
  select sum(quantity) into total_out from app.batch_outputs where org_id=o and batch_id=rid;
  if total_in is null or total_out is null or total_in<>total_out+b.loss_kg then raise exception 'Mass does not reconcile: input %, output %, documented loss %',total_in,total_out,b.loss_kg; end if;
  if b.recipe_version_id is not null then
   select sum(quantity) into qty from app.batch_recipe_actuals where org_id=o and batch_id=rid;
   if qty is null or qty<>total_in then raise exception 'Recipe actual weights must reconcile to consumed input'; end if;
   if exists(select 1 from app.recipe_ingredients i where i.org_id=o and i.recipe_id=b.recipe_version_id and not exists(select 1 from app.batch_recipe_actuals a where a.org_id=o and a.batch_id=rid and a.ingredient_id=i.id)) then raise exception 'Record every recipe ingredient actual weight'; end if;
  end if;
  for rec in select * from app.batch_outputs where org_id=o and batch_id=rid loop
   select sum(count*(weight-case when mode='gross' then tare else 0 end)) into bag_weight from app.bag_groups where org_id=o and output_id=rec.id;
   if bag_weight is not null and bag_weight<>rec.quantity then raise exception 'Bag weights do not equal output weight'; end if;
  end loop;
  if action='approve_batch' then
   job:=b.job_id; own:=null;
   if job is not null then select customer_id into own from app.jobs where id=job and org_id=o; end if;
   tx:=private.put('inventory_transactions',o,jsonb_build_object('kind',b.process,'source_id',rid,'date',b.date,'reason',b.loss_reason));
   for rec in select * from app.batch_inputs where org_id=o and batch_id=rid order by lot_id loop
    select * into lot from app.lots where org_id=o and id=rec.lot_id;
    if lot.qc<>'pass' then raise exception 'Input lot requires QC pass'; end if;
    if lot.owner_party_id is distinct from own or lot.job_id is distinct from job then raise exception 'Material ownership / job mismatch'; end if;
    perform private.move(o,tx,rec.lot_id,-rec.quantity);
   end loop;
   for rec in select * from app.batch_outputs where org_id=o and batch_id=rid loop
    perform private.put('lots',o,jsonb_build_object('id',rec.id,'code',upper(case b.process when 'grinding' then 'GRD' else 'GRN' end)||'-'||to_char(b.date,'YYYYMMDD')||'-'||left(rec.id::text,8),'material_id',rec.material_id,'location_id',rec.location_id,'owner_party_id',own,'job_id',job,'qc','hold','source_batch_id',rid));
    perform private.move(o,tx,rec.id,rec.quantity);
   end loop;
   if job is not null then update app.jobs set status='qc',updated_at=now(),version=version+1 where id=job and org_id=o; end if;
  end if;
  update app.batches set status=case action when 'submit_batch' then 'submitted' else 'approved' end,version=version+1,updated_at=now(),updated_by=private.actor() where id=rid and org_id=o;
  insert into app.approval_events(org_id,record_id,action,reason) values(o,rid,action,coalesce(p->>'reason',''));
 elsif action='qc' then
  select * into lot from app.lots where org_id=o and id=(p->>'lot_id')::uuid for update;
  if not found then raise exception 'Lot unavailable'; end if;
  if expected is null or lot.version<>expected then raise exception 'CONFLICT: lot changed'; end if;
  rid:=private.put('inspections',o,p-'id');
  update app.lots set qc=p->>'disposition',version=version+1,updated_at=now(),updated_by=private.actor() where id=lot.id;
 elsif action='dispatch' then
  job:=(p->>'job_id')::uuid; own:=case when job is null then null else (p->>'customer_id')::uuid end;
  if job is not null and not exists(select 1 from app.jobs where org_id=o and id=job and customer_id=own) then raise exception 'Job customer mismatch'; end if;
  if jsonb_array_length(p->'lines')=0 then raise exception 'Add stock lots'; end if;
  rid:=private.put('dispatches',o,p-'lines'-'rate'-'tax_percent'-'transport'-'discount'-'total'-'supply_location'-'tax_effective_date');
  tx:=private.put('inventory_transactions',o,jsonb_build_object('kind','dispatch','source_id',rid,'date',p->>'date'));
  total_in:=0;
  for x in select value from jsonb_array_elements(p->'lines') loop
   select * into lot from app.lots where org_id=o and id=(x->>'lot_id')::uuid;
   if not found or lot.qc<>'pass' then raise exception 'Dispatch requires QC passed stock'; end if;
   if lot.owner_party_id is distinct from own or lot.job_id is distinct from job then raise exception 'Cannot dispatch material belonging to another owner or job'; end if;
   qty:=(x->>'quantity')::numeric; if qty<=0 then raise exception 'Quantity must be positive'; end if;
   perform private.put('dispatch_lines',o,x||jsonb_build_object('dispatch_id',rid));
   perform private.move(o,tx,lot.id,-qty); total_in:=total_in+qty;
  end loop;
  if p ? 'rate' then
   if not private.allowed(o,'finance') then raise exception 'FORBIDDEN: financial access required'; end if;
   qty:=round(total_in*(p->>'rate')::numeric,2);
   qty:=qty+round(qty*(p->>'tax_percent')::numeric/100,2)+round((p->>'transport')::numeric,2)-round((p->>'discount')::numeric,2);
   perform private.put('dispatch_finances',o,jsonb_build_object('dispatch_id',rid,'rate',p->>'rate','tax_percent',p->>'tax_percent','transport',p->>'transport','discount',p->>'discount','total',qty,'supply_location',p->>'supply_location','tax_effective_date',p->>'tax_effective_date'));
  end if;
 elsif action='save_job' then
  rid:=private.put('jobs',o,p-'rate'-'charge_basis',expected);
  if p ? 'rate' then
   if not private.allowed(o,'finance') then raise exception 'FORBIDDEN: financial access required'; end if;
   delete from app.job_charges where org_id=o and job_id=rid;
   perform private.put('job_charges',o,jsonb_build_object('job_id',rid,'rate',p->>'rate','charge_basis',p->>'charge_basis'));
  end if;
 elsif action='save_recipe' then
  if not private.allowed(o,'recipes') then raise exception 'FORBIDDEN'; end if;
  if exists(select 1 from app.recipes where id=rid) then raise exception 'Save as a new version with a new ID'; end if;
  if not exists(select 1 from app.recipe_masters where id=(p->>'master_id')::uuid and org_id=o) then perform private.put('recipe_masters',o,jsonb_build_object('id',p->>'master_id','name',p->>'name','polymer',p->>'polymer')); end if;
  select coalesce(max(revision),0)+1 into qty from app.recipes where org_id=o and master_id=(p->>'master_id')::uuid;
  rid:=private.put('recipes',o,(p-'ingredients'-'status'-'revision')||jsonb_build_object('status','experimental','revision',qty));
  qty:=0;
  for x in select value from jsonb_array_elements(p->'ingredients') loop
   perform private.put('recipe_ingredients',o,x||jsonb_build_object('recipe_id',rid,'position',qty)); qty:=qty+1;
  end loop;
 elsif action='approve_recipe' then
  select * into recipe from app.recipes where org_id=o and id=rid;
  if not found or recipe.status<>'experimental' then raise exception 'Only experimental recipes can be approved'; end if;
  select sum(amount/case unit when 'g' then 1000 else 1 end),sum(case when is_base then amount/case unit when 'g' then 1000 else 1 end else 0 end) into total_in,total_out from app.recipe_ingredients where org_id=o and recipe_id=rid;
  if total_in is null then raise exception 'Recipe has no ingredients'; end if;
  if exists(select 1 from app.recipe_ingredients where recipe_id=rid and ((recipe.basis='total_percent' and unit<>'%') or (recipe.basis<>'total_percent' and unit='%'))) then raise exception 'Recipe units do not match basis'; end if;
  if (recipe.basis in ('total_percent','per_100') and total_in<>100) or (recipe.basis='per_1000' and total_in<>1000) or (recipe.basis='base_resin' and total_out<>recipe.base_quantity) then raise exception 'Recipe amounts do not reconcile with declared basis'; end if;
  update app.recipes set status='approved',version=version+1,updated_at=now(),updated_by=private.actor() where id=rid;
 elsif action='transfer' then
  select * into lot from app.lots where id=(p->>'lot_id')::uuid and org_id=o;
  if not found then raise exception 'Lot unavailable'; end if;
  qty:=(p->>'quantity')::numeric; if qty<=0 then raise exception 'Positive quantity required'; end if;
  rid:=private.put('lots',o,jsonb_build_object('id',rid,'code',p->>'code','material_id',lot.material_id,'location_id',p->>'location_id','owner_party_id',lot.owner_party_id,'job_id',lot.job_id,'qc',lot.qc,'source_batch_id',lot.source_batch_id,'notes','Split / transfer from '||lot.code));
  tx:=private.put('inventory_transactions',o,jsonb_build_object('kind','transfer','source_id',rid,'date',p->>'date','reason',p->>'reason'));
  perform private.move(o,tx,lot.id,-qty); perform private.move(o,tx,rid,qty);
 elsif action='adjust' then
  if length(trim(coalesce(p->>'reason','')))<3 then raise exception 'Adjustment reason is required'; end if;
  tx:=private.put('inventory_transactions',o,jsonb_build_object('kind','adjustment','source_id',rid,'date',p->>'date','reason',p->>'reason'));
  perform private.move(o,tx,(p->>'lot_id')::uuid,(p->>'quantity')::numeric);
 elsif action='reverse' then
  select * into rec from app.inventory_transactions where id=(p->>'transaction_id')::uuid and org_id=o for update;
  if not found or rec.reversed_by is not null or rec.kind in ('reversal','return') then raise exception 'Transaction cannot be reversed'; end if;
  if length(trim(coalesce(p->>'reason','')))<3 then raise exception 'Reversal reason required'; end if;
  if exists(select 1 from app.inventory_transactions where org_id=o and source_id=rec.source_id and kind='return') then raise exception 'Dispatch has partial returns; reconcile remaining quantities instead'; end if;
  tx:=private.put('inventory_transactions',o,jsonb_build_object('kind','reversal','source_id',rec.source_id,'date',p->>'date','reason',p->>'reason'));
  for x in select to_jsonb(m) from app.movements m where org_id=o and transaction_id=rec.id order by quantity desc loop perform private.move(o,tx,(x->>'lot_id')::uuid,-(x->>'quantity')::numeric); end loop;
  update app.inventory_transactions set reversed_by=tx where id=rec.id;
  update app.batches set status='reversed',version=version+1 where id=rec.source_id and org_id=o;
  update app.dispatches set status='reversed',version=version+1 where id=rec.source_id and org_id=o;
 elsif action='return' then
  if not exists(select 1 from app.dispatches where org_id=o and id=(p->>'dispatch_id')::uuid and status='approved') then raise exception 'Dispatch unavailable'; end if;
  qty:=(p->>'quantity')::numeric;
  select coalesce(sum(quantity),0) into total_in from app.dispatch_lines where org_id=o and dispatch_id=(p->>'dispatch_id')::uuid and lot_id=(p->>'lot_id')::uuid;
  select coalesce(sum(m.quantity),0) into total_out from app.movements m join app.inventory_transactions t on t.id=m.transaction_id where m.org_id=o and t.source_id=(p->>'dispatch_id')::uuid and t.kind='return' and m.lot_id=(p->>'lot_id')::uuid;
  if qty<=0 or qty>total_in-total_out then raise exception 'Return exceeds outstanding dispatch'; end if;
  tx:=private.put('inventory_transactions',o,jsonb_build_object('kind','return','source_id',p->>'dispatch_id','date',p->>'date','reason',p->>'reason'));
  perform private.move(o,tx,(p->>'lot_id')::uuid,qty);
  update app.lots set qc='hold',version=version+1 where org_id=o and id=(p->>'lot_id')::uuid;
 elsif action='media' then
  if exists(select 1 from app.media where id=rid) then raise exception 'CONFLICT: Saved photos are immutable'; end if;
  if p->>'record_type'='recipe' and not private.allowed(o,'recipes') then raise exception 'FORBIDDEN'; end if;
  perm:=case p->>'record_type' when 'lot' then 'lots' when 'batch' then 'batches' when 'recipe' then 'recipes' when 'job' then 'jobs' when 'dispatch' then 'dispatches' when 'inspection' then 'inspections' when 'machine' then 'machines' end;
  if perm is null then raise exception 'Invalid attachment type'; end if;
  execute format('select id from app.%I where org_id=$1 and id=$2',perm) into tx using o,(p->>'record_id')::uuid;
  if tx is null then raise exception 'Attachment record unavailable'; end if;
  if p->>'path' not like o::text||'/%' or p->>'thumbnail_path' not like o::text||'/%' then raise exception 'Invalid storage path'; end if;
  rid:=private.put('media',o,p);
 else raise exception 'Unknown command'; end if;
 insert into app.audit(org_id,action,record_id,detail) values(o,action,rid,coalesce(p->>'reason',p->>'change_reason','Recorded by '||private.actor()));
 result:=jsonb_build_object('id',rid,'transaction_id',tx,'status','saved');
 insert into app.idempotency_records values(o,command_id,private.actor(),request,result,now());
 return result;
end $$;
revoke all on function private.put(text,uuid,jsonb,integer),private.move(uuid,uuid,uuid,numeric) from public;
revoke all on function app.command(uuid,uuid,text,jsonb,integer) from public;
grant execute on function app.command(uuid,uuid,text,jsonb,integer) to spplast_app;
