# CRM → 기존 ERP 연결 인계

기존 후보 호스트 `https://logistics-erp-mvp.vercel.app`, 저장소 `Complete2020/logistics-erp-mvp`. 부모가 가이드 및 Production 상태를 대조한 사실이다. CRM 담당은 ERP 로그인 이후 데이터/고객사/입고 API를 아직 검증하지 않았다.

CRM 수정 영역은 `src/lib/logistics-ocr.ts`, `ocr-internal-*`, `app/api/logistics-ocr`, `app/logistics/ocr`다. ERP 담당은 해당 파일을 수정하지 않고 ERP API 계약을 전달한다.

기존 재개 링크 계약은 `/inbound/photo/resume?review=<ERP review UUID>&company=<ERP company UUID>&revision=<ERP version>`이다. CRM 문서 UUID/합성 company UUID를 ERP UUID로 복사하지 않는다. 사진 경로/장치 토큰/승인 플래그를 링크에 넣지 않는다. ERP가 자신의 현재 로그인으로 고객사·문서·최신 버전과 상태를 다시 검사해야 한다.

필수 매핑은 CRM actor ↔ ERP user, CRM 업무 범위 ↔ ERP company/customer, CRM document+revision ↔ ERP review+revision이다. 현재 매핑은 미확정이며 이름/이메일 추측이나 공유 인증으로 채우지 않는다. 서버 간 문서 전달 인증은 7일 OCR 장치 인증과 다른 범위로 검토한다.

CRM `reviewed`는 내부 검수 저장 성공만 뜻한다. ERP 문서 생성/반영 영수증, 담당자 최종 확인, ERP 재고 트랜잭션 완료는 별개다. 전달 키는 source CRM document+revision으로 안정적으로 유지하고 같은 키 다른 내용은 409로 거부해야 한다. 결과 유실 시 신규 생성/입고 재시도 전에 ERP 영수증을 조회해야 한다. 실제 계약이 오기 전 외부 API 호출·재고 갱신·입고 완료 표시를 구현하지 않는다.

기존 `resumeOcrReview`는 서버가 확인한 ERP 문서 권한/버전/상태만 링크로 만들며 registrationAuthorized=false를 반환한다. 실제 어댑터는 계속 미연결이다. ERP 담당에게 필요한 정보: 현재 입고 API/권한검사, 고객사 PK 의미, 검수 문서 생성·조회·취소 상태, 멱등 영수증 조회 경로, 최종 확인 주체 및 재고 트랜잭션 경계.

## ERP 담당 6a43d0a 계약 대조

`ERP_CRM_MAPPING_HANDOFF.md`를 허용된 경로에서 읽었다. ERP는 Supabase auth.getUser와 user_profiles(id, role, company_id, is_active, permissions)를 사용한다. 고객사는 customers.id이다. 검수는 super_admin/logistics_manager/warehouse_worker, 최종 승인은 super_admin/logistics_manager이다. CRM ADMIN으로 ERP 역할을 부여하지 않는다.

명시적 매핑 필드는 mapping(id, crmSubject, crmCompanyId, erpUserId, erpCompanyId, active, revision, expiresAt). 같은 CRM subject/company에는 현재 유효 매핑 하나만 허용한다. 누락/중복/만료/회수/타 ERP 사용자/고객사는 거부한다. ERP의 `mappedCrmReviewReference` 검사를 CRM 측 실제 매핑 저장소 어댑터와 연결해야 하며 클라이언트 profile 입력을 신뢰하지 않는다. 현재 네 OCR 테이블에는 이 교차 서비스 매핑이 없으므로 기존 장치 승인으로 임의 매핑/SSO를 생성하지 않는다.

장치 발급 주체는 CRM 한 곳으로 고정한다. OCR 담당은 토큰을 독립 발급하거나 수명을 연장하지 않는다. CRM 장치 등록 최대7일/토큰15분/회수 즉시 적용, 장치 scope는 합성 고객의 claim·lease/image·result뿐이다. ERP 로그인·검수/입고 권한과 완전히 별개다. 장치 값은 채팅으로 전달하지 않고 승인된 동일 PC DPAPI CurrentUser 경로로만 전달할 준비를 하며 아직 발급하지 않았다.

ERP 저장은 `save_or_confirm_photo_inbound`의 revision/중복 검사와 기존 `approve_ocr_scan` 재고 트랜잭션을 사용한다는 인계를 받았다. ERP 050/051 운영 마이그레이션 여부는 미확인이다. 운영 ERP main af3cdad Ready와 시험 배포 Ready는 부모/ERP 담당의 메타데이터 확인이며 CRM에서 실제 입고 성공을 확인한 증거가 아니다.
