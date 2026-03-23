/** 서버: DEBUG_ONESIGNAL=1 또는 개발 환경에서 상세 로그 */
export function isOneSignalServerDebug(): boolean {
  return process.env.DEBUG_ONESIGNAL === "1" || process.env.NODE_ENV === "development";
}
