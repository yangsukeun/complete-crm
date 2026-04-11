-- OneSignal 다기기: 등록된 모든 구독 ID를 보관
ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "playerIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- 기존 단일 필드가 있으면 배열에 한 번 넣어 둠 (중복은 앱 저장 로직에서 정리)
UPDATE "User" u
SET "playerIds" = ARRAY[TRIM(u."playerId")]
WHERE COALESCE(cardinality(u."playerIds"), 0) = 0
  AND u."playerId" IS NOT NULL
  AND TRIM(u."playerId") <> ''
  AND LENGTH(TRIM(u."playerId")) > 8;

UPDATE "User" u
SET "playerIds" = COALESCE(u."playerIds", ARRAY[]::TEXT[]) || ARRAY[TRIM(u."oneSignalPlayerId")]
WHERE u."oneSignalPlayerId" IS NOT NULL
  AND TRIM(u."oneSignalPlayerId") <> ''
  AND LENGTH(TRIM(u."oneSignalPlayerId")) > 8
  AND NOT (TRIM(u."oneSignalPlayerId") = ANY (COALESCE(u."playerIds", ARRAY[]::TEXT[])));
