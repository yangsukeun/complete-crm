import * as Sentry from "@sentry/nextjs";
import { SENTRY_DSN } from "./sentry.dsn";

Sentry.init({
  dsn: SENTRY_DSN,
  enabled: process.env.NODE_ENV === "production",
  tracesSampleRate: 0, // 무료 쿼터 보호: 에러만 수집
  environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
});
