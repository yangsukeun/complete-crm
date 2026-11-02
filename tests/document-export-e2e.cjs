'use strict';
// Synthetic browser downloads only; no authenticated CRM, external requests or uploads.
const fs=require('fs'),path=require('path'),http=require('http'),assert=require('assert/strict');
const webpack=require('webpack'),{chromium}=require(process.env.AVENT_TEST_PLAYWRIGHT);
(async()=>{
 const root=path.resolve(__dirname,'..'),dist=path.join(root,'.avent-test/export');fs.mkdirSync(dist,{recursive:true});
 fs.writeFileSync(path.join(dist,'entry.js'),`import {downloadContentAsPdf,downloadContentAsPptx} from '../../src/lib/export/document-download.ts';
 for(const [id,fn] of [['pdf',downloadContentAsPdf],['pptx',downloadContentAsPptx]])document.getElementById(id).onclick=()=>fn({title:'Synthetic export',body:'Regression body',fileBase:'test/export'}).catch(e=>document.body.dataset.error=e.message);`);
 const config={mode:'development',target:'web',entry:path.join(dist,'entry.js'),output:{path:dist,filename:'bundle.js'},resolve:{extensions:['.ts','.js']},module:{rules:[{test:/\.ts$/,use:path.join(__dirname,'document-export-loader.cjs')}]},plugins:[new webpack.NormalModuleReplacementPlugin(/^node:(fs|https)$/,r=>{if(/[\\/]pptxgenjs[\\/]dist$/.test(r.context))r.request=r.request.slice(5);})]};
 await new Promise((resolve,reject)=>webpack(config,(err,stats)=>err||stats.hasErrors()?reject(err||Error(stats.toString({all:false,errors:true}))):resolve()));
 const server=http.createServer((req,res)=>{if(req.url==='/'){res.setHeader('Content-Type','text/html');return res.end('<button id="pdf">PDF</button><button id="pptx">PPTX</button><script src="/bundle.js"></script>');}const file=path.join(dist,path.basename(req.url));if(!file.endsWith('.js')||!fs.existsSync(file)){res.writeHead(404);return res.end();}res.setHeader('Content-Type','text/javascript');res.end(fs.readFileSync(file));});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;let browser;
 try{browser=await chromium.launch({headless:true});const page=await browser.newPage();await page.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());await page.goto(origin);
 for(const ext of ['pdf','pptx']){const event=page.waitForEvent('download');await page.click('#'+ext);const download=await event;assert.equal(download.suggestedFilename(),'test_export.'+ext);const file=path.join(dist,download.suggestedFilename());await download.saveAs(file);const data=fs.readFileSync(file);assert.ok(data.length>1000);assert.equal(data.subarray(0,ext==='pdf'?4:2).toString(),ext==='pdf'?'%PDF':'PK');if(ext==='pptx'){const zip=await require('jszip').loadAsync(data);assert.match(await zip.file('ppt/slides/slide1.xml').async('string'),/Regression body/);}}
 assert.equal(await page.getAttribute('body','data-error'),null);console.log('PASS actual document-download PDF and PPTX browser downloads; synthetic content only.');
 }finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
