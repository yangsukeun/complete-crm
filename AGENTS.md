# 작업 규칙

## 배포

작업을 끝내면 **확인을 묻지 말고 항상 커밋 후 배포**한다.

1. `npx tsc --noEmit` 과 `npx next build` 로 검증한다.
   - `npm run build` 앞단의 `prisma generate` 는 개발 서버가 쿼리 엔진 DLL을
     잡고 있으면 EPERM으로 실패한다. 스키마를 바꾸지 않았다면 `npx next build` 로 검증한다.
2. 변경한 파일만 스테이징한다. `cookies.txt`, `build-out.txt`, `*-report.txt` 같은
   로컬 산출물은 커밋하지 않는다(세션 쿠키 등 비밀값이 들어 있을 수 있다).
3. `main` 에 푸시하면 Vercel이 자동 배포한다. 배포 상태는
   `gh api repos/yangsukeun/complete-crm/commits/<sha>/status` 로 확인한다.
4. Prisma 스키마를 바꿨다면 푸시 전에 `npm run db:migrate` 로 마이그레이션을 반영한다.

커밋 메시지는 한국어로, 제목 한 줄 뒤에 "왜 고쳤는지"를 본문에 적는다.
