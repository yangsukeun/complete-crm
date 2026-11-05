// Local UI test only. No production session/DB; no customer files. Never deploy this harness.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),{build}=require('esbuild'),X=require('xlsx');
(async()=>{
 const out=path.resolve('.avent-test/general-ui');fs.mkdirSync(out,{recursive:true});
 await build({entryPoints:['tests/avent-general-browser-entry.tsx'],bundle:true,platform:'browser',format:'esm',jsx:'automatic',outfile:path.join(out,'ui.js')});
 await build({entryPoints:['app/logistics/orders/general/review-worker.ts'],bundle:true,platform:'browser',format:'esm',outfile:path.join(out,'review-worker.ts')});
 const {GENERAL_HEADERS}=await(async()=>{const r=await build({entryPoints:['src/lib/avent/general-review.ts'],bundle:true,platform:'node',format:'cjs',write:false});const p=path.join(out,'review.cjs');fs.writeFileSync(p,r.outputFiles[0].text);return require(p);})();
 const row=Array(30).fill('');Object.assign(row,{0:'12345678901234567890123456',1:'',2:'SYN-SAB',3:'SYN-SHOP',4:'SYNTHETIC_PRIVATE_CANARY',5:'2026-11-05',6:'신규주문',7:'SYN-ITEM',8:'SYNTHETIC_PRIVATE_CANARY',10:1,12:'SYN-AVK',13:'SYNTHETIC_PRIVATE_CANARY',14:1,23:'SYNTHETIC_PRIVATE_CANARY'});
 function fixture(name,rows){const b=X.utils.book_new();X.utils.book_append_sheet(b,X.utils.aoa_to_sheet([[...GENERAL_HEADERS],...rows]),'synthetic');X.writeFile(b,path.join(out,name));}
 fixture('normal.xlsx',[row]);fixture('different-batch.xlsx',[[...row.slice(0,2),'SYN-OTHER',...row.slice(3)]]);
 fixture('exceptions.xlsx',[row,row.map((v,i)=>i===12?'':i===10?-1:v)]);
 fs.writeFileSync(path.join(out,'invalid.xlsx'),'SYNTHETIC_PRIVATE_CANARY invalid file');
 const server=http.createServer(async(req,res)=>{
  const chunks=[];for await(const c of req)chunks.push(c);const body=Buffer.concat(chunks).toString();
  if((req.url+body).includes('SYNTHETIC_PRIVATE_CANARY'))console.log('LEAK_DETECTED');
  console.log(req.method,req.url?.split('?')[0]);
  if(req.method!=='GET'){res.writeHead(405);return res.end();}
  if(req.url==='/api/avent/pilot'){if(fs.existsSync(path.join(out,'delay')))await new Promise(r=>setTimeout(r,2500));res.setHeader('Content-Type','application/json');return res.end('{"ready":true}');}
  if(req.url==='/'){res.setHeader('Content-Type','text/html; charset=utf-8');return res.end('<meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/ui.css"><p>LOCAL SYNTHETIC HARNESS — no CRM session</p><div id="root"></div><script type="module" src="/ui.js"></script>');}
  const map={'/ui.js':['ui.js','text/javascript'],'/ui.css':['ui.css','text/css'],'/review-worker.ts':['review-worker.ts','text/javascript']};const item=map[req.url];if(!item){res.writeHead(404);return res.end();}res.setHeader('Content-Type',item[1]);res.end(fs.readFileSync(path.join(out,item[0])));
 });server.listen(4318,'127.0.0.1',()=>console.log('LOCAL_HARNESS http://127.0.0.1:4318 fixtures='+out));
})();
