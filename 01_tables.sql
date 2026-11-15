-- =========================================================
-- 간바레간바레니혼고 · 데이터베이스 표 만들기 (한 번만 실행)
-- Supabase → SQL Editor → New query → 전체 붙여넣기 → Run
-- =========================================================

-- 수정 시각 자동 기록용 함수
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ---------------------------------------------------------
-- 1) 단어장
-- ---------------------------------------------------------
create table if not exists public.words (
  id          bigint generated always as identity primary key,
  word        text not null,                 -- 표기 (예: 覚える, かける)
  reading     text not null,                 -- 히라가나 읽기 (예: おぼえる)
  pron_ko     text,                          -- 한글 발음 (예: 오보에루)
  meaning     text not null,                 -- 한국어 뜻
  category    text not null default '기타',   -- 품사: 명사/1단 동사/5단 동사/불규칙 동사/い형용사/な형용사/부사/조사/관용표현/기타
  lesson      text,                          -- 교재 과 (예: 3과)
  study_date  date,                          -- 수업 날짜
  memo        text,                          -- 예문·메모
  created_by  text,
  updated_by  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- 단어 표시: 안 외워지는 단어(hard), 틀린 단어(wrong) — 사람(닉네임)별로 따로
create table if not exists public.word_marks (
  id          bigint generated always as identity primary key,
  word_id     bigint not null references public.words(id) on delete cascade,
  nickname    text not null,
  kind        text not null check (kind in ('hard','wrong')),
  created_at  timestamptz not null default now(),
  unique (word_id, nickname, kind)
);

-- ---------------------------------------------------------
-- 2) 문형장
-- ---------------------------------------------------------
create table if not exists public.patterns (
  id           bigint generated always as identity primary key,
  form         text not null,                -- 문형 (예: ～ます)
  pron_ko      text,                         -- 한글 발음 (예: ~마스)
  meaning      text not null,                -- 뜻 (예: ~합니다/~할 겁니다)
  style        text not null check (style in ('반말','존댓말')),
  applies_to   text,                         -- 적용 품사 (예: 1단 동사)
  how_to       text,                         -- 만드는 법
  example_jp   text,                         -- 예문 (일본어)
  example_pron text,                         -- 예문 한글 발음
  example_ko   text,                         -- 예문 뜻
  notes        text,                         -- 헷갈리는 점·비슷한 문형
  lesson       text,
  study_date   date,
  created_by   text,
  updated_by   text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- ---------------------------------------------------------
-- 3) 오답노트 (퀴즈의 '오답 정리 텍스트'를 붙여넣으면 저장)
-- ---------------------------------------------------------
create table if not exists public.wrong_notes (
  id              bigint generated always as identity primary key,
  quiz_id         text,
  quiz_title      text,
  quiz_date       date,
  q_no            int,
  pattern         text,
  qtype           text,
  question        text,
  lines           jsonb not null default '[]'::jsonb,  -- 대화문 [{sp, jp, pron, ko}]
  my_answer       text,
  correct_answer  text,
  explanation     text,
  memo            text,                       -- 내 메모
  resolved        boolean not null default false,  -- 다 이해함
  flagged         boolean not null default false,  -- 문제 오류 의심
  created_by      text,
  updated_by      text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (quiz_id, q_no, created_by)           -- 같은 텍스트를 두 번 붙여넣어도 중복 저장 안 됨
);

-- ---------------------------------------------------------
-- 4) 메모
-- ---------------------------------------------------------
create table if not exists public.memos (
  id          bigint generated always as identity primary key,
  tag         text not null default '공유',  -- 질문/헷갈림/공유
  body        text not null,
  pinned      boolean not null default false,
  created_by  text,
  updated_by  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- 수정 시각 자동 기록
drop trigger if exists t_words on public.words;
create trigger t_words before update on public.words for each row execute function public.touch_updated_at();
drop trigger if exists t_patterns on public.patterns;
create trigger t_patterns before update on public.patterns for each row execute function public.touch_updated_at();
drop trigger if exists t_wrong on public.wrong_notes;
create trigger t_wrong before update on public.wrong_notes for each row execute function public.touch_updated_at();
drop trigger if exists t_memos on public.memos;
create trigger t_memos before update on public.memos for each row execute function public.touch_updated_at();

-- 자주 쓰는 검색용 색인
create index if not exists words_date_idx on public.words (study_date);
create index if not exists words_cat_idx on public.words (category);
create index if not exists patterns_style_idx on public.patterns (style);
create index if not exists marks_nick_idx on public.word_marks (nickname, kind);

-- ---------------------------------------------------------
-- 보안: 로그인한 사용자(스터디 공용 계정)만 읽고 쓸 수 있게
-- (로그인하지 않은 사람은 아무것도 볼 수 없음)
-- ---------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['words','word_marks','patterns','wrong_notes','memos'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "study members" on public.%I', t);
    execute format('create policy "study members" on public.%I for all to authenticated using (true) with check (true)', t);
  end loop;
end $$;

-- 로그인한 사용자에게 표 사용 권한 부여 (이미 있어도 문제없음)
grant usage on schema public to authenticated;
grant select, insert, update, delete on public.words, public.word_marks, public.patterns, public.wrong_notes, public.memos to authenticated;
grant usage, select on all sequences in schema public to authenticated;
