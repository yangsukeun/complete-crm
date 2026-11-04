import {gunzipSync,gzipSync} from 'node:zlib';
import {SalesError} from '@/lib/logistics-sales';
export function decodeDraftRequest(bytes:Uint8Array,encoding:string|null):unknown{
 if(bytes.byteLength>3*1024*1024)throw new SalesError(413,'전송 한도 3MiB 초과');
 if(encoding&&encoding!=='gzip'&&encoding!=='identity')throw new SalesError(415,'지원하지 않는 압축 형식');
 let plain:Uint8Array=bytes;
 if(encoding==='gzip'){try{plain=gunzipSync(bytes,{maxOutputLength:16*1024*1024});}catch{throw new SalesError(413,'압축 데이터가 손상되었거나 해제 한도 16MiB를 초과했습니다.');}}
 return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(plain));
}
export function draftResponse(data:unknown,headers:Record<string,string>):Response{
 const bytes=Buffer.from(JSON.stringify(data));
 if(bytes.length>16*1024*1024)throw new SalesError(413,'조회 결과가 지원 한도를 초과합니다.');
 if(bytes.length<=1024*1024)return Response.json(data,{headers});
 const compressed=gzipSync(bytes);
 if(compressed.length>3*1024*1024)throw new SalesError(413,'압축 조회 결과가 전송 한도를 초과합니다.');
 return new Response(compressed,{headers:{...headers,'Content-Type':'application/json; charset=utf-8','Content-Encoding':'gzip'}});
}
