# 상세 페이지 로딩·정적 생성

## `generateStaticParams`

- `/tasks/[id]`, `/quotations/[id]`, `/chat/[id]`, `/board/[id]` 등은 **로그인·권한·워크스페이스 쿠키**에 따라 내용이 달라집니다.
- **빌드 시 ID 목록을 알 수 없으므로** `generateStaticParams`로 SSG 하지 않습니다.
- 견적 상세 등은 `export const dynamic = "force-dynamic"`으로 명시할 수 있습니다.

## 체감 속도

- 목록에서 `next/link`의 **`prefetch={true}`** (기본값과 동일하게 명시 가능)로 라우트 JS 선로드.
- `loading.tsx` + **Skeleton UI**로 빈 화면 시간을 줄입니다.
- API는 **병렬 쿼리(`Promise.all`)** 및 **`select`로 필요한 필드만** 조회합니다.
