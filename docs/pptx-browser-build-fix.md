# PPTX 브라우저 빌드 수정 — 2026-11-02

운영 기준 4861d50을 별도 변경 없는 worktree에서 `next build --webpack`으로 빌드해도 pptxgenjs의 node:fs/node:https UnhandledSchemeError가 동일하게 발생했다. 아벤트 변경이 원인이 아니다.

Next webpack의 클라이언트 컴파일에서만 pptxgenjs/dist가 요청한 두 node: 접두사를 제거한다. 그러면 패키지에 이미 선언된 browser:false가 적용된다. 서버 모듈과 다른 패키지의 fs/https는 바꾸지 않는다. PDF/PPTX 생성 로직은 변경하지 않았다.

정식 build 스크립트도 --webpack을 명시했다. 기존 dev/analyze와 같은 번들러이며 Next16 기본 Turbopack이 webpack 설정을 무시하거나 거부하는 혼선을 방지한다. 의존성 설치나 Prisma generate는 공유 node_modules 변경을 피하려고 이번 실행에서 하지 않았다. 기존 설치된 생성 클라이언트로 `next build --webpack`을 직접 실행했다.

검증 완료:

- 전체 Next webpack production build exit0, TypeScript 및 정적 페이지156개 생성 완료. /logistics/orders와 /api/avent/reviews 라우트 포함.
- 실제 document-download.ts를 webpack으로 번들링한 로컬 Chromium에서 PDF/PPTX 버튼 클릭·다운로드 성공. PDF 시그니처와 PPTX ZIP slide1.xml 합성 본문 확인. 외부 네트워크 차단.
- CRM route/page Vitest6개 통과, next.config.ts ESLint 통과.
- 운영 로그인, 실사용 문서 내용, 배포 환경, 기존 PDF 한글 폰트 표현은 이번 검증 범위가 아니다.

브라우저 재현: 설치된 Playwright 경로를 AVENT_TEST_PLAYWRIGHT, 브라우저 경로를 PLAYWRIGHT_BROWSERS_PATH로 지정한 후 `node tests/document-export-e2e.cjs`. 테스트는 `.avent-test/export`에 합성 파일만 쓴다.

Vercel 최소 파일럿 검토의 최신 결론: 상시 worker는 계산에 필수가 아니다. 별도 `avent-online-integration/SERVERLESS_PILOT.md`와 버퍼 코드/실물7쌍 검증을 우선 참조한다. 기존 통합 문서의 worker 필수처럼 읽히는 구성안과 빌드 실패 상태는 이 후속 검증으로 갱신된다. CRM runtime은 현재 계속 null이며 운영 활성화/배포하지 않았다.
