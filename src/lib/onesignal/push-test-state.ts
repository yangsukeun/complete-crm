export const PUSH_TEST_TTL = 10 * 60 * 1000;
export const PUSH_TEST_KIND = "web-push-test-v1";
export const PUSH_TEST_LINK = "/profile?push-test";
export function testBinding(subscriptionId: string) { return PUSH_TEST_KIND + ":" + subscriptionId; }
export type PendingTest = { key: string; subscriptionId: string; createdAt: number; accepted: boolean };
export function pendingTest(raw: string | null, subscriptionId: string, now: number, uuid: () => string): PendingTest {
 if (raw) {
  const value = JSON.parse(raw) as PendingTest;
  if (!value.key || typeof value.createdAt !== "number" || value.subscriptionId !== subscriptionId) throw new Error("기존 시험의 대상이 다릅니다. 기존 시험을 확인한 뒤 새 시험을 준비하세요.");
  if (now - value.createdAt >= PUSH_TEST_TTL || now < value.createdAt) throw new Error("기존 시험의 재시도 시간이 끝났습니다. 수신 여부를 확인하고 새 시험 준비를 누르세요.");
  return value;
 }
 return { key: uuid(), subscriptionId, createdAt: now, accepted: false };
}
