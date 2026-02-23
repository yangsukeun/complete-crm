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

## 스크립트

- `npm run dev` — 개발 서버
- `npm run build` / `npm run start` — 프로덕션
- `npm run db:push` — 스키마 반영
- `npm run db:seed` — 관리자 계정 생성
