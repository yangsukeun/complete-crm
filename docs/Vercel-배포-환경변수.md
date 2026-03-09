# Vercel 배포 시 환경 변수

배포 후 **404** 또는 **"Auth api path is not configured. Please set NEXTAUTH_URL"** 가 나오면 아래를 확인하세요.

## 1. 자동 설정 (코드 반영됨)

- **NEXTAUTH_URL** 를 설정하지 않아도, Vercel에서는 `VERCEL_URL` 이 자동으로 있으므로 코드에서 `https://${VERCEL_URL}` 로 채웁니다.
- 최신 코드 배포 후에는 해당 경고가 사라져야 합니다.

## 2. Vercel 대시보드에서 직접 설정 (권장)

[Vercel 대시보드](https://vercel.com/dashboard) → 프로젝트 선택 → **Settings** → **Environment Variables** 에서 다음을 넣어 두는 것을 권장합니다.

| 변수명 | 값 예시 | 설명 |
|--------|---------|------|
| `NEXTAUTH_URL` | `https://complete-crm-luard.vercel.app` | 배포된 앱 주소 (프로덕션용) |
| `AUTH_URL` | 위와 동일 | NextAuth 호환용 |
| `DATABASE_URL` | 아래 참고 | **Supabase 사용 시 반드시 연결 풀러 URL 사용** (직접 연결 시 비밀번호 재설정 등 DB 작업이 실패할 수 있음) |

**Supabase 연결 풀러 설정 (비밀번호 재설정 등 DB 사용 필수):**
1. [Supabase 대시보드](https://supabase.com/dashboard) → 프로젝트 → **Project Settings** → **Database**
2. **Connection string**에서 **"Transaction"** 또는 **"Session"** 모드 선택 후 나오는 URL 복사 (포트 **6543**)
3. Prisma 사용 시 URL **끝에** `?pgbouncer=true` 를 붙여서 `DATABASE_URL`에 넣기  
   예: `postgresql://postgres.xxx:비밀번호@aws-0-ap-northeast-2.pooler.supabase.com:6543/postgres?pgbouncer=true`  
4. Vercel **Environment Variables**에 저장 후 **반드시 Redeploy**

| `NEXTAUTH_SECRET` 또는 `AUTH_SECRET` | 랜덤 문자열 | 세션 암호화용 |

**주의:** 도메인이 `complete-crm-luard.vercel.app` 이면 위 예시처럼 그대로 넣고, 실제 사용하는 URL이 다르면 그 URL로 설정하세요.

## 3. 배포 후에도 /signup 404가 나올 때

**중요:** **Redeploy**는 “같은 커밋”을 다시 빌드합니다. 방금 수정한 코드가 반영되려면 **먼저 Git에 푸시**한 뒤 배포해야 합니다.

1. **코드 푸시 후 배포**
   - 로컬에서: `git add .` → `git commit -m "fix auth and layout"` → `git push`
   - Vercel이 연결된 브랜치에 푸시하면 자동으로 새 배포가 뜁니다.
   - 또는 Vercel 대시보드에서 **Deployments** → **Create Deployment** → 최신 커밋 선택 후 Deploy.
2. **Redeploy만 한 경우**
   - “Redeploy”는 **마지막으로 푸시된 커밋**을 다시 빌드할 뿐입니다.
   - 수정 사항이 아직 푸시되지 않았다면, Redeploy만으로는 반영되지 않습니다.
3. **브라우저:** 시크릿 창에서 `https://본인도메인/signup` 다시 열기.
4. **환경 변수:** 추가·수정 후에는 반드시 한 번 더 배포(Redeploy 또는 새 Deploy)해야 적용됩니다.

## 4. 콘솔에 401 오류(_next/static 등)가 날 때

`/_next/static/...` 같은 정적 파일 요청에 **401 (Unauthorized)** 가 나오면, 대부분 **Vercel Deployment Protection** 때문입니다.

- **Settings** → **Deployment Protection** 에서 **Vercel Authentication** 또는 **Password Protection** 이 켜져 있으면, 로그인하지 않은 요청(정적 파일 포함)이 401을 받을 수 있습니다.
- 테스트용이면 해당 보호를 끄거나, 실제 사용자만 쓸 경우 로그인 후 사용하면 401이 사라집니다.
