import * as Sentry from "@sentry/nextjs";
import { SENTRY_DSN } from "./sentry.dsn";

Sentry.init({
  dsn: SENTRY_DSN,
  enabled: process.env.NODE_ENV === "production",
  tracesSampleRate: 0,
  replaysSessionSampleRate: 0, // 리플레이 끔 (쿼터)
  replaysOnErrorSampleRate: 0,
  environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
