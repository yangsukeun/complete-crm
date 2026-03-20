# TaskMention / 멘션 알림 DB 반영

프로젝트 `schema.prisma`에는 **`DIRECT_URL`(5432)** 이 설정돼 있어 `npx prisma migrate deploy` / `db push`는 **풀러가 아닌 직접 연결**로 실행된다. `.env`에 `DIRECT_URL`을 넣은 뒤 `npm run db:migrate` 순서는 **`prisma/내가_할_일_순서.md`** 참고.

`migrate deploy`가 실패하거나 Supabase 풀러(6543) 때문에 막힐 때 아래 중 하나를 쓰면 됩니다.

## 1) 스키마만 맞추기 (로컬·스테이징에 가장 단순)

`.env`의 `DATABASE_URL`을 **직접 DB 연결**(Supabase는 Settings → Database → URI, 포트 **5432**, sslmode=require)으로 바꾼 뒤:

```bash
npx prisma db push
```

> 프로덕션에서는 마이그레이션 히스토리를 쓰는 편이 좋습니다. `db push`는 `_prisma_migrations`를 갱신하지 않습니다.

## 2) Supabase SQL Editor에서 수동 실행

`DATABASE_URL`을 바꿀 수 없으면 **대시보드 → SQL Editor**에 아래를 한 번 실행합니다.  
(이미 `TaskMention`이 있으면 `CREATE TABLE`/`CREATE INDEX`는 에러 나므로, 해당 줄만 건너뛰면 됩니다.)

```sql
-- NotificationType enum 값 (이미 있으면 통째로 스킵 가능)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'NotificationType' AND e.enumlabel = 'TASK_BODY_MENTION'
  ) THEN
    ALTER TYPE "NotificationType" ADD VALUE 'TASK_BODY_MENTION';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "TaskMention" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TaskMention_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "TaskMention_taskId_userId_key" ON "TaskMention"("taskId", "userId");
CREATE INDEX IF NOT EXISTS "TaskMention_userId_idx" ON "TaskMention"("userId");
CREATE INDEX IF NOT EXISTS "TaskMention_taskId_idx" ON "TaskMention"("taskId");

ALTER TABLE "TaskMention" DROP CONSTRAINT IF EXISTS "TaskMention_taskId_fkey";
ALTER TABLE "TaskMention" ADD CONSTRAINT "TaskMention_taskId_fkey"
  FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TaskMention" DROP CONSTRAINT IF EXISTS "TaskMention_userId_fkey";
ALTER TABLE "TaskMention" ADD CONSTRAINT "TaskMention_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

실행 후 **개발 서버를 한 번 재시작**하면 TaskMention 동기화 캐시가 초기화됩니다.

## 3) `migrate deploy`가 깨진 경우

터미널에 나온 **전체 에러 메시지**를 보고:

- **P3009** 등 “마이그레이션 실패로 멈춤” → [Prisma migrate resolve](https://www.prisma.io/docs/guides/migrate/troubleshooting-development) 로 실패/적용완료 표시 정리
- **연결 타임아웃** → `DATABASE_URL`을 풀러가 아닌 **직접 연결**로 바꿔 다시 `npx prisma migrate deploy`
