# 커밋 후 배포 가이드

빌드가 무사히 완료된 뒤, 아래 순서대로 진행하세요.

---

## 1. 커밋 & 푸시 (배포 트리거)

```powershell
# 변경 파일 스테이징
git add .

# 커밋 (메시지는 작업 내용에 맞게 수정)
git commit -m "빌드 오류 수정: 채팅 페이지 dynamic import를 클라이언트 래퍼로 이동"

# 원격 저장소로 푸시 → Vercel 자동 배포
git push origin main
```

- `main` 대신 사용 중인 기본 브랜치가 있으면 해당 이름으로 바꾸세요.
- Vercel에 저장소를 연결해 두었다면 **푸시만 하면 자동으로 배포**가 시작됩니다.

---

## 2. 배포 확인

1. [Vercel 대시보드](https://vercel.com/dashboard) 접속
2. 해당 프로젝트 선택 → **Deployments** 탭
3. 가장 최근 배포 상태가 **Ready**가 될 때까지 대기

---

## 한 줄로 실행 (PowerShell)

커밋 메시지를 한 번만 입력하고 싶을 때:

```powershell
git add . ; git commit -m "배포: 최신 변경사항 반영" ; git push origin main
```

---

## 주의사항

- **환경 변수**: Vercel 프로젝트 설정에서 `DATABASE_URL`, `NEXTAUTH_SECRET` 등이 설정되어 있는지 확인하세요.
- **DB 스키마 변경 시**: 스키마를 수정했다면 배포 전/후에 프로덕션 DB에 `npx prisma db push` 또는 마이그레이션을 적용해야 합니다.
