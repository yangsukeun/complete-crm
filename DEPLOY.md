# 배포를 위한 절차

Next.js + Prisma + PostgreSQL( Supabase ) + NextAuth 기반 CRM의 배포 절차입니다.

---

## 1. 배포 전 준비

### 1) PostgreSQL DB 준비 (Supabase 권장)

- [Supabase](https://supabase.com)에서 프로젝트 생성 후 **데이터베이스 연결 정보** 복사
- **연결 문자열**: Supabase 대시보드 → 설정 → Database → 연결 문자열  
  - **직접 연결(5432)** 또는 **세션 풀러** URI 사용  
  - 끝에 `?sslmode=require` 붙이기  
  - 예: `postgresql://postgres.xxxx:비밀번호@db.xxxx.supabase.co:5432/postgres?sslmode=require`

### 2) 환경 변수 정리

배포 환경(Vercel/서버)에 아래 변수를 설정합니다.

| 변수 | 필수 | 설명 |
|------|------|------|
| `DATABASE_URL` | ✅ | PostgreSQL 연결 문자열 (Supabase 직접 연결 URI) |
| `AUTH_SECRET` 또는 `NEXTAUTH_SECRET` | ✅ (운영) | 랜덤 문자열. 터미널에서 `openssl rand -base64 32` 로 생성 |
| `NEXTAUTH_URL` | ✅ (운영) | 배포된 사이트 URL. 예: `https://your-app.vercel.app` |
| `GEMINI_API_KEY` | 선택 | AI 비서 사용 시 (Gemini) |
| `OPENAI_API_KEY` | 선택 | AI 비서를 GPT로 쓸 때 |

---

## 2. Vercel로 배포 (권장)

### 2-1. Vercel 연결

1. [Vercel](https://vercel.com) 로그인 후 **Add New Project**
2. GitHub/GitLab 등에서 **complete-crm** 저장소 선택
3. **Root Directory**가 프로젝트 루트인지 확인 (complete-crm 한 단계가 루트면 그대로)
4. **Environment Variables**에서 아래 추가:
   - `DATABASE_URL` = (Supabase에서 복사한 URI)
   - `AUTH_SECRET` = (위에서 생성한 값)
   - `NEXTAUTH_URL` = `https://프로젝트이름.vercel.app` (첫 배포 후 도메인으로 바꿔도 됨)
   - 필요 시 `GEMINI_API_KEY` 등
5. **Deploy** 클릭

### 2-2. 빌드 설정 (이미 적용된 경우)

프로젝트에 `vercel.json`이 있으면 다음이 적용됩니다.

- **Build Command**: `prisma generate && next build`
- **Framework**: Next.js

Vercel이 자동으로 `npm install` → `prisma generate` → `next build` 순으로 실행합니다.

### 2-3. DB 스키마 반영 (최초 1회)

Vercel 배포만으로는 **DB 테이블이 생성되지 않습니다**. 로컬 또는 CI에서 한 번 실행해야 합니다.

**방법 A – 로컬에서 실행 (가장 간단)**

1. 로컬 `.env`에 **배포용과 동일한** `DATABASE_URL` 설정 (Supabase 직접 연결)
2. 프로젝트 폴더에서:
   ```bash
   npx prisma db push
   npx prisma db seed
   ```
3. `db:seed`는 관리자 계정(예: admin@complete.co.kr) 생성. 이미 계정이 있으면 생략 가능

**방법 B – Vercel 빌드 후 수동**

- 로컬에서 `DATABASE_URL`만 배포용으로 바꾼 뒤 위와 동일하게 `db push` / `db seed` 실행

---

## 3. 배포 후 확인

1. 배포된 URL 접속 (예: `https://your-app.vercel.app`)
2. `/login` 접속 후 시드 계정으로 로그인 (예: admin@complete.co.kr / 1234)
3. **설정 → 회사 설정**에서 이체 담당자 등 필요한 값 입력

---

## 4. 코드 수정 후 재배포 (Vercel)

1. 변경 사항 커밋 후 푸시:
   ```bash
   git add .
   git commit -m "변경 내용 요약"
   git push
   ```
2. Vercel이 자동으로 새 배포를 시작합니다.
3. **DB 스키마를 바꾼 경우**에는 로컬(또는 동일 `DATABASE_URL` 환경)에서 다시:
   ```bash
   npx prisma db push
   ```

---

## 5. 그 외 플랫폼 (VM, Docker 등)

- **빌드**: `npm run build` (이미 `prisma generate` 포함)
- **실행**: `npm run start` (기본 포트 3000)
- **DB**: 배포 서버에서 `DATABASE_URL`을 설정한 뒤, 해당 서버 또는 로컬에서 `npx prisma db push` / `npx prisma db seed` 실행
- **환경 변수**: 위 1-2와 동일하게 `DATABASE_URL`, `AUTH_SECRET`, `NEXTAUTH_URL` 필수

---

## 요약 체크리스트

- [ ] PostgreSQL(Supabase) DB 생성 및 `DATABASE_URL` 확보
- [ ] `AUTH_SECRET` 생성 후 배포 환경에 등록
- [ ] 배포 URL로 `NEXTAUTH_URL` 설정
- [ ] Vercel(또는 사용 플랫폼)에 환경 변수 입력
- [ ] 최초 1회 `npx prisma db push` 및 필요 시 `npx prisma db seed` 실행
- [ ] 배포 URL 접속 후 로그인 및 기본 설정 확인
