-- 프로젝트(Task) 마감일 미설정 허용
ALTER TABLE "Task" ALTER COLUMN "dueDate" DROP NOT NULL;
