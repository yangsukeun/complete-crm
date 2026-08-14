-- AwayType에 AWAY 추가. BATHROOM/SMOKING 값은 기존 행을 위해 유지한다.
DO $$ BEGIN
  ALTER TYPE "AwayType" ADD VALUE 'AWAY';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
