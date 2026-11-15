-- =========================================================
-- 간바레간바레니혼고 · 4단계 보완
-- 문형 구분에 '공통'(조사·전치사처럼 반말/존댓말 구분이 없는 것) 추가
-- Supabase → SQL Editor → New query → 붙여넣기 → Run
-- =========================================================
alter table public.patterns drop constraint if exists patterns_style_check;
alter table public.patterns add constraint patterns_style_check check (style in ('반말','존댓말','공통'));
