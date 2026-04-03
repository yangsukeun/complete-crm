// [PERF-2차] 초기 평가 시점에 message 리스너 등록 (크롬 Service Worker 경고 완화) — OneSignal 번들 로드 전
self.addEventListener("message", function OneSignalHostMessageBridge() {});

importScripts("https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.sw.js");
