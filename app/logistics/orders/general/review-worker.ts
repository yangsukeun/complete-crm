import {prepareGeneral,verifyExpansion} from '@/lib/avent/general-file';

// No raw library errors/console output may escape into CRM telemetry.
console.log=console.info=console.warn=console.error=()=>{};
self.addEventListener('error',event=>event.preventDefault());
self.addEventListener('unhandledrejection',event=>event.preventDefault());
self.onmessage=async(event:MessageEvent<{source:ArrayBuffer;reference?:ArrayBuffer}>)=>{
 try{
  const {source,reference}=event.data;
  await verifyExpansion(source);if(reference)await verifyExpansion(reference);
  const hash=async(data:ArrayBuffer)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',data)),v=>v.toString(16).padStart(2,'0')).join('');
  const sourceHash=await hash(source),referenceHash=reference?await hash(reference):undefined;
  const {report,output}=prepareGeneral(source,reference);
  // JSON report excludes customer cells, channel names, file names and identifiers.
  const safeReport={...report,channels:report.channels.map((c,i)=>({...c,name:`채널 ${i+1}`})),sourceHash,referenceHash};
  self.postMessage({ok:true,report:safeReport,output},{transfer:[output]});
 }catch{
  self.postMessage({ok:false,error:'파일을 읽을 수 없습니다. 30열 단일 시트 XLS/XLSX, 크기·행수 제한과 수식·외부링크 포함 여부를 확인하세요.'});
 }
};
