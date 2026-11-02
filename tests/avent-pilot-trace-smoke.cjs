'use strict';
// Copies only engine code and traced xlsx package files. No env, credentials or customer files.
const fs=require('fs'),path=require('path'),assert=require('assert/strict'),{spawnSync}=require('child_process'),X=require('xlsx');
const root=path.resolve(__dirname,'..'),trace=path.join(root,'.next/server/app/api/avent/pilot/route.js.nft.json');
const files=JSON.parse(fs.readFileSync(trace,'utf8')).files.map(f=>path.resolve(path.dirname(trace),f));
const realSet=new Set(files.filter(f=>fs.existsSync(f)&&fs.statSync(f).isFile()).map(f=>fs.realpathSync(f)));
const stage=fs.mkdtempSync(path.join(root,'.avent-test/traced-')),engine=path.join(root,'src/lib/avent/engine');
for(const name of fs.readdirSync(engine).filter(n=>n.endsWith('.cjs'))){const file=path.join(engine,name);assert.ok(realSet.has(fs.realpathSync(file)),'Missing engine trace: '+name);const target=path.join(stage,'src/lib/avent/engine',name);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(file,target);}
const packageRoot=fs.realpathSync(path.dirname(require.resolve('xlsx/package.json')));let count=0;
for(const file of realSet){if(!file.startsWith(packageRoot+path.sep))continue;const target=path.join(stage,'node_modules/xlsx',path.relative(packageRoot,file));fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(file,target);count++;}
assert.ok(count>0,'xlsx missing from trace');
function sample(amount){const book=X.utils.book_new();X.utils.book_append_sheet(book,X.utils.aoa_to_sheet([['주문번호','품목별주문번호','최종 결제 금액','수량'],['SYN','A',300,1],['SYN','B',amount,1]]),'test');return X.write(book,{type:'buffer',bookType:'xls'}).toString('base64');}
const payload=JSON.stringify({source:sample(300),expected:sample(0)});
const script=`const {execute}=require('./src/lib/avent/engine/bounded_preview.cjs');let text='';process.stdin.on('data',b=>text+=b);process.stdin.on('end',async()=>{try{const p=JSON.parse(text),r=await execute({source:Buffer.from(p.source,'base64'),expected:Buffer.from(p.expected,'base64'),profile:'payment',stage:'pre_order'});if(!r.downloadAllowed||!r.comparison.match)throw Error('MISMATCH');console.log(JSON.stringify({match:true,rows:r.rows,dispatchEnabled:r.dispatchEnabled}));}catch(e){console.error(e.message);process.exitCode=1;}});`;
const run=spawnSync(process.execPath,['-e',script],{cwd:stage,input:payload,encoding:'utf8',env:{SystemRoot:process.env.SystemRoot,TEMP:process.env.TEMP,PATH:process.env.PATH}});
assert.equal(run.status,0,run.stderr);assert.equal(JSON.parse(run.stdout).match,true);
console.log(JSON.stringify({traceContainsWorker:true,tracedXlsxFiles:count,isolatedPackageSmoke:'pass',productionVercelRun:false}));
