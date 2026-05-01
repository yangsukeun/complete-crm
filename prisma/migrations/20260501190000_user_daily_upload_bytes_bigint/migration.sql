-- 일일 누적 한도 5GB 대비: bytes 컬럼을 BIGINT로 확장
ALTER TABLE "UserDailyUploadUsage" ALTER COLUMN "bytes" TYPE BIGINT USING ("bytes"::bigint);
