import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
const sql=readdirSync('db/migrations').filter(f=>f.endsWith('.sql')).sort().map(f=>readFileSync(`db/migrations/${f}`,'utf8')).join('\n');
mkdirSync('src/lib/db',{recursive:true});writeFileSync('src/lib/db/migrations.ts',`// Generated demo/test migration bundle. Do not edit.\nexport const migrations = ${JSON.stringify(sql)};\n`);
