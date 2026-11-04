// Browser-only bounded transport. The draft is minimized before this function is called.
export async function draftRequestBody(json:string):Promise<{body:BodyInit;headers:Record<string,string>}>{
 const bytes=new TextEncoder().encode(json);
 if(bytes.length>16*1024*1024)throw Error('검토 데이터가 16MiB를 초과합니다. 입력은 화면에 보존됩니다.');
 if(bytes.length<=1024*1024)return {body:json,headers:{'Content-Type':'application/json'}};
 if(typeof CompressionStream==='undefined')throw Error('전체 월 저장에는 압축을 지원하는 최신 브라우저가 필요합니다.');
 const compressed=await new Response(new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer();
 if(compressed.byteLength>3*1024*1024)throw Error('압축 후 저장 한도 3MiB를 초과합니다. 입력은 화면에 보존됩니다.');
 return {body:compressed,headers:{'Content-Type':'application/json','Content-Encoding':'gzip'}};
}
