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
├── src/             # auth, middleware, components, lib, types
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
로그인: **admin@complete.co.kr** / **1234**

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
