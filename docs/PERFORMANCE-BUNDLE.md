# 번들 분석 (`@next/bundle-analyzer`)

## 실행 방법

```bash
npm run analyze
```

- Webpack 기반 프로덕션 빌드 + `ANALYZE=true`로 동작합니다.
- 완료 후 브라우저에서 다음 파일을 열면 시각화 리포트를 볼 수 있습니다.
  - **클라이언트**: `.next/analyze/client.html`
  - **Node / Edge**: `.next/analyze/nodejs.html`, `.next/analyze/edge.html`

> 일반 `npm run build`는 Turbopack을 사용합니다. 번들 크기 상세는 위 `analyze` 스크립트를 사용하세요.

## `/tasks`, `/chat` 기준으로 보이는 무거운 의존성 (webpack 빌드 기준)

분석 리포트의 **클라이언트** 트리에서 가장 큰 공유 자산 중 하나는 대략 다음과 같은 청크입니다.

| 항목 | 대략적 크기 (한 청크 예시) |
|------|---------------------------|
| gzip | ~289 KB |
| parsed | ~950 KB |
| stat (원본 합) | ~2.8 MB |

이 청크의 `node_modules` 트리에서 비중이 큰 패키지:

1. **`@blocknote/*`** — `@blocknote/core`, `@blocknote/react`, `@blocknote/mantine`, `@blocknote/xl-multi-column` 등. 업무/문서 에디터(`task-body-editor`, `content-body-editor` 등)에서 사용.
2. **`@xyflow/react`** — `/tasks` 마인드맵 탭(`view-tree`)에서 사용.
3. 그 외 **`@mantine/*`**, **`date-fns`**, **`lucide-react`**(일부는 `optimizePackageImports`로 트리쉐이킹), Radix/shadcn UI 등이 함께 포함됩니다.

`/chat`은 `chat-page-client.tsx` 중심의 큰 클라이언트 번들을 쓰며, 앱 공유 청크와 합쳐져 로드됩니다. 정확한 페이지별 분할은 `client.html`에서 해당 라우트 청크를 클릭해 확인하는 것이 가장 정확합니다.

## 개선 아이디어 (참고)

- BlockNote가 필요 없는 화면에서는 **dynamic import + `ssr: false`**로 이미 분리된 패턴을 유지·확대.
- 마인드맵(`@xyflow`)은 탭 진입 시에만 로드하는 현재 방식과 동일하게, **초기 로드에서 제외** 유지.
- 원격 이미지는 `next.config`의 `images.remotePatterns`(Vercel Blob 등)와 `next/image` 조합으로 최적화.
