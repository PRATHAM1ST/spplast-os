-- Invoker functions retain RLS. Date ranges and page caps protect modest devices.
create function app.workspace(o uuid,from_date date,to_date date,page_offset integer default 0) returns jsonb
language plpgsql set search_path='' as $$
declare result jsonb:=jsonb_build_object('org_id',o); t text; rows jsonb; more boolean:=false;
begin
 if not private.member(o) then raise exception 'FORBIDDEN'; end if;
 if to_date<from_date or to_date-from_date>366 then raise exception 'Choose a range up to one year'; end if;
 foreach t in array array['materials','parties','locations','machines','shifts','inspections','media','audit'] loop
  execute format('select coalesce(jsonb_agg(to_jsonb(r)),''[]'') from (select * from app.%I where org_id=$1 order by created_at desc,id limit 501 offset $2) r',t) into rows using o,page_offset;
  if jsonb_array_length(rows)>500 then more:=true; rows:=rows-500; end if;
  result:=result||jsonb_build_object(t,rows);
 end loop;
 select coalesce(jsonb_agg(to_jsonb(l)||jsonb_build_object('balance',private.balance(o,l.id)::text)),'[]') into rows from (select * from app.lots where org_id=o order by created_at desc,id limit 501 offset page_offset) l;
 if jsonb_array_length(rows)>500 then more:=true; rows:=rows-500; end if;
 result:=result||jsonb_build_object('lots',rows);
 select coalesce(jsonb_agg(to_jsonb(b)||jsonb_build_object(
  'loss_kg',b.loss_kg::text,
  'inputs',(select coalesce(jsonb_agg(to_jsonb(i)||jsonb_build_object('quantity',i.quantity::text)),'[]') from app.batch_inputs i where batch_id=b.id),
  'outputs',(select coalesce(jsonb_agg(to_jsonb(x)||jsonb_build_object('quantity',x.quantity::text,'bags',(select coalesce(jsonb_agg(to_jsonb(g)||jsonb_build_object('weight',g.weight::text,'tare',g.tare::text)),'[]') from app.bag_groups g where output_id=x.id))),'[]') from app.batch_outputs x where batch_id=b.id),
  'readings',(select coalesce(jsonb_agg(to_jsonb(m)),'[]') from app.machine_readings m where batch_id=b.id),
  'recipe_actuals',(select coalesce(jsonb_agg(to_jsonb(a)||jsonb_build_object('quantity',a.quantity::text)),'[]') from app.batch_recipe_actuals a where batch_id=b.id)
 )),'[]') into rows from (select * from app.batches where org_id=o and date between from_date and to_date order by date desc,created_at desc,id limit 501 offset page_offset) b;
 if jsonb_array_length(rows)>500 then more:=true; rows:=rows-500; end if;
 result:=result||jsonb_build_object('batches',rows);
 select coalesce(jsonb_agg(to_jsonb(m)||jsonb_build_object('quantity',m.quantity::text,'kind',t.kind,'source_id',t.source_id,'date',t.date,'reason',t.reason)),'[]') into rows from (select m.* from app.movements m join app.inventory_transactions t on t.id=m.transaction_id where m.org_id=o and t.date between from_date and to_date order by t.date desc,m.created_at desc,m.id limit 501 offset page_offset) m join app.inventory_transactions t on t.id=m.transaction_id;
 if jsonb_array_length(rows)>500 then more:=true; rows:=rows-500; end if;
 result:=result||jsonb_build_object('movements',rows);
 select coalesce(jsonb_agg(to_jsonb(r)||jsonb_build_object('base_quantity',r.base_quantity::text,'ingredients',(select coalesce(jsonb_agg(to_jsonb(i)||jsonb_build_object('amount',i.amount::text) order by position),'[]') from app.recipe_ingredients i where recipe_id=r.id))),'[]') into rows from (select * from app.recipes where org_id=o order by created_at desc,id limit 501 offset page_offset) r;
 if jsonb_array_length(rows)>500 then more:=true; rows:=rows-500; end if;
 result:=result||jsonb_build_object('recipes',rows);
 select coalesce(jsonb_agg(to_jsonb(j)||coalesce((select jsonb_build_object('rate',c.rate::text,'charge_basis',c.charge_basis) from app.job_charges c where c.job_id=j.id),'{}')),'[]') into rows from (select * from app.jobs where org_id=o order by created_at desc,id limit 501 offset page_offset) j;
 if jsonb_array_length(rows)>500 then more:=true; rows:=rows-500; end if;
 result:=result||jsonb_build_object('jobs',rows);
 select coalesce(jsonb_agg(to_jsonb(d)||jsonb_build_object('lines',(select coalesce(jsonb_agg(to_jsonb(l)||jsonb_build_object('quantity',l.quantity::text)),'[]') from app.dispatch_lines l where dispatch_id=d.id))||coalesce((select jsonb_build_object('rate',f.rate::text,'tax_percent',f.tax_percent::text,'transport',f.transport::text,'discount',f.discount::text,'total',f.total::text) from app.dispatch_finances f where f.dispatch_id=d.id),'{}')),'[]') into rows from (select * from app.dispatches where org_id=o and date between from_date and to_date order by date desc,created_at desc,id limit 501 offset page_offset) d;
 if jsonb_array_length(rows)>500 then more:=true; rows:=rows-500; end if;
 result:=result||jsonb_build_object('dispatches',rows);
 return result||jsonb_build_object('settings',coalesce((select value from app.settings where org_id=o),'{}'),'members',(select coalesce(jsonb_agg(to_jsonb(m)),'[]') from app.memberships m where org_id=o),'locked_days',(select coalesce(jsonb_agg(date),'[]') from app.locked_days where org_id=o),'has_more',more);
end $$;
revoke all on function app.workspace(uuid,date,date,integer) from public;
grant execute on function app.workspace(uuid,date,date,integer) to spplast_app;

create table private.installation(key text primary key,value text not null);
create function app.bootstrap(email text,company text) returns uuid language plpgsql security definer set search_path='' as $$
declare o uuid; code text;
begin
 perform pg_advisory_xact_lock(739203);
 if private.actor() is null or lower(email)<>lower(coalesce((select value from private.installation where key='bootstrap_email'),'')) or email<>current_setting('app.user_email',true) then raise exception 'Only the configured verified administrator may initialize'; end if;
 if exists(select 1 from app.organizations) then raise exception 'Already initialized; ask an administrator for membership'; end if;
 insert into app.organizations(name) values(company) returning id into o;
 insert into app.memberships values(o,private.actor(),email,'owner','{}');
 insert into app.factory_sites(org_id,name) values(o,'Ahmedabad');
 insert into app.locations(org_id,name,code) values(o,'Main storage','MAIN');
 foreach code in array array['PP','CP','HDPE','LDPE','ABS','PC','HI','PS','Other'] loop
  insert into app.materials(org_id,code,name,polymer,form) values(o,code,code,code,'incoming_scrap');
 end loop;
 insert into app.settings values(o,jsonb_build_object('company_name',company,'site_name','Ahmedabad','bag_presets',jsonb_build_array(25,30,35,50),'photo_limit_mb',8,'qc_fields','[]'::jsonb,'loss_tolerance_percent','0','locale','en','tax_rates','[]'::jsonb));
 return o;
end $$;
revoke all on function app.bootstrap(text,text) from public;
grant execute on function app.bootstrap(text,text) to spplast_app;
