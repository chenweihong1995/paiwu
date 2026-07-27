create table if not exists public.recommendation_history (
  id text primary key,
  lottery text not null,
  source_issue text not null,
  source_date date,
  created_at timestamptz not null default now(),
  payload jsonb not null
);

create index if not exists recommendation_history_lottery_issue_idx
  on public.recommendation_history (lottery, source_issue);

alter table public.recommendation_history enable row level security;
