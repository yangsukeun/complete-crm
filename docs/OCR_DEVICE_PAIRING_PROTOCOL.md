# OCR PC 일회 수령 프로토콜 v1 — 기존 내부 callback 방식 대체

이 문서와 현재 코드는 a6c2061의 서버 내부 DPAPI callback 설계를 대체한다. 서버는 Windows 함수를 실행하지 않는다. 실제 운영 발급/장치 등록/배포는 아직 없다.

## 한 번에 이어지는 실행 흐름

1. 대표 PC의 Node 도우미가 `createPcDeliveryClient()`를 생성한다. 메모리에만 RSA3072 개인키를 만들고 공개 descriptor를 표시한다. 새 영구 키/서비스/포트/쿠키 공유는 없다. 프로세스 종료 시 이어받아 재발급하지 않는다.
2. 대표가 기존 CRM 로그인으로 `/logistics/ocr/device`를 열어 **공개 descriptor만** 입력하고 PC 지문과 confirmedFingerprint가 일치하는지 직접 확인한다. private key/token/password는 입력하지 않는다. 이 물리 PC 확인을 생략하면 다른 PC 공개키를 등록할 위험이 있다.
3. `POST /api/logistics-ocr/devices/2eacd22d-537e-4fe5-9a0c-0f848aa5321d/issue`에 descriptor를 보낸다. 대표 세션/활성 여부/same-origin/고정 device·합성 company 검사 후 pending_delivery를 저장한다. 브라우저 응답은 상태/만료 시각뿐이다.
4. PC가 정확한 HTTPS origin으로 `POST .../delivery`를 호출한다. Origin·Cookie·bearer 없이 개인키 서명 증명만 보낸다. 서버는 고정 등록의 공개키로 검증하고 **암호화 envelope만** 반환한다. 다른 URL/redirect는 클라이언트에서 거부한다.
5. PC가 복호화한 `{requestKey,registeredAt,registrationExpiresAt,credential}`를 OCR 담당 d018a36의 `createWindowsDeviceDelivery(expected,revoke)`에 직접 전달한다. 이 함수의 DPAPI wx 저장+복호화 readback 후 `stored` 응답을 검증한다. 평문은 메모리/기존 helper의 내부 파이프에만 존재한다.
6. PC가 envelope digest를 포함한 서명 ACK를 보낸다. 서버가 만료/회수/대표 활성 여부/최신 pending 상태를 다시 검사해 active로 전환한다. 암호문은 지우고 해시·감사 이력만 남긴다. ACK 응답 유실은 `resumeAck()`만 호출한다. 다시 저장하거나 issue하지 않는다.
7. 로컬 저장/readback 실패는 `revoke()`가 서명 fail을 보내 해시와 암호문을 폐기한다. fail은 해당 장치만 회수하며 입고 권한이 없다. 네트워크 불확실이면 활성화로 표시하지 않고 확인 대기한다.

## 정확한 wire 계약

Owner issue body:
`{requestKey:UUID,publicKey:SPKI_PEM,challenge:64자리hex,pairExpiresAt:epoch_ms,confirmedFingerprint:SHA256_SPKI_DER_hex}`

지문 계산의 실제 입력은 SPKI DER 바이트다. pairing 최대5분, 등록 최대7일, token 최대15분이다. 토큰의 expiresAt이 DPAPI credential 만료다. 별도 7일 bearer는 없다.

PC delivery body:
`{requestKey,action:'receive'|'ack'|'fail',signature:base64,digest?:64자리hex}`

서명 원문 UTF8은 `JSON.stringify(['crm-ocr-pair-v1','https://www.cpcrm.co.kr',deviceId,requestKey,challenge,action,digest??''])`다. RSA-PSS/SHA256/saltLength32. ACK에는 digest가 필수다. receive/fail에는 digest 생략. 서버가 브라우저 Origin 헤더를 가진 delivery 요청은 차단한다. 일반 OCR worker bearer로 전달/ACK/발급을 할 수 없다.

receive response:
`{envelope:{key,iv,tag,data},digest,state:'pending_delivery'}`

모든 envelope 값은 base64. key는 RSA-OAEP/SHA256로 감싼 임시 AES256 키, iv는12bytes, tag16bytes, data는AES256-GCM ciphertext다. digest는 SHA256(UTF8 JSON.stringify([key,iv,tag,data]))로 JSONB key 순서와 무관하다. 평문 envelope 형태는 d018a36 문서와 동일하다. ACK는 `{state:'active',...metadata}`, fail은 `{revoked:true}`. 만료410/범위403/이미 회수·충돌409. 모든 응답 no-store.

b0fc945 정합성 보완: fail은 전달·ACK 만료 후에도 최초 토큰의 15분 기간 내 해당 장치를 **회수만** 할 수 있다. receive/ACK는 5분 이후 차단한다. 이는 ACK 서버 반영 후 응답 유실로 PC가 pairing 만료를 맞았을 때 남은 토큰을 폐기하기 위함이다. 이미 회수된 동일 fail은 멱등 응답한다. PC는 회수 promise를 공유하여 전송 1회, 회수 후 ACK 불가, ACK 재시도 전 pairing/token 만료 검사한다. 기간 종료 후 새 발급/활성화 권한은 없다.

고정 deviceId `2eacd22d-537e-4fe5-9a0c-0f848aa5321d`, companyId `e0c563ba-919f-456d-a645-46c5f2b2ec70`, syntheticOnly=true. 실제 ERP customers.id가 아니다.

## OCR 담당의 PC 코드 결합점

CRM 소스 `src/lib/ocr-device-pairing.ts`, `ocr-device-pc-client.ts`는 Node PC 프로토콜 구현이다. OCR 저장소는 이 계약을 따라 자체 모듈로 연결하되 CRM 파일을 동시에 수정하지 않는다.

```ts
const client = createPcDeliveryClient();
// publicDescriptor만 로컬 화면/공개 JSON으로 대표에게 보여 준다. 개인키는 closure 밖으로 나오지 않는다.
// 대표가 CRM에서 동일 공개키 지문을 확인·등록한 뒤:
const delivery = createWindowsDeviceDelivery(expected, () => client.revoke());
await client.receiveAndStore(delivery);
// ACK 응답만 유실되었으면 같은 살아 있는 프로세스의 client.resumeAck() 사용.
```

PC 프로세스는 대표 확인 동안 살아 있어야 한다. 5분 만료/프로세스 재시작/기존 device.dat는 자동 재발급·덮어쓰기하지 않는다. 서버에는 같은 requestKey/같은 descriptor만 기존 상태를 반환하고 다른 descriptor는409다. 알려진 pending 결과를 새 요청으로 바꿔 우회하지 않는다.

## 남은 연결 지점 전체

- CRM `crm_ocr_devices.issuer_state` 열 초안 적용(미적용). delivery에 공개키·5분 challenge·암호문을 보관하며 기존 새 OCR 테이블 안에서만 동작한다. 기존 전체 권한/다른 테이블 변경 없음.
- CRM runtime을 기존 Prisma 및 이 issuer에 연결하고 실제 배포. 현재 getDeviceIssuer()는 null. 실제 승인되지 않은 인증을 생성하지 않도록 유지한다.
- PC 도우미에 위 client와 기존 Windows delivery 결합, 공개 descriptor 표시·대표 지문 확인·ACK 결과 UI. 정상 스크립트 실행 경로 확정 후 합성 자료로 검사한다. 새 서버/상시 데몬은 필요 없다.
- Supabase 내장 브라우저 로그인 → private bucket 생성 → 기존 서버 Storage 클라이언트 연결. 버킷 없이 issuer만 활성화하지 않는다.
- 실제 PG 동시성/회수, 실제 동일PC DPAPI, 실제 HTTPS 왕복 E2E는 미검증이다. 합성 테스트는 실제 crypto와 HTTP handler 직렬화를 사용하지만 외부망 배포 시험은 아니다.
- ERP user/customer/review 명시적 매핑과 운영050/051 확인·담당자 최종입고는 별도 미완료다. 이 전달 프로토콜은 ERP 인증·재고 권한을 제공하지 않는다.
- 새 외부 서비스/영구 장치 권한은 필요하지 않는 설계다. 향후 자동 재등록·토큰 자동갱신·다른 PC 확대는 이번 구현에 없다.
