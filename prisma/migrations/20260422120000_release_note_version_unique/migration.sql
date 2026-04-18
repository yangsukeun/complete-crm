-- 릴리즈 노트 버전별 upsert(시드)용
CREATE UNIQUE INDEX IF NOT EXISTS "ReleaseNote_version_key" ON "ReleaseNote"("version");
