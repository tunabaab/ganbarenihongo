-- =========================================================
-- 간바레간바레니혼고 · 메모 댓글 표 추가 (한 번만 실행)
-- Supabase → SQL Editor → New query → 붙여넣기 → Run
-- =========================================================
create table if not exists public.memo_comments (
  id          bigint generated always as identity primary key,
  memo_id     bigint not null references public.memos(id) on delete cascade,  -- 메모를 지우면 댓글도 함께 지워짐
  body        text not null,
  created_by  text,
  updated_by  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists memo_comments_memo_idx on public.memo_comments (memo_id);

drop trigger if exists t_memo_comments on public.memo_comments;
create trigger t_memo_comments before update on public.memo_comments for each row execute function public.touch_updated_at();

-- 보안: 로그인한 사용자(스터디 공용 계정)만 읽고 쓰기
alter table public.memo_comments enable row level security;
drop policy if exists "study members" on public.memo_comments;
create policy "study members" on public.memo_comments for all to authenticated using (true) with check (true);
grant select, insert, update, delete on public.memo_comments to authenticated;
grant usage, select on all sequences in schema public to authenticated;
