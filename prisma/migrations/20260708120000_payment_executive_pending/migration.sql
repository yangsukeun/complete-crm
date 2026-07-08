-- 결제 요청: 팀장 1차 승인 후 대표 2차 승인 대기 상태
ALTER TYPE "PaymentRequestStatus" ADD VALUE IF NOT EXISTS 'EXECUTIVE_PENDING';
