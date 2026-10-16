# ChatGPT(데스크톱 앱)에 CRM 연결하기

CRM에 MCP 서버가 있다. ChatGPT에 "커스텀 MCP 서버"로 등록하면 ChatGPT가 직원 본인 계정 권한으로 CRM 도구를 쓴다.

- MCP 서버 주소: `https://complete-crm-liard.vercel.app/api/mcp`
- 인증: OAuth. 연결할 때 CRM 로그인 화면이 뜨고, 직원이 직접 로그인한 뒤 "허용"을 누른다.
- 권한: CRM 화면과 똑같다. 관리자가 아니면 자기가 작성자·담당자·단계 담당자인 프로젝트만 보인다.

## 쓸 수 있는 도구

| 도구 | 하는 일 | 종류 |
| --- | --- | --- |
| `get_my_stages` | 내 담당 단계(진행 중·대기·완료) | 읽기 |
| `get_stage_overview` | 프로젝트별 단계 진행 현황(이름으로 거르기 가능) | 읽기 |
| `get_project_stages` | 프로젝트 하나의 단계 상세 | 읽기 |
| `get_stage_progress_logs` | 단계별 진행 메모 기록 | 읽기 |
| `list_my_notifications` | 내 알림(읽음 처리는 안 함) | 읽기 |
| `whoami` | 연결된 계정 확인 | 읽기 |
| `save_my_stage_progress` | 내 단계에 진행 메모·진행률 저장 | 쓰기 |
| `set_my_stage_completed` | 내 단계 완료 / 완료 취소 | 쓰기 |

ChatGPT는 쓰기 도구를 실행하기 전에 매번 확인을 받는다. 읽기 도구는 바로 실행된다.

## 필요한 것

- ChatGPT 요금제: 커스텀 MCP 서버 추가는 요금제와 워크스페이스 설정에 따라 열려 있다.
  2026년 10월 기준 공식 안내로는 Business·Enterprise·Edu에서 쓸 수 있다. Business·Enterprise 워크스페이스는 관리자가 허용해야 할 수 있다.
  Plus·Pro에서 메뉴가 보이지 않으면 요금제 때문이다.
- 처음 한 번은 웹(chatgpt.com)에서 등록하는 것이 가장 확실하다. 등록한 연결은 같은 계정의 Windows 데스크톱 앱에서도 쓴다.

## 연결 순서

ChatGPT 화면은 자주 바뀐다. 아래는 2026년 10월 공식 문서 기준이다.

1. 브라우저에서 chatgpt.com에 로그인한다.
2. 플러그인 화면을 연다: 왼쪽 메뉴 **플러그인(Plugins)**, 또는 주소창에 `chatgpt.com/plugins`.
   - 예전 화면이라면 **설정 → 앱 및 커넥터(Apps & Connectors) → 고급 → 개발자 모드 켜기 → 만들기(Create)** 순서다.
3. **+** 버튼 → **커스텀 MCP 서버 추가(Add custom MCP server)** 를 누른다.
4. 다음을 넣는다.
   - 이름: `회사 CRM`
   - 설명: `프로젝트 단계·내 담당 단계·알림 조회와 단계 진행 저장`
   - 연결(Connection): **Server URL** 선택 → `https://complete-crm-liard.vercel.app/api/mcp`
   - 인증(Authentication): **OAuth**
5. 위험 안내에 동의("I understand and want to continue")하고 **플러그인으로 만들기(Create as a plugin)** 를 누른다.
6. 만든 플러그인을 **설치(Install)/연결(Connect)** 한다. 새 창에 CRM 로그인 화면이 뜬다.
   - 로그인한 뒤 "회사 CRM을 연결할까요?" 화면에서 **허용**을 누른다.
   - ChatGPT로 돌아오면 연결이 끝난다. 플러그인 상세 화면에 도구 8개가 보인다.
7. Windows ChatGPT 데스크톱 앱을 연다(이미 열려 있으면 다시 시작). 새 대화에서 `@`를 입력하고 **회사 CRM** 을 고른다.
   - 상단에 Chat/Work 전환이 있으면 **Work**에서 플러그인이 보인다.
8. 이렇게 물어본다: "내 담당 단계 보여 줘", "○○ 프로젝트 지금 몇 단계야?", "2단계에 오늘 시안 1차 완료, 진행률 60%로 저장해 줘".

## 문제 해결

- 데스크톱 앱에서만 도구가 안 보일 때: 웹에서는 되는데 Windows 앱에서만 안 되면 백신(예: Norton)의 HTTPS 검사가 막는 경우가 있다. 백신에서 ChatGPT를 예외로 둔다.
- 도구를 새로 추가했는데 안 보일 때: 플러그인 상세 화면의 **새로 고침(Refresh)** 을 누른다.
- 다시 로그인해야 할 때: 토큰은 1시간마다 자동 갱신되고 30일 동안 쓰지 않으면 만료된다. 만료되면 플러그인에서 다시 연결한다.
- 연결 끊기: ChatGPT에서 플러그인 연결을 끊는다. CRM 비밀번호를 바꾸면 그 직원의 모든 AI 앱 연결이 즉시 끊긴다. 퇴사(계정 비활성) 처리하면 바로 막힌다.

## 내 PC 파일

ChatGPT 웹 연결(원격 MCP)은 내 PC에 직접 들어올 수 없다. 로컬 MCP(stdio)는 OpenAI 승인 파트너만 배포할 수 있어서 직접 붙일 수 없다. 안전한 방법은 아래 순서로 권한다.

1. **Google Drive 연결(권장)**: 이 PC는 Google Drive for desktop(G:)으로 동기화된다. ChatGPT의 기본 Google Drive 플러그인을 연결하면 G:에 넣은 파일을 ChatGPT가 읽는다. 구글 로그인과 권한 동의로 관리되고, 공개 인터넷 포트를 열지 않는다.
2. **파일 첨부**: 한두 개 파일은 대화창에 끌어다 놓는다.
3. **ChatGPT Work(Windows)의 로컬 파일 기능**: 요금제·워크스페이스가 허용하면 ChatGPT 데스크톱의 Work 모드가 허락받은 폴더의 파일을 다룰 수 있다. 앱 안의 권한 요청에서 폴더를 좁게 지정한다.

ngrok 같은 터널로 PC 폴더를 인터넷에 여는 방식은 권하지 않는다. 주소가 새면 PC 파일이 그대로 노출된다.

## 개발 메모

- 코드: `src/lib/mcp/oauth.ts`(OAuth·토큰), `src/lib/mcp/tools.ts`(도구), `src/lib/mcp/server.ts`(JSON-RPC), `app/api/mcp`, `app/api/mcp-oauth/*`, `app/.well-known/oauth-*`
- DB 테이블 없이 서명된 JWT로 동작한다. 서명 키는 `AUTH_SECRET`에서 만든다. `AUTH_SECRET`을 바꾸면 모든 연결이 끊긴다.
- 리다이렉트는 chatgpt.com·openai.com·claude.ai·claude.com 도메인만 허용한다. 다른 앱을 붙이려면 Vercel 환경변수 `MCP_OAUTH_REDIRECT_HOSTS`(쉼표 구분)에 도메인을 추가한다.
- 도구를 추가할 때는 `tools.ts`에서 기존 권한 함수(예: `task-stages.ts`)를 거치게 하고, 읽기 도구는 `readOnly: true`로 둔다.
