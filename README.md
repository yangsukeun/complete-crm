# COMPLETE CRM

Next.js 16, TypeScript, Prisma, NextAuth v5, Tailwind, Shadcn/UI 기반 CRM입니다.

## ⚠️ 404 나올 때

**반드시 이 프로젝트 폴더(complete-crm)를 연 다음** 서버를 실행하세요.

1. Cursor에서 **파일 → 폴더 열기** → `C:\Users\USER\complete-crm` 선택
2. 터미널 열기 (Ctrl+`) → 아래 명령 실행

```bash
npm run dev
```

3. 브라우저에서 **http://localhost:3000** 또는 **http://localhost:3000/login** 접속

홈 폴더(C:\Users\USER)에서 터미널을 열었다면, 먼저 `cd complete-crm` 한 뒤 `npm run dev` 하세요.

## 폴더 구조

```
complete-crm/
├── app/             # 페이지 (login, dashboard, schedule, tasks, admin, api)
├── prisma/
├── public/
├── src/             # auth, middleware, components, lib (storage 등), types
├── .env
├── package.json
└── tsconfig.json    # paths: @/* → ./src/*
```

## 처음 실행

```bash
cd C:\Users\USER\complete-crm
npm install
npx prisma generate
npx prisma db push
npx prisma db seed
npm run dev
```

브라우저: http://localhost:3000  
로그인(마스터): **admin@complete.co.kr** / **1234**  
(원하면 `.env`에 `MASTER_EMAIL`, `MASTER_PASSWORD`, `MASTER_NAME`을 설정한 뒤 `npm run db:seed`로 변경 가능)

## AI 비서 (Gemini / GPT / 노트북 LLM)

**기본값은 Gemini**입니다. `.env`에서 `AI_PROVIDER`로 전환할 수 있습니다.

| 프로바이더 | AI_PROVIDER | 필수 환경 변수 |
|-----------|-------------|-----------------|
| **Gemini** (기본) | `gemini` 또는 생략 | `GEMINI_API_KEY` |
| **GPT** | `openai` 또는 `gpt` | `OPENAI_API_KEY` |
| **노트북 LLM** (Ollama 등) | `notebook` 또는 `local` | `NOTEBOOK_LLM_URL` |

예시 (.env):

```env
# 사용할 AI (기본: gemini)
AI_PROVIDER=gemini

# Gemini (기본일 때)
GEMINI_API_KEY=여기에_키
# GEMINI_MODEL=gemini-1.5-flash

# GPT로 바꿀 때
# AI_PROVIDER=openai
# OPENAI_API_KEY=sk-...
# OPENAI_MODEL=gpt-4o-mini

# 노트북 LLM(Ollama 등)으로 바꿀 때
# AI_PROVIDER=notebook
# NOTEBOOK_LLM_URL=http://localhost:11434/v1
# NOTEBOOK_LLM_MODEL=llama3.2
```

변경 후 서버를 다시 시작하세요.

## 파일 저장소 (게시판·채팅·에디터 `/api/upload`)

게시판 첨부 등은 모두 **`/api/upload`** 로 올라가며, `STORAGE_PROVIDER`와 환경 변수로 백엔드를 고릅니다. 자세한 키는 **`.env.example`** 참고.

| 모드 | 설명 |
|------|------|
| **auto** (기본) | **Vercel:** `GOOGLE_DRIVE_*` 서비스 계정이 있으면 **Google Drive 우선**(100MB 이하 권장). 다음 WebDAV, 다음 Blob 토큰. **로컬:** Blob 토큰 있으면 Blob, 없으면 `public/uploads/content`. |
| **vercel-blob** | `BLOB_READ_WRITE_TOKEN` 필수 |
| **google-drive** | 서비스 계정 + `GOOGLE_DRIVE_FOLDER_ID`. 폴더는 서비스 계정 이메일에 **편집자**로 공유 필요. 응답 `url`은 Drive 보기 링크. |
| **webdav** | 시놀로지 **WebDAV** 등. `WEBDAV_URL`, 계정, **`WEBDAV_PUBLIC_BASE_URL`**(브라우저에서 열 수 있는 HTTPS 경로) 필요. |
| **local** | `public/uploads/content` (Vercel에서는 사용 불가) |

**NAS만 백업용으로 쓰기:** 주 저장소는 Blob 또는 Drive로 두고 `STORAGE_MIRROR_WEBDAV=true` 로 설정하면, 업로드 성공 후 같은 파일을 WebDAV 경로에 한 번 더 올립니다. (NAS에 공개 URL이 없어도 미러 업로드는 가능합니다.)

**한글 파일:** `.hwp` / `.hwpx` 업로드 허용이 추가되어 있습니다.

## 변경 사항 반영하기 (커밋 & 푸시)

코드를 수정한 뒤 **Vercel 등에 배포된 사이트에 반영**하려면 Git에 커밋하고 푸시해야 합니다.

1. **터미널**을 연 다음 프로젝트 폴더로 이동합니다. (아래 명령을 **터미널에 입력**합니다.)
   ```bash
   cd C:\Users\USER\complete-crm
   ```
2. **변경된 파일을 커밋할 목록에 넣기(스테이징)** — 역시 **터미널에 입력**합니다.
   ```bash
   git add .
   ```
   (특정 파일만 넣으려면 `git add app/login/login-form.tsx` 처럼 경로를 지정합니다.)
3. **커밋**합니다. (터미널에 입력)
   ```bash
   git commit -m "로그인 화면에 비밀번호 재설정 링크 추가"
   ```
   `-m` 뒤의 메시지는 이번 수정 내용을 간단히 적으면 됩니다.
4. **원격 저장소로 푸시**합니다. (터미널에 입력)
   ```bash
   git push
   ```
   Vercel이 GitHub/GitLab 등에 연결되어 있으면 푸시 시 자동으로 새 배포가 시작됩니다. 배포가 끝나면 배포된 URL에서 변경 사항을 확인할 수 있습니다.

---

## 스크립트

- `npm run dev` — 개발 서버
- `npm run build` / `npm run start` — 프로덕션
- `npm run db:push` — 스키마 반영
- `npm run db:seed` — 관리자 계정 생성
