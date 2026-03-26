-- Supabase SQL Editor에서 실행 (Realtime + RLS). Prisma 테이블명과 동일해야 합니다.
-- 이미 publication에 테이블이 있으면 해당 alter publication 줄은 생략하거나 오류 무시.

alter publication supabase_realtime add table "ChatMessage";
alter publication supabase_realtime add table "Notification";

grant usage on schema public to authenticated;
grant select on public."ChatMessage" to authenticated;
grant select on public."ChatParticipant" to authenticated;
grant select on public."Notification" to authenticated;

alter table "ChatMessage" enable row level security;
alter table "ChatParticipant" enable row level security;
alter table "Notification" enable row level security;

drop policy if exists "chatparticipant_select_own" on "ChatParticipant";
create policy "chatparticipant_select_own" on "ChatParticipant"
  for select to authenticated
  using ("userId" = (select auth.jwt()->>'sub'));

drop policy if exists "chatmessage_select_participant" on "ChatMessage";
create policy "chatmessage_select_participant" on "ChatMessage"
  for select to authenticated
  using (
    exists (
      select 1 from "ChatParticipant" cp
      where cp."chatId" = "ChatMessage"."chatId"
        and cp."userId" = (select auth.jwt()->>'sub')
    )
  );

drop policy if exists "notification_select_own" on "Notification";
create policy "notification_select_own" on "Notification"
  for select to authenticated
  using ("userId" = (select auth.jwt()->>'sub'));
