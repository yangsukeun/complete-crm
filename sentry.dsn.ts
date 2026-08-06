/**
 * Sentry DSN — 클라이언트 공개값. env가 있으면 우선, 없으면 하드코딩 기본값.
 */
export const SENTRY_DSN =
  process.env.NEXT_PUBLIC_SENTRY_DSN ??
  "https://edd7d5bbb00abe328d738ec015292400@o4511861839495168.ingest.de.sentry.io/4511861845196880";
