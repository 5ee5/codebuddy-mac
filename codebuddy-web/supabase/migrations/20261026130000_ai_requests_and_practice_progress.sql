-- CodeBuddy: Learn and Debug history with a per-user daily limit, and Practice progress.
--
-- Run once in Supabase (Dashboard → SQL Editor → paste → Run), or with `supabase db push`.
-- Students can call the Supabase API directly with their own session, so every rule
-- below must hold even when CodeBuddy's server isn't the one asking.

-- ───────────────────────── Learn and Debug requests ─────────────────────────
-- One row per AI request. The row is created before Claude is called and counts
-- towards the daily limit; the question and answer are filled in afterwards.
-- "Deleting" an entry from history only clears its content, so the limit can't
-- be reset by deleting history.

create table public.ai_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  mode text not null check (mode in ('learn', 'debug')),
  created_at timestamptz not null default now(),
  request jsonb check (octet_length(request::text) <= 131072),
  response jsonb check (octet_length(response::text) <= 262144),
  model text check (char_length(model) <= 100),
  answered_at timestamptz
);

create index ai_requests_user_id_created_at on public.ai_requests (user_id, created_at desc);

alter table public.ai_requests enable row level security;

-- Students may only read their own rows; every change goes through the functions below.
revoke all on table public.ai_requests from anon, authenticated;
grant select on table public.ai_requests to authenticated;

create policy "Students read their own AI requests"
  on public.ai_requests for select to authenticated
  using ((select auth.uid()) = user_id);

-- Reserves one request for the signed-in user, unless they have used today's
-- allowance. Returns the new request's id and how many are left, or, when the
-- limit is reached, a null id and when the next request will be allowed.
-- The limit is fixed here, not passed in, so a student can't raise it.
create function public.claim_ai_request(p_mode text)
returns table (request_id uuid, remaining integer, retry_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  daily_limit constant integer := 20;
  uid uuid := auth.uid();
  used integer;
  oldest timestamptz;
begin
  if uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if p_mode is null or p_mode not in ('learn', 'debug') then
    raise exception 'unknown mode' using errcode = '22023';
  end if;

  -- One claim at a time per user, so two parallel requests can't both slip under the limit.
  perform pg_advisory_xact_lock(hashtextextended(uid::text, 0));

  select count(*), min(created_at) into used, oldest
    from public.ai_requests
   where user_id = uid and created_at > now() - interval '24 hours';

  if used >= daily_limit then
    return query select null::uuid, 0, oldest + interval '24 hours';
    return;
  end if;

  return query
    insert into public.ai_requests (user_id, mode)
    values (uid, p_mode)
    returning id, daily_limit - used - 1, null::timestamptz;
end;
$$;

-- Saves the question and answer of a request claimed in the last hour. Each
-- request can be filled in once.
create function public.record_ai_answer(
  p_request_id uuid,
  p_request jsonb,
  p_response jsonb,
  p_model text
)
returns boolean
language sql
security definer
set search_path = ''
as $$
  with saved as (
    update public.ai_requests
       set request = p_request,
           response = p_response,
           model = p_model,
           answered_at = now()
     where id = p_request_id
       and user_id = auth.uid()
       and answered_at is null
       and created_at > now() - interval '1 hour'
    returning 1
  )
  select exists (select 1 from saved);
$$;

-- Clears one history entry, or all of the user's entries when no id is given.
-- Returns how many entries were cleared.
create function public.clear_ai_history(p_request_id uuid default null)
returns integer
language sql
security definer
set search_path = ''
as $$
  with cleared as (
    update public.ai_requests
       set request = null,
           response = null,
           model = null
     where user_id = auth.uid()
       and request is not null
       and (p_request_id is null or id = p_request_id)
    returning 1
  )
  select count(*)::integer from cleared;
$$;

revoke execute on function public.claim_ai_request(text) from public, anon;
revoke execute on function public.record_ai_answer(uuid, jsonb, jsonb, text) from public, anon;
revoke execute on function public.clear_ai_history(uuid) from public, anon;
grant execute on function public.claim_ai_request(text) to authenticated;
grant execute on function public.record_ai_answer(uuid, jsonb, jsonb, text) to authenticated;
grant execute on function public.clear_ai_history(uuid) to authenticated;

-- ───────────────────────────── Practice progress ────────────────────────────
-- One row per student and exercise. The exercises themselves live in
-- src/lib/exercises.ts; keep the list below in sync (a test checks it).

create table public.practice_progress (
  user_id uuid not null references auth.users (id) on delete cascade,
  exercise_id text not null
    check (exercise_id in ('greet-user', 'sum-list', 'fizzbuzz', 'count-vowels')),
  draft text not null default '' check (char_length(draft) <= 10000),
  hints_used smallint not null default 0 check (hints_used between 0 and 10),
  last_verdict text check (last_verdict in ('correct', 'partial', 'incorrect', 'unverified')),
  solved_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, exercise_id)
);

alter table public.practice_progress enable row level security;

revoke all on table public.practice_progress from anon, authenticated;
grant select, insert, update on table public.practice_progress to authenticated;

create policy "Students read their own progress"
  on public.practice_progress for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "Students add their own progress"
  on public.practice_progress for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Students update their own progress"
  on public.practice_progress for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Hints opened can only go up, and an exercise stays solved once it has been
-- solved. `solved_at` is always set here, never taken from the client.
create function public.practice_progress_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  if tg_op = 'UPDATE' then
    new.hints_used := greatest(old.hints_used, new.hints_used);
    new.solved_at := coalesce(
      old.solved_at,
      case when new.last_verdict = 'correct' then now() end
    );
  else
    new.solved_at := case when new.last_verdict = 'correct' then now() end;
  end if;
  return new;
end;
$$;

create trigger practice_progress_before_write
  before insert or update on public.practice_progress
  for each row execute function public.practice_progress_before_write();
