import {afterEach,expect,it,vi} from 'vitest';
import {uploadExplorerFileResumable} from '../src/lib/drive/explorer-resumable-upload';
import {EXPLORER_UPLOAD_CHUNK_BYTES,assertExplorerUploadSize} from '../src/lib/drive/explorer-upload-limits';
afterEach(()=>{vi.unstubAllGlobals();vi.useRealTimers();});
const reply=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status});
it.each([309200,12*1024*1024])('uploads synthetic PDF bytes %s in bounded chunks and preserves exact bytes',async(size)=>{
 const bytes=new Uint8Array(size);bytes.set(new TextEncoder().encode('%PDF-1.4\n% synthetic test\n'));bytes.set(new TextEncoder().encode('\n%%EOF'),size-6);
 const received:Uint8Array[]=[];let offset=0;
 vi.stubGlobal('fetch',vi.fn(async(url:string,init:RequestInit)=>{
  if(url.endsWith('upload-session'))return reply({sessionToken:'synthetic',uploadUrl:'/api/drive/upload-chunk',chunkSize:EXPLORER_UPLOAD_CHUNK_BYTES});
  if(url.endsWith('upload-complete'))return reply({file:{id:'synthetic',size:String(size)}});
  const blob=init.body as Blob;expect(blob.size).toBeLessThanOrEqual(EXPLORER_UPLOAD_CHUNK_BYTES);
  received.push(new Uint8Array(await blob.arrayBuffer()));offset+=blob.size;
  return offset===size?reply({status:200,file:{id:'synthetic-google'}}):reply({status:308,range:`bytes=0-${offset-1}`});
 }));
 const result=await uploadExplorerFileResumable(new File([bytes],'synthetic.pdf',{type:'application/pdf'}),'synthetic-folder');
 expect(result.id).toBe('synthetic');expect(Buffer.concat(received).equals(Buffer.from(bytes))).toBe(true);
});
it('stops permanent expiry immediately without retrying or completing',async()=>{
 const fetchMock=vi.fn().mockResolvedValueOnce(reply({sessionToken:'synthetic',uploadUrl:'/api/drive/upload-chunk'})).mockResolvedValue(reply({error:'session expired',retryable:false},410));vi.stubGlobal('fetch',fetchMock);
 await expect(uploadExplorerFileResumable(new File(['%PDF-test'],'test.pdf'),'folder')).rejects.toThrow('session expired');expect(fetchMock).toHaveBeenCalledTimes(2);
});
it('caps failures even when each status query succeeds with zero bytes',async()=>{
 vi.useFakeTimers();let puts=0;
 vi.stubGlobal('fetch',vi.fn(async(url:string,init:RequestInit)=>{
  if(url.endsWith('upload-session'))return reply({sessionToken:'synthetic',uploadUrl:'/api/drive/upload-chunk'});
  if(new Headers(init.headers).get('Content-Range')?.includes('*/'))return reply({status:308,range:null});
  puts++;return reply({error:'temporary failure'},503);
 }));
 const pending=expect(uploadExplorerFileResumable(new File(['%PDF-test'],'test.pdf'),'folder')).rejects.toThrow('8회');await vi.runAllTimersAsync();await pending;expect(puts).toBe(8);
});
it('resumes from acknowledged bytes after response loss',async()=>{
 vi.useFakeTimers();let accepted=false,probe=false,resent=false;
 vi.stubGlobal('fetch',vi.fn(async(url:string,init:RequestInit)=>{
  if(url.endsWith('upload-session'))return reply({sessionToken:'synthetic',uploadUrl:'/api/drive/upload-chunk'});
  if(url.endsWith('upload-complete'))return reply({file:{id:'ok'}});
  const range=new Headers(init.headers).get('Content-Range')!;
  if(range.includes('*/')){probe=true;return reply({status:308,range:`bytes=0-${EXPLORER_UPLOAD_CHUNK_BYTES-1}`});}
  if(!accepted){accepted=true;throw new TypeError('network');}
  expect(probe).toBe(true);resent=range.startsWith(`bytes ${EXPLORER_UPLOAD_CHUNK_BYTES}-`);return reply({status:200,file:{id:'google'}});
 }));
 const pending=uploadExplorerFileResumable(new File([new Uint8Array(EXPLORER_UPLOAD_CHUNK_BYTES+300)],'test.pdf'),'folder');await vi.runAllTimersAsync();await pending;expect(resent).toBe(true);
});
it('rejects files beyond explicit 2GiB and fractional sizes',()=>{expect(assertExplorerUploadSize(2*1024**3+1).ok).toBe(false);expect(assertExplorerUploadSize(1.5).ok).toBe(false);});
