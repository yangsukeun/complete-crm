import {pathToFileURL} from 'node:url';
import {randomBytes,createHash} from 'node:crypto';
import {readFileSync,writeFileSync,existsSync,mkdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
const runtime=process.env.SEOYOUNG_PG_PACKAGE;if(!runtime)throw Error('Set SEOYOUNG_PG_PACKAGE to an existing approved embedded-postgres package; no install is performed');
const {default:EmbeddedPostgres}=await import(pathToFileURL(resolve(runtime,'dist/index.js')).href);
const run=process.argv[2]||'01';if(!/^\d{2}$/.test(run))throw Error('Two-digit isolated run required');
const root=resolve(import.meta.dirname,'..'),evidenceDir=resolve(process.env.SEOYOUNG_PG_EVIDENCE_DIR||resolve(root,'../seoyoung-pg-verification'));mkdirSync(evidenceDir,{recursive:true});const data=resolve(evidenceDir,'synthetic-cluster-'+run);
if(existsSync(data))throw Error('Refuse to reuse an existing cluster');
const password=randomBytes(24).toString('hex'),port=45449;
const db=new EmbeddedPostgres({databaseDir:data,user:'seoyoung_fixture_owner',password,port,persistent:true,createPostgresUser:false,authMethod:'scram-sha-256',initdbFlags:['--encoding=UTF8','--locale=C'],postgresFlags:['-c','listen_addresses=127.0.0.1'],onLog:()=>{},onError:()=>{}});
const url=`postgresql://seoyoung_fixture_owner:${password}@127.0.0.1:${port}/seoyoung_isolated_verification`;
const env={...process.env,DATABASE_URL:url,DIRECT_URL:url,SEOYOUNG_ISOLATED_PG_TEST:'1',NEXT_TELEMETRY_DISABLED:'1'};
const evidence=[];const note=s=>{evidence.push(s);console.log(s);};
function command(args,phase){const r=spawnSync(process.execPath,args,{cwd:root,env:{...env,SEOYOUNG_TEST_PHASE:phase||''},encoding:'utf8',maxBuffer:20*1024*1024});if(r.status!==0){console.log((r.stdout||'').replaceAll(password,'[redacted]'));console.log((r.stderr||'').replaceAll(password,'[redacted]'));throw Error('Local verification command failed');}return r.stdout;}
let client,started=false;
try{
 await db.initialise();await db.start();started=true;await db.createDatabase('seoyoung_isolated_verification');client=db.getPgClient('seoyoung_isolated_verification','127.0.0.1');await client.connect();note('PostgreSQL '+(await client.query('SHOW server_version')).rows[0].server_version);
 const baselineSql=command(['node_modules/prisma/build/index.js','migrate','diff','--from-empty','--to-schema-datamodel','prisma/schema.prisma','--script']);await client.query(baselineSql);
 await client.query('CREATE ROLE anon; CREATE ROLE authenticated;');
 const migration=readFileSync(resolve(root,'db-review/seoyoung-settlement.sql'),'utf8');const inner=migration.replace(/^BEGIN;\s*$/m,'').replace(/^COMMIT;\s*$/m,'');
 note('Migration SHA256 '+createHash('sha256').update(migration).digest('hex'));
 await client.query('BEGIN');await client.query(inner);await client.query('ROLLBACK');assert.equal((await client.query("SELECT to_regclass('public.seoyoung_settlement_drafts') AS t")).rows[0].t,null);note('PASS DDL apply then rollback: no draft table remains');
 await client.query(migration);assert.equal((await client.query("SELECT count(*)::int AS n FROM pg_class WHERE relname IN ('seoyoung_settlement_drafts','seoyoung_settlement_events') AND relrowsecurity")).rows[0].n,2);
 for(const role of ['anon','authenticated']){await client.query(`SET ROLE ${role}`);await assert.rejects(client.query('SELECT * FROM seoyoung_settlement_drafts'),e=>e.code==='42501');await assert.rejects(client.query("DELETE FROM seoyoung_settlement_events"),e=>e.code==='42501');await client.query('RESET ROLE');}note('PASS applied migration, RLS enabled and browser roles SELECT/DELETE denied');
 command(['node_modules/vitest/vitest.mjs','run','tests/seoyoung-postgres.test.ts','--maxWorkers=1','--minWorkers=1'],'write');note('PASS real HTTP/Prisma write test: roles, month duplicate, 200/409 edit race, review gate, audit failure rollback/retry');
 const before=(await client.query('SELECT row_to_json(r) AS row FROM seoyoung_settlement_drafts r ORDER BY month')).rows;await client.end();client=null;await db.stop();started=false;note('STOPPED first PostgreSQL process; application test process exited');
 await db.start();started=true;client=db.getPgClient('seoyoung_isolated_verification','127.0.0.1');await client.connect();assert.deepEqual((await client.query('SELECT row_to_json(r) AS row FROM seoyoung_settlement_drafts r ORDER BY month')).rows,before);note('PASS disk persistence after PostgreSQL process restart');
 command(['node_modules/vitest/vitest.mjs','run','tests/seoyoung-postgres.test.ts','--maxWorkers=1','--minWorkers=1'],'read');note('PASS fresh application process HTTP reopen version 6, audit 6 events, September cells/formulas/merges/12 sheets');
 await client.query('BEGIN');await client.query("UPDATE seoyoung_settlement_drafts SET status='reviewed'");await client.query('ROLLBACK');assert.deepEqual((await client.query('SELECT row_to_json(r) AS row FROM seoyoung_settlement_drafts r ORDER BY month')).rows,before);note('PASS data transaction rollback');
 const users=(await client.query('SELECT id,email FROM "User" ORDER BY id')).rows;await client.query('BEGIN; DROP TABLE seoyoung_settlement_events; DROP TABLE seoyoung_settlement_drafts; COMMIT;');assert.deepEqual((await client.query('SELECT id,email FROM "User" ORDER BY id')).rows,users);assert.equal((await client.query("SELECT to_regclass('public.seoyoung_settlement_drafts') AS t")).rows[0].t,null);note('PASS isolated schema reversal, synthetic baseline users preserved');
}finally{if(client)await client.end();if(started){await db.stop();note('STOPPED final PostgreSQL process');}writeFileSync(resolve(evidenceDir,'results-'+run+'.txt'),evidence.join('\n')+'\n','utf8');}
