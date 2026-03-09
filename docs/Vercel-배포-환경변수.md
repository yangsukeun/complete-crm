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

## 4. DATABASE_URL이 설정했는데도 "Environment variable not found" / 401 나올 때

**원인:** 환경 변수를 넣었지만 (1) **다른 프로젝트/팀**에 넣었거나, (2) **저장 후 새 배포를 하지 않았을** 가능성이 큽니다.

**순서대로 확인하세요.**

1. **어느 프로젝트에 넣었는지**
   - 접속 중인 주소가 `complete-crm-tard.vercel.app` 이면, **그 도메인을 가진 프로젝트**에서 설정해야 합니다.
   - Vercel 대시보드에서 **프로젝트 목록** → **complete-crm (또는 해당 프로젝트 이름)** 클릭 → **Settings** → **Environment Variables**.
   - 여기서 설정해야 합니다. **Team Settings → Environment Variables**에만 넣었다면, 팀 변수를 이 프로젝트에 “연결”해 두었는지 확인하세요.

2. **Environment(환경) 체크**
   - `DATABASE_URL` 추가/수정 시 **Production**, **Preview**, **Development** 중 **최소한 Production**에 체크되어 있어야 합니다.
   - Production에 체크 안 되어 있으면 프로덕션 URL에서만 변수가 비어 있을 수 있습니다.

3. **저장 후 반드시 새 배포**
   - 환경 변수는 **저장만 하면 기존 배포에는 적용되지 않습니다.** 새로 빌드된 배포에만 들어갑니다.
   - **Deployments** 탭 → 맨 위 배포 오른쪽 **⋮** (점 3개) → **Redeploy** 클릭 → **Redeploy** 확인.
   - 또는 로컬에서 `git commit --allow-empty -m "trigger redeploy"` 후 `git push` 해서 새 배포가 나오게 한 뒤, 그 새 배포가 끝날 때까지 기다립니다.

4. **변수 이름 오타**
   - 이름은 반드시 **`DATABASE_URL`** (대소문자, 밑줄 포함) 그대로여야 합니다. `Database_Url`, `DATABASE_URL `(공백) 등이면 인식되지 않습니다.

5. **값이 비어 있지 않은지**
   - Value 칸에 연결 문자열이 **실제로 붙여 넣어져 있는지**, 앞뒤 공백이 없고 한 줄인지 확인하세요.

위를 다 했는데도 같은 오류가 나면, **Deployments**에서 방금 Redeploy한 배포를 클릭 → **Building** / **Logs**에서 빌드 로그를 열고, 그 배포에 환경 변수가 주입되는지(에러 메시지에 DATABASE_URL 언급이 있는지) 확인해 보세요.

## 5. 콘솔에 401 오류(_next/static 등)가 날 때

`/_next/static/...` 같은 정적 파일 요청에 **401 (Unauthorized)** 가 나오면, 대부분 **Vercel Deployment Protection** 때문입니다.

- **Settings** → **Deployment Protection** 에서 **Vercel Authentication** 또는 **Password Protection** 이 켜져 있으면, 로그인하지 않은 요청(정적 파일 포함)이 401을 받을 수 있습니다.
- 테스트용이면 해당 보호를 끄거나, 실제 사용자만 쓸 경우 로그인 후 사용하면 401이 사라집니다.
