# CRM 성능 분석 요약

## 1. 빌드 (`npm run build`)

- **Next.js 16.1.6 (Turbopack)** — 전체 앱 동적 라우트(`ƒ`) 위주. 기본 `next build` 출력에는 **페이지별 First Load JS가 표시되지 않음** (Turbopack). 상세 청크는 `@next/bundle-analyzer` 권장.
- **`optimizePackageImports`**: `lucide-react`, `@mantine/core`, `@mantine/hooks` — 아이콘/Mantine 트리쉐이킹으로 클라이언트 번들 축소.
- **무거운 페이지(추정)**: `/tasks`(클라이언트 대형), `/chat`(클라이언트 대형), `/dashboard`(서버에서 Prisma + 매출 집계 다수).

## 2. N+1 / 쿼리 패턴

- **grep 기준** `for` 루프 안 `await prisma` 패턴은 발견되지 않음.
- **채팅 목록** `GET /api/chats`: 채팅당 `participants` + 마지막 `messages` — 관계 1회 쿼리로 처리(전형적 N+1은 아님). 메시지/유저는 **필드 `select` 축소**로 개선.
- **대시보드(관리자)**: `Promise.all` 이후 **`getDashboardSalesStats()` 순차 실행** → **병렬화 필요** (이번에 수정).

## 3. 즉시 적용한 개선

| 항목 | 내용 |
|------|------|
| 대시보드 | 관리자/직원 분기에서 `joinDate`, Prisma 배치, `leaveBalance`, `getDashboardSalesStats`를 **`Promise.all` 한 번**으로 |
| 대시보드 | 목록용 `task.findMany`에서 **`description` 제외** (`select` 기반) |
| 부서/직책 API | `unstable_cache` (revalidate 120s) |
| 직원 목록 API | 전체 직원 **짧은 캐시**(revalidate 60s) 후 세션 기준 필터 |
| 채팅 목록 API | 마지막 메시지·유저 **필요 필드만 select** |
| 대시보드 UI | 공지·매출·출근 카드 **dynamic import**로 초기 JS 분할 |
| DB | `Chat.updatedAt`, `Notification (userId, createdAt)` 인덱스 |

## 4. Supabase / 연결

- **Pooling**: `DATABASE_URL`에 Supabase **Pooler(6543)** 사용 권장(앱 쿼리). `DIRECT_URL`은 마이그레이션용 5432.
- **인덱스**: 자주 쓰는 필터·정렬 컬럼에 복합 인덱스 추가(위 마이그레이션).

## 5. 번들·이미지·캐시 (최근 반영)

- **번들**: `@next/bundle-analyzer` 설치, `npm run analyze` → `.next/analyze/client.html`. 요약은 **`docs/PERFORMANCE-BUNDLE.md`**.
- **`next/image`**: 주요 `<img>`를 `next/image`로 교체, Vercel Blob용 `images.remotePatterns`(`*.public.blob.vercel-storage.com`) 설정. 동적/외부 URL은 `unoptimized`로 안전 처리.
- **직원 목록 캐시**: 직원 생성·수정·삭제·일괄 가입·프로필 수정 등에서 `revalidateTag("users-list", "max")` 호출.

## 6. 추가 권장 (선택)

- `/tasks`·`/chat`: 서버 컴포넌트로 분리 가능한 영역 점진적 분리.
- BlockNote·React Flow 등 대형 라이브러리는 **필요한 라우트/탭에서만** dynamic import 유지.
