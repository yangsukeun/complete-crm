# COMPLETE CRM 윈도우 프로그램

배포된 웹 CRM(https://complete-crm-liard.vercel.app)을 Electron 창으로 감싼 데스크톱 앱입니다.
서버와 DB는 웹과 같으므로 데이터는 그대로 공유됩니다. 웹 빌드/Vercel 배포와는 분리되어 있습니다
(`tsconfig.json`, `eslint.config.mjs`, `.vercelignore` 에서 `desktop/` 제외).

## 기능 (1단계)

| 기능 | 내용 |
|------|------|
| 전용 창 | 로그인 유지, 창 위치·크기 기억, 중복 실행 방지, CRM 밖 링크는 기본 브라우저로 열기 |
| 오프라인 화면 | 서버에 연결하지 못하면 안내 화면을 띄우고 다시 연결되면 자동으로 접속 |
| 트레이 | X 버튼을 누르면 트레이로 숨기기, 읽지 않은 알림 수 표시, 각종 설정 메뉴 |
| 윈도우 알림 | 1분마다 `/api/notifications` 를 조회해 새 알림을 윈도우 알림으로 표시하고, 클릭하면 해당 화면으로 이동 |
| 다운로드 | 저장 위치 묻기와 자동 저장 중 선택, 작업 표시줄 진행률 표시, 완료 알림을 클릭하면 파일 열기 |
| 자동 실행 | 트레이 → 설정 → 윈도우 시작 시 자동 실행(트레이로만 시작) |
| 자동 업데이트 | GitHub Releases의 새 버전을 4시간마다 확인해 백그라운드로 받고, 재시작할지 묻기 |
| 단축키 | F5/Ctrl+R 새로고침, Ctrl+ +/-/0 확대·축소, Alt+←/→ 뒤로·앞으로, F12 개발자 도구 |

웹 코드에서는 `window.crmDesktop?.isDesktop` 으로 앱 안에서 실행 중인지 알 수 있습니다(2단계 연동에서 사용).

## 개발

```bash
cd desktop
npm install
npm start        # 배포된 CRM에 접속
npm run dev      # http://localhost:3000 (웹 개발 서버) 에 접속
```

접속 주소는 환경변수 `CRM_URL` 이나 `%APPDATA%\complete-crm-desktop\settings.json` 의 `crmUrl` 로 바꿀 수 있습니다.

## 설치 파일 만들기

```bash
cd desktop
npm run dist     # dist/COMPLETE-CRM-Setup-<버전>.exe 생성
```

## 새 버전 배포 (자동 업데이트)

1. `desktop/package.json` 의 `version` 을 올립니다(예: 0.1.0 → 0.1.1).
2. GitHub 토큰을 설정하고 릴리스를 올립니다.
   ```bash
   set GH_TOKEN=<repo 권한 토큰>
   npm run release
   ```
   `yangsukeun/complete-crm` 에 릴리스가 만들어지고 `.exe`, `.blockmap`, `latest.yml` 이 첨부됩니다.
   전 직원 PC의 앱이 다음 확인 주기(최대 4시간, 또는 재시작 시)에 업데이트를 받습니다.

> 이 저장소의 GitHub Releases는 데스크톱 앱 배포용으로 씁니다. 다른 용도의 릴리스를 "latest"로 올리면
> 자동 업데이트가 그 릴리스를 보게 되니 주의하세요.

## 알아둘 점

- **코드 서명 인증서가 없어** 처음 설치할 때 Windows SmartScreen에서 "Windows의 PC 보호" 경고가 뜹니다.
  "추가 정보 → 실행"을 누르면 설치됩니다. 경고를 없애려면 코드 서명 인증서(OV/EV)를 사서 적용해야 합니다.
- 웹 푸시(OneSignal)는 Electron에서 동작하지 않아 위의 조회 방식으로 알림을 대신합니다.
  알림은 앱이 실행 중일 때(트레이 포함)만 옵니다.
