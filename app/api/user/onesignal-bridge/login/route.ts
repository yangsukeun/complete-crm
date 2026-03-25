/**
 * 호환용 엔드포인트: 일부 클라이언트/문서가 /api/user/onesignal-bridge/login 을 가리키는 경우.
 * 본문·동작은 POST /api/user/onesignal-register 과 동일합니다.
 */
export { POST } from "../../onesignal-register/route";
