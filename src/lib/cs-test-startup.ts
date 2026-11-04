import { z } from 'zod';
import { reviewSchema } from './cs-complete-test';

const rowSchema = z.object({ id: z.string().regex(/^[a-f0-9]{64}$/), version: z.number().int().positive(), snapshotId: z.string(), employeeCount: z.number().int().nonnegative(), entryCount: z.number().int().nonnegative() });
export type SavedTestRow = z.infer<typeof rowSchema>;
export const isSyntheticSnapshot = (id: string) => id.startsWith('synthetic-');

// Only the isolated TEST endpoint is read. Multiple sources require an explicit choice.
export async function readTestStartup(fetcher: typeof fetch, signal: AbortSignal) {
  async function get(url: string) {
    const response = await fetcher(url, { cache: 'no-store', signal });
    if (!response.ok) throw new Error(response.status === 401 ? '로그인 세션을 확인한 뒤 다시 불러오세요.' : '저장된 TEST 사본을 불러오지 못했습니다. 다시 시도해 주세요.');
    return response.json();
  }
  const { records } = z.object({ records: z.array(rowSchema) }).parse(await get('/api/cs-complete-test'));
  if (records.length !== 1) return { records, opened: null };
  const opened = z.object({ id: z.string(), version: z.number().int().positive(), payload: reviewSchema }).parse(await get('/api/cs-complete-test?id=' + encodeURIComponent(records[0].id)));
  if (opened.id !== records[0].id) throw new Error('사본 식별자가 일치하지 않습니다. 다시 불러오세요.');
  return { records, opened };
}
