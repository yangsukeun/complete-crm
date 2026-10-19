-- 프로젝트 글(본문) 새로 작성·업데이트 알림
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'TASK_BODY_UPDATED';
