import type {SupabaseClient} from '@supabase/supabase-js';
import {OCR_PRIVATE_BUCKET,type OcrPrivateStorage} from './ocr-internal-review';
/** Inject existing server storage client only after bucket policy review. Never initializes credentials. */
export class SupabaseOcrPrivateStorage implements OcrPrivateStorage{
 constructor(private client:Pick<SupabaseClient,'storage'>){}
 private target(bucket:string,key:string){if(bucket!==OCR_PRIVATE_BUCKET||!/^[a-f0-9-]{36}\/[a-f0-9-]{36}\/original$/.test(key))throw Error('Invalid private OCR object');return this.client.storage.from(bucket);}
 async putOnce(bucket:string,key:string,bytes:Uint8Array,mime:string){const {error}=await this.target(bucket,key).upload(key,bytes,{contentType:mime,upsert:false,cacheControl:'0'});if(error)throw Error('Private OCR upload failed');}
 async read(bucket:string,key:string){const {data,error}=await this.target(bucket,key).download(key);if(error||!data||data.size>8388608)throw Error('Private OCR read failed');return new Uint8Array(await data.arrayBuffer());}
}
