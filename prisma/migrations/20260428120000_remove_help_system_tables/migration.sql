-- Remove legacy help / tour / release note tables (no longer in Prisma schema).
DROP TABLE IF EXISTS "UserTourProgress" CASCADE;
DROP TABLE IF EXISTS "HelpTourStep" CASCADE;
DROP TABLE IF EXISTS "HelpArticle" CASCADE;
DROP TABLE IF EXISTS "ReleaseNote" CASCADE;
