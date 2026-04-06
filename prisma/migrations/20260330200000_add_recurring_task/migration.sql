-- AlterTable
ALTER TABLE "Task" ADD COLUMN "isRecurring" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Task" ADD COLUMN "recurringDays" TEXT;
ALTER TABLE "Task" ADD COLUMN "recurringMemo" TEXT;
