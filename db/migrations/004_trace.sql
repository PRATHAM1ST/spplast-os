-- All-history genealogy. Invoker rights preserve organization and recipe RLS.
create index if not exists batch_input_lot_idx on app.batch_inputs(org_id,lot_id);
create index if not exists lot_source_idx on app.lots(org_id,source_batch_id);
create index if not exists movement_lot_idx on app.movements(org_id,lot_id);
create or replace function app.trace(o uuid, root uuid) returns jsonb
language sql stable security invoker set search_path=pg_catalog,app,private as $$
with recursive edges as (
 select i.lot_id as parent,l.id as child,b.id as document,b.code,b.process as stage,b.date,b.status,
 i.quantity::text as input_kg,bo.quantity::text as output_kg,b.operator,m.name as machine,
 r.name as recipe,r.revision
 from app.batch_inputs i join app.batches b on b.id=i.batch_id and b.org_id=i.org_id
 join app.lots l on l.source_batch_id=b.id and l.org_id=b.org_id
 join app.batch_outputs bo on bo.id=l.id and bo.org_id=l.org_id
 left join app.machines m on m.id=b.machine_id and m.org_id=b.org_id
 left join app.recipes r on r.id=b.recipe_version_id and r.org_id=b.org_id
 where i.org_id=o
 union all
 select a.lot_id,z.lot_id,t.id,'Transfer',t.kind,t.date,
 case when t.reversed_by is null then 'approved' else 'reversed' end,
 (-a.quantity)::text,z.quantity::text,t.created_by,null,null,null
 from app.inventory_transactions t join app.movements a on a.transaction_id=t.id and a.org_id=t.org_id and a.quantity<0
 join app.movements z on z.transaction_id=t.id and z.org_id=t.org_id and z.quantity>0
 where t.org_id=o and t.kind='transfer'
), connected(id) as (
 select id from app.lots where org_id=o and id=root
 union
 select case when e.parent=c.id then e.child else e.parent end
 from connected c join edges e on e.parent=c.id or e.child=c.id
), limited as (select id from connected limit 1001), shown as (select id from limited limit 1000)
select jsonb_build_object(
 'truncated',(select count(*)>1000 from limited),
 'lots',coalesce((select jsonb_agg(jsonb_build_object('id',l.id,'code',l.code,'material',m.name,'owner',p.name,'qc',l.qc,'balance',private.balance(o,l.id)::text)) from app.lots l join shown s on s.id=l.id join app.materials m on m.id=l.material_id and m.org_id=l.org_id left join app.parties p on p.id=l.owner_party_id and p.org_id=l.org_id where l.org_id=o),'[]'::jsonb),
 'edges',coalesce((select jsonb_agg(to_jsonb(e)) from edges e where e.parent in(select id from shown) and e.child in(select id from shown)),'[]'::jsonb),
 'dispatches',coalesce((select jsonb_agg(jsonb_build_object('id',d.id,'code',d.code,'date',d.date,'status',d.status,'lot_id',dl.lot_id,'quantity',dl.quantity::text,'customer',p.name)) from app.dispatch_lines dl join app.dispatches d on d.id=dl.dispatch_id and d.org_id=dl.org_id join app.parties p on p.id=d.customer_id and p.org_id=d.org_id where dl.org_id=o and dl.lot_id in(select id from shown)),'[]'::jsonb)
);
$$;
revoke all on function app.trace(uuid,uuid) from public;
grant execute on function app.trace(uuid,uuid) to spplast_app;
