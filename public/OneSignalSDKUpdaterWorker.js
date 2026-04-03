// [PERF-2차] OneSignalSDKWorker.js 와 동일 — 업데이트 워커 진입점
self.addEventListener("message", function OneSignalUpdaterHostMessageBridge() {});

importScripts("https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.sw.js");
