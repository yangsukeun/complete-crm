import type {PrismaClient} from '@prisma/client';
import type {PreflightLimiter} from './website-inquiry-preflight';
/** Draft schema prerequisite: existing rate table composite (source_site,bucket_key) primary key. */
export function createSubjectLimiter(client:Pick<PrismaClient,'$transaction'>):PreflightLimiter{
 return (site,input)=>client.$transaction(async tx=>{
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(724804,2)::text AS lock_result`;
  // Only short-lived counters created by this limiter; never inquiry records or contact data.
  await tx.$executeRaw`DELETE FROM public.website_inquiry_rate_limits WHERE source_site=${site} AND bucket_key<>'site' AND window_start<clock_timestamp()-interval '1 hour'`;
  const global=await tx.$queryRaw<{hits:number}[]>`INSERT INTO public.website_inquiry_rate_limits(source_site,bucket_key,window_start,hits) VALUES(${site},'preflight',date_trunc('minute',clock_timestamp()),1) ON CONFLICT(source_site,bucket_key) DO UPDATE SET hits=CASE WHEN website_inquiry_rate_limits.window_start=date_trunc('minute',clock_timestamp()) THEN LEAST(website_inquiry_rate_limits.hits+1,1001) ELSE 1 END,window_start=date_trunc('minute',clock_timestamp()) RETURNING hits`;
  if(global[0].hits>60)return false;
  const key=`subject:${input.day}:${input.subject_hash}`;
  const rows=await tx.$queryRaw<{hits:number}[]>`INSERT INTO public.website_inquiry_rate_limits(source_site,bucket_key,window_start,hits) VALUES(${site},${key},date_trunc('minute',clock_timestamp()),1) ON CONFLICT(source_site,bucket_key) DO UPDATE SET hits=CASE WHEN website_inquiry_rate_limits.window_start>clock_timestamp()-interval '10 minutes' THEN LEAST(website_inquiry_rate_limits.hits+1,1001) ELSE 1 END,window_start=CASE WHEN website_inquiry_rate_limits.window_start>clock_timestamp()-interval '10 minutes' THEN website_inquiry_rate_limits.window_start ELSE date_trunc('minute',clock_timestamp()) END RETURNING hits`;
  return rows[0].hits<=5;
 });
}
