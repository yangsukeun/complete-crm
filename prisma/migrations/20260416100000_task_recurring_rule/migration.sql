-- Task: 반복 규칙(JSONB) 컬럼 추가 (일/주/월/시간 단위 + 간격)
ALTER TABLE "Task"
ADD COLUMN IF NOT EXISTS "recurringRule" JSONB;

