-- 자금 이체 요청·승인·완료·반려 알림
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'PAYMENT_REQUEST';
