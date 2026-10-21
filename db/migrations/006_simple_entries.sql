-- A small stock ledger alongside existing records. Old production is preserved.
create table app.simple_entries (
 id uuid primary key, org_id uuid not null references app.organizations(id),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 created_by text not null default private.actor(), version integer not null default 1,
 kind text not null check(kind in ('scrap','grinding','granules','sale')), date date not null,
 name text not null, color text not null default '', color_hex text not null default '#ded8bd',
 quantity numeric(15,3) not null check(quantity>0), bags jsonb not null default '[]',
 input_lot_id uuid, input_quantity numeric(15,3) not null default 0 check(input_quantity>=0),
 deleted boolean not null default false, unique(org_id,id),
 foreign key(org_id,input_lot_id) references app.lots(org_id,id)
);
create index simple_entries_org_date on app.simple_entries(org_id,date desc,created_at desc);
alter table app.simple_entries enable row level security;
create policy tenant_read on app.simple_entries for select using(private.member(org_id));
grant select on app.simple_entries to spplast_app;
alter table app.media drop constraint media_record_type_check;
alter table app.media add constraint media_record_type_check check(record_type in ('lot','batch','recipe','job','dispatch','inspection','machine','entry'));

alter function app.command(uuid,uuid,text,jsonb,integer) rename to command_legacy;
create function app.command(o uuid,command_id uuid,action text,p jsonb,expected integer default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare prior app.simple_entries; old app.idempotency_records; rid uuid:=(p->>'id')::uuid;
 request jsonb:=jsonb_build_object('action',action,'payload',p,'expected',expected);
 result jsonb; tx uuid; loc uuid; mat uuid; source app.lots; delta record; k text; q numeric; iq numeric; inp uuid;
 nm text; col text; hx text; d date; bag jsonb; total numeric:=0; n integer; w numeric; perm text;
begin
 if action not in ('save_entry','delete_entry') and not (action='media' and p->>'record_type'='entry') then
   return app.command_legacy(o,command_id,action,p,expected);
 end if;
 if not private.member(o) then raise exception 'FORBIDDEN'; end if;
 perform pg_advisory_xact_lock(hashtextextended(o::text,0));
 select * into old from app.idempotency_records where org_id=o and id=command_id;
 if found then
   if old.actor<>private.actor() or old.request<>request then raise exception 'Idempotency key reused for different request'; end if;
   return old.response;
 end if;
 if action='media' then
   if not private.allowed(o,'operate') or not exists(select 1 from app.simple_entries where org_id=o and id=(p->>'record_id')::uuid and not deleted) then raise exception 'FORBIDDEN: Entry unavailable'; end if;
   if p->>'path' not like o::text||'/%' or p->>'thumbnail_path' not like o::text||'/%' then raise exception 'Invalid storage path'; end if;
   if exists(select 1 from app.media where id=rid) then raise exception 'CONFLICT: Saved photo already exists'; end if;
   rid:=private.put('media',o,p);
 else
   select * into prior from app.simple_entries where id=rid and org_id=o for update;
   if prior.id is not null and (expected is null or expected<>prior.version) then raise exception 'CONFLICT: Entry changed. Refresh and try again'; end if;
   if prior.deleted then raise exception 'Entry was deleted'; end if;
   if action='delete_entry' and prior.id is null then raise exception 'Entry unavailable'; end if;
   k:=case when action='delete_entry' then prior.kind else p->>'kind' end;
   if k is null or k not in ('scrap','grinding','granules','sale') then raise exception 'Choose an entry type'; end if;
   if prior.id is not null and k<>prior.kind then raise exception 'Entry type cannot change'; end if;
   perm:=case k when 'sale' then 'dispatch' when 'scrap' then 'inventory' else 'operate' end;
   if not private.allowed(o,perm) then raise exception 'FORBIDDEN'; end if;
   d:=case when action='delete_entry' then prior.date else (p->>'date')::date end;
   if d is null then raise exception 'Choose a date'; end if;
   if exists(select 1 from app.locked_days where org_id=o and date in (d,prior.date)) then raise exception 'This date is locked'; end if;
   q:=case when action='delete_entry' then 0 else (p->>'quantity')::numeric end;
   inp:=case when action='delete_entry' then null else (p->>'input_lot_id')::uuid end;
   iq:=case when inp is null then 0 when k='sale' then q else (p->>'input_quantity')::numeric end;
   if action='save_entry' then
     if q is null or q<=0 or q<>round(q,3) then raise exception 'Enter a positive weight with up to 3 decimal places'; end if;
     if inp=rid then raise exception 'An entry cannot use its own output'; end if;
     if k='scrap' and inp is not null then raise exception 'Scrap incoming does not consume stock'; end if;
     if k='sale' and inp is null then raise exception 'Choose the material being sold'; end if;
     if inp is not null then
       select * into source from app.lots where org_id=o and id=inp and owner_party_id is null;
       if not found then raise exception 'Material unavailable'; end if;
       if source.qc<>'pass' then raise exception 'This material is on quality hold'; end if;
       if iq is null or iq<=0 or iq<>round(iq,3) then raise exception 'Enter input weight'; end if;
     end if;
     if jsonb_typeof(p->'bags') is distinct from 'array' then raise exception 'Invalid bags'; end if;
     for bag in select value from jsonb_array_elements(p->'bags') loop
       n:=(bag->>'count')::integer; w:=(bag->>'weight')::numeric;
       if n is null or n<1 or n>100000 or w is null or w<=0 or w<>round(w,3) then raise exception 'Check bag count and weight'; end if;
       total:=total+n*w;
     end loop;
     if jsonb_array_length(p->'bags')>0 and total<>q then raise exception 'Bag weights do not match total'; end if;
     nm:=trim(p->>'name'); col:=coalesce(p->>'color',''); hx:=coalesce(p->>'color_hex','#ded8bd');
     if nm is null or length(nm)<1 or length(nm)>150 or hx !~ '^#[a-fA-F0-9]{6}$' then raise exception 'Check material name and colour'; end if;
     if k<>'sale' then
       if prior.id is not null then
         if private.balance(o,rid)<prior.quantity and (nm<>prior.name or col<>prior.color or hx<>prior.color_hex) then raise exception 'Some material is already used or sold. Keep its name and colour, or edit those later entries first'; end if;
         select material_id into mat from app.lots where id=rid and org_id=o;
         update app.materials set name=nm,color=col,color_hex=hx,updated_at=now(),version=version+1 where id=mat and org_id=o;
       else
         select id into loc from app.locations where org_id=o order by created_at limit 1;
         if loc is null then loc:=private.put('locations',o,jsonb_build_object('name','Stock','code','STOCK')); end if;
         mat:=private.put('materials',o,jsonb_build_object('code','ENTRY-'||rid::text,'name',nm,'polymer','Other','form',case k when 'scrap' then 'incoming_scrap' when 'grinding' then 'grinding_flakes' else 'granules' end,'color',col,'color_hex',hx));
         perform private.put('lots',o,jsonb_build_object('id',rid,'code',upper(k)||'-'||left(rid::text,8),'material_id',mat,'location_id',loc,'qc','pass'));
       end if;
     end if;
   end if;
   tx:=private.put('inventory_transactions',o,jsonb_build_object('kind',case when action='delete_entry' then 'entry_deleted' when prior.id is not null then 'entry_updated' else k end,'source_id',rid,'date',d,'reason','Simple entry'));
   -- Apply net changes, so editing a partially consumed output is safe.
   for delta in
     select lot_id,sum(amount) amount from (
       select prior.id lot_id,-prior.quantity amount where prior.id is not null and prior.kind<>'sale'
       union all select prior.input_lot_id,prior.input_quantity where prior.input_lot_id is not null
       union all select rid,q where action='save_entry' and k<>'sale'
       union all select inp,-iq where inp is not null
     ) changes group by lot_id having sum(amount)<>0 order by sum(amount) desc
   loop
     if private.balance(o,delta.lot_id)+delta.amount<0 then raise exception 'Some material is already used or sold. Edit those entries first, or keep enough stock'; end if;
     perform private.move(o,tx,delta.lot_id,delta.amount);
   end loop;
   if action='delete_entry' then
     update app.simple_entries set deleted=true,version=version+1,updated_at=now() where id=rid and org_id=o;
   else
     insert into app.simple_entries(id,org_id,kind,date,name,color,color_hex,quantity,bags,input_lot_id,input_quantity)
       values(rid,o,k,d,nm,col,hx,q,p->'bags',inp,iq)
       on conflict(id) do update set date=excluded.date,name=excluded.name,color=excluded.color,color_hex=excluded.color_hex,quantity=excluded.quantity,bags=excluded.bags,input_lot_id=excluded.input_lot_id,input_quantity=excluded.input_quantity,version=app.simple_entries.version+1,updated_at=now()
       where app.simple_entries.org_id=o;
     if not found then raise exception 'Entry unavailable'; end if;
     delete from app.media where org_id=o and record_type='entry' and record_id=rid and id in(select value::uuid from jsonb_array_elements_text(coalesce(p->'remove_photo_ids','[]')));
   end if;
 end if;
 insert into app.audit(org_id,action,record_id,detail) values(o,action,rid,case when action='delete_entry' then to_jsonb(prior)::text else p::text end);
 result:=jsonb_build_object('id',rid,'status','saved');
 insert into app.idempotency_records values(o,command_id,private.actor(),request,result,now());
 return result;
end $$;
revoke all on function app.command(uuid,uuid,text,jsonb,integer) from public;
grant execute on function app.command(uuid,uuid,text,jsonb,integer) to spplast_app;

alter function app.workspace(uuid,date,date,integer) rename to workspace_legacy;
create function app.workspace(o uuid,from_date date,to_date date,page_offset integer default 0) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare result jsonb; entries jsonb; stock jsonb; more boolean;
begin
 result:=app.workspace_legacy(o,from_date,to_date,page_offset);
 select coalesce(jsonb_agg(to_jsonb(e)||jsonb_build_object('quantity',e.quantity::text,'input_quantity',e.input_quantity::text)),'[]') into entries
 from (select * from app.simple_entries where org_id=o and not deleted and date between from_date and to_date order by date desc,created_at desc,id limit 501 offset page_offset) e;
 select coalesce(jsonb_agg(to_jsonb(s)),'[]') into stock from (
   select l.id,l.code,m.name,m.color,m.color_hex,m.form,l.qc,private.balance(o,l.id)::text quantity
   from app.lots l join app.materials m on m.id=l.material_id and m.org_id=l.org_id
   where l.org_id=o and l.owner_party_id is null and private.balance(o,l.id)>0
   order by l.created_at desc,l.id limit 501 offset page_offset
 ) s;
 more:=jsonb_array_length(entries)>500 or jsonb_array_length(stock)>500;
 if jsonb_array_length(entries)>500 then entries:=entries-500; end if;
 if jsonb_array_length(stock)>500 then stock:=stock-500; end if;
 return result||jsonb_build_object('simple_entries',entries,'simple_stock',stock,'has_more',more or (result->>'has_more')::boolean,
 'stock_totals',(select coalesce(jsonb_object_agg(kind,quantity),'{}') from (
   select case m.form when 'grinding_flakes' then 'grinding' when 'granules' then 'granules' else 'scrap' end kind,sum(private.balance(o,l.id))::text quantity
   from app.lots l join app.materials m on m.id=l.material_id and m.org_id=l.org_id where l.org_id=o and l.owner_party_id is null group by 1
 ) totals));
end $$;
revoke all on function app.workspace(uuid,date,date,integer) from public;
grant execute on function app.workspace(uuid,date,date,integer) to spplast_app;
