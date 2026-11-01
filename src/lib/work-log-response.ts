export type WorkLogActivity = { actionType: string; targetTitle: string; timestamp: string; ipAddress?: string | null };
export type WorkLogResult =
  | { kind: 'loaded'; content: string; status: 'DRAFT'|'SUBMITTED'; activities: WorkLogActivity[] }
  | { kind: 'missing' }
  | { kind: 'error'; message: string };
export function validWorkLogDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0,10) === value;
}
/** Missing is recognized only by explicit API code, never arbitrary 404/HTML. */
export async function readWorkLogResponse(response: Response): Promise<WorkLogResult> {
  const data = await response.json().catch(() => null);
  if (response.status === 404 && data?.code === 'WORK_LOG_NOT_FOUND') return { kind:'missing' };
  if (!response.ok) return {kind:'error',message:
    response.status===401?'로그인이 만료되었습니다. 로그인 상태를 확인해 주세요.':
    response.status===403?'이 일지를 조회할 권한이 없습니다.':
    response.status===400?'직원과 날짜를 확인해 주세요.':
    `일지 조회에 실패했습니다 (HTTP ${response.status}). 저장된 일지 유무는 확인되지 않았습니다.`};
  if (!data || typeof data.content!=='string' || !['DRAFT','SUBMITTED'].includes(data.status)) return {kind:'error',message:'일지 응답 형식을 확인할 수 없습니다. 다시 조회해 주세요.'};
  const activities: WorkLogActivity[] = Array.isArray(data.activities)?data.activities.filter((a: WorkLogActivity)=>a&&typeof a.actionType==='string'&&typeof a.targetTitle==='string'&&typeof a.timestamp==='string'&&Number.isFinite(Date.parse(a.timestamp))):[];
  return {kind:'loaded',content:data.content,status:data.status,activities};
}
