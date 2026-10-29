# GoPro 일반 직원 업무일지 조회

- 기준 운영: d344413. 활성 GoPro 계정 ID cmmiu416h0000hlpoe4ax1cnq, USER, 경영지원 확인.
- 조보미 ID cmqu62595000d94im1hdpj79t, USER, 마케팅, 활성 확인. 일지 본문은 조회하지 않음.
- 정확한 GoPro ID + USER + 경영지원 조건에서만 Daily Report 메뉴와 일반 직원 USER 대상 읽기 허용.
- 대표 ID는 역할과 무관하게 제외. ADMIN/EXECUTIVE/TEAM_LEAD/CENTER_CHIEF/비활성 대상 제외.
- 일반 직원의 부서 제한은 없으나 다른 조회자의 권한은 그대로. 기존 김정신 다섯 명 예외도 그대로.
- /admin/logs 직원 선택 필터와 /api/work-logs 직접 userId/date 조회가 공통 정책 사용.
- 타인 일지가 없으면 404이며 초안을 생성하지 않음. 캐시는 private,no-store.
- PATCH는 계속 로그인 사용자 본인의 일지만 수정. 삭제 권한, 재무/Drive 권한, DB/RLS/계정 역할 변경 없음.
- 합성 신규 9개 및 기존 20개 테스트 통과. 실제 GoPro 로그인 클릭 검수와 운영 반영은 별도.
