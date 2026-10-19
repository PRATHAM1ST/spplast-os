import { PGlite } from '@electric-sql/pglite';
import { beforeAll, afterAll, expect, test } from 'vitest';
import { migrations } from '@/lib/db/migrations';
import { seedDemo, DEMO_ORG, DEMO_USER } from '@/lib/db/seed';
import type { Workspace, Batch } from '@/lib/domain/types';
import { today, uid } from '@/lib/utils';
let db: PGlite;
beforeAll(async () => { db=new PGlite(); await db.exec(migrations); await seedDemo(db); });
afterAll(async()=>{await db?.close();});
test('migration and full posted genealogy reproduce stock without double counting',async()=>{
 const {rows}=await db.query<{data:Workspace}>("select app.workspace($1,'2020-01-01','2020-12-31') as data",[DEMO_ORG]);
 const lots=rows[0].data.lots;
 expect(lots.find(l=>l.code.startsWith('RAW-'))?.balance).toBe('400.000');
 expect(lots.find(l=>l.code.startsWith('GRD-'))?.balance).toBe('170.000');
 expect(lots.find(l=>l.code.startsWith('GRN-'))?.balance).toBe('260.000');
 expect(lots.filter(l=>l.owner_party_id).reduce((s,l)=>s+Number(l.balance),0)).toBe(500);
});
test('RLS isolates organizations and hides recipes from an operator',async()=>{
 await db.query("insert into app.memberships values($1,'test-operator','operator@example.com','operator','{}')",[DEMO_ORG]);
 await db.transaction(async tx=>{await tx.exec('set local role spplast_app');await tx.query("select set_config('app.user_id','stranger',true)");expect((await tx.query('select * from app.lots')).rows).toHaveLength(0);});
 await db.transaction(async tx=>{await tx.exec('set local role spplast_app');await tx.query("select set_config('app.user_id','test-operator',true)");expect((await tx.query('select * from app.recipes')).rows).toHaveLength(0);expect((await tx.query('select * from app.lots')).rows.length).toBeGreaterThan(0);});
 await db.query("select set_config('app.user_id',$1,false)",[DEMO_USER]);
});
async function command(action:string,payload:Record<string,unknown>,expected?:number,key=uid()) { return db.query('select app.command($1,$2,$3,$4::jsonb,$5)',[DEMO_ORG,key,action,JSON.stringify(payload),expected??null]); }
async function base() { return (await db.query<{data:Workspace}>('select app.workspace($1,$2,$2) as data',[DEMO_ORG,today()])).rows[0].data; }
async function inward(q='100',owner:string|null=null,job:string|null=null) { const w=await base();const id=uid();await command('inward',{id,code:`TEST-${id}`,date:today(),material_id:w.materials[0].id,location_id:w.locations[0].id,gross:q,tare:'0',owner_party_id:owner,job_id:job});await command('qc',{lot_id:id,disposition:'pass'},1);return id; }
async function batchPayload(input:string,quantity='100',output='95',loss='5',job:string|null=null,recipe:string|null=null) { const w=await base();return {id:uid(),code:`TEST-${uid()}`,date:today(),process:'grinding',machine_id:w.machines.find(m=>m.category==='grinder')!.id,shift_id:w.shifts[0].id,operator:'Test operator',supervisor:'',job_id:job,inputs:[{lot_id:input,quantity}],outputs:[{id:uid(),material_id:w.materials[0].id,location_id:w.locations[0].id,quantity:output,kind:'usable',disposition:'hold',bags:[]}],loss_kg:loss,loss_reason:'Measured process loss',notes:'',started_at:null,ended_at:null,downtime_minutes:0,downtime_reason:'',recipe_version_id:recipe,recipe_actuals:[],readings:[]} as unknown as Batch; }
test('offline replay is idempotent and reusing a key with different payload fails',async()=>{
 const w=await base();const id=uid(),key=uid();const p={id,code:`IDEMP-${id}`,date:today(),material_id:w.materials[0].id,location_id:w.locations[0].id,gross:'25.125',tare:'0.125'};
 await command('inward',p,undefined,key);await command('inward',p,undefined,key);
 expect((await db.query<{n:string}>('select sum(quantity)::text n from app.movements where lot_id=$1',[id])).rows[0].n).toBe('25.000');
 await expect(command('inward',{...p,gross:'30'},undefined,key)).rejects.toThrow('Idempotency');
});
test('batch draft has no inventory effects; stale revisions cannot overwrite it',async()=>{
 const lot=await inward();const b=await batchPayload(lot);await command('save_batch',b as unknown as Record<string,unknown>);
 expect((await db.query('select * from app.movements where lot_id=$1',[b.outputs[0].id])).rows).toHaveLength(0);
 await expect(command('save_batch',{...b,notes:'Stale edit'},0)).rejects.toThrow('CONFLICT');
 await command('submit_batch',{id:b.id},1);await command('approve_batch',{id:b.id},2);
 await expect(command('save_batch',{...b,notes:'Edit posted'},3)).rejects.toThrow('draft');
 expect((await base()).lots.find(l=>l.id===b.outputs[0].id)?.qc).toBe('hold');
});
test('unexplained mass prevents submission and bad stock posting rolls back atomically',async()=>{
 const l=await inward('10');const b=await batchPayload(l,'100','90','5');await command('save_batch',b as unknown as Record<string,unknown>);await expect(command('submit_batch',{id:b.id},1)).rejects.toThrow('reconcile');
 await command('save_batch',{...b,loss_kg:'10'},1);await command('submit_batch',{id:b.id},2);await expect(command('approve_batch',{id:b.id},3)).rejects.toThrow('Insufficient');
 expect((await db.query('select * from app.inventory_transactions where source_id=$1',[b.id])).rows).toHaveLength(0);
});
test('concurrent requests cannot oversell the same stock',async()=>{
 const l=await inward('100');const w=await base();const p={date:today(),customer_id:w.parties[0].id,job_id:null,lines:[{lot_id:l,quantity:'80'}],bags:0};
 const results=await Promise.allSettled([command('dispatch',{...p,id:uid(),code:`CONCURRENT-${uid()}`}),command('dispatch',{...p,id:uid(),code:`CONCURRENT-${uid()}`})]);
 expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);expect((await base()).lots.find(x=>x.id===l)?.balance).toBe('20.000');
});
test('QC hold blocks dispatch; returns restore stock and place it on hold',async()=>{
 const w=await base(),l=await inward('100'),id=uid();const p={id,code:`RETURN-${id}`,date:today(),customer_id:w.parties[0].id,job_id:null,lines:[{lot_id:l,quantity:'40'}],bags:0};await command('dispatch',p);
 await command('return',{dispatch_id:id,lot_id:l,quantity:'15.125',date:today(),reason:'Returned by customer'});
 expect((await base()).lots.find(x=>x.id===l)).toMatchObject({balance:'75.125',qc:'hold'});
 await expect(command('dispatch',{...p,id:uid(),code:`HOLD-${uid()}`})).rejects.toThrow('QC');
 await expect(command('return',{dispatch_id:id,lot_id:l,quantity:'30',date:today(),reason:'Excess'})).rejects.toThrow('exceeds');
});
test('job work preserves customer ownership through production and partial return',async()=>{
 const w=await base(),customer=w.parties[0].id,job=uid();await command('save_job',{id:job,code:`JOB-${job}`,customer_id:customer,process:'grinding',material_id:w.materials[0].id,expected_date:today()});
 const l=await inward('500',customer,job);const b=await batchPayload(l,'500','475','25',job);await command('save_batch',b as unknown as Record<string,unknown>);await command('submit_batch',{id:b.id},1);await command('approve_batch',{id:b.id},2);await command('qc',{lot_id:b.outputs[0].id,disposition:'pass'},1);
 await expect(command('dispatch',{id:uid(),code:`WRONG-${uid()}`,date:today(),customer_id:customer,job_id:null,lines:[{lot_id:b.outputs[0].id,quantity:'200'}],bags:0})).rejects.toThrow('owner');
 await command('dispatch',{id:uid(),code:`JOB-DSP-${uid()}`,date:today(),customer_id:customer,job_id:job,lines:[{lot_id:b.outputs[0].id,quantity:'200'}],bags:0});
 expect((await base()).lots.find(x=>x.id===b.outputs[0].id)).toMatchObject({balance:'275.000',owner_party_id:customer,job_id:job});
});
test('approved recipe ingredients are immutable and v2 leaves prior batch on v1',async()=>{
 const recipe=(await base()).recipes[0];await command('approve_recipe',{id:recipe.id});
 await expect(db.query("update app.recipe_ingredients set amount=20 where recipe_id=$1",[recipe.id])).rejects.toThrow('immutable');
 const l=await inward(),b=await batchPayload(l,'100','95','5',null,recipe.id);await command('save_batch',b as unknown as Record<string,unknown>);
 const v2={...recipe,id:uid(),ingredients:recipe.ingredients.map(i=>({...i,id:uid()})),change_reason:'Test second version'};await command('save_recipe',v2);await command('approve_recipe',{id:v2.id});
 expect((await base()).batches.find(x=>x.id===b.id)?.recipe_version_id).toBe(recipe.id);expect((await base()).recipes.find(x=>x.id===v2.id)?.revision).toBe(2);
});
test('partial transfer and reversal conserve mass and ownership',async()=>{
 const l=await inward('100.125');const w=await base(),id=uid();await command('transfer',{id,lot_id:l,quantity:'25.125',code:`TRANSFER-${id}`,location_id:w.locations[0].id,date:today(),reason:'Rack split'});
 const after=await base();expect(after.lots.find(x=>x.id===l)?.balance).toBe('75.000');expect(after.lots.find(x=>x.id===id)?.balance).toBe('25.125');
 const tx=after.movements.find(m=>m.source_id===id)!.transaction_id;await command('reverse',{transaction_id:tx,date:today(),reason:'Correct rack transfer'});
 expect((await base()).lots.find(x=>x.id===l)?.balance).toBe('100.125');await expect(command('reverse',{transaction_id:tx,date:today(),reason:'Again'})).rejects.toThrow('cannot');
});
test('operator cannot approve stock or mutate ledger directly',async()=>{
 const l=await inward(),b=await batchPayload(l);await command('save_batch',b as unknown as Record<string,unknown>);await command('submit_batch',{id:b.id},1);
 await db.query("select set_config('app.user_id','test-operator',false)");await expect(command('approve_batch',{id:b.id},2)).rejects.toThrow('FORBIDDEN');
 await db.transaction(async tx=>{await tx.exec('set local role spplast_app');await expect(tx.query('delete from app.movements')).rejects.toThrow('permission');});
 await db.query("select set_config('app.user_id',$1,false)",[DEMO_USER]);
});
