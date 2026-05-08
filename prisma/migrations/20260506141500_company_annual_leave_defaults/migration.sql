-- AlterTable — 회사별 연차·월차 간이 상한 (미입력 시 앱 근기법·2026 권장 기본값 적용)
ALTER TABLE "CompanyInfo" ADD COLUMN "annualLeaveMonthlyMaxUnderOneYear" INTEGER;
ALTER TABLE "CompanyInfo" ADD COLUMN "annualLeaveDaysAfterFirstFullYear" INTEGER;
