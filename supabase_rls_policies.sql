-- Run this in Supabase SQL Editor after deploying the version with /api/admin-db.js.
-- Required Vercel env vars:
-- ADMIN_PASSWORD, ADMIN_SESSION_SECRET, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL

alter table if exists games enable row level security;
alter table if exists questions enable row level security;
alter table if exists players enable row level security;
alter table if exists answers enable row level security;
alter table if exists votes enable row level security;
alter table if exists points enable row level security;
alter table if exists question_sets enable row level security;

drop policy if exists "public can read games" on games;
drop policy if exists "public can read questions" on questions;
drop policy if exists "public can read players" on players;
drop policy if exists "public can join games" on players;
drop policy if exists "public can update player profile" on players;
drop policy if exists "public can read answers" on answers;
drop policy if exists "public can submit answers" on answers;
drop policy if exists "public can update own round answer" on answers;
drop policy if exists "public can read votes" on votes;
drop policy if exists "public can submit votes" on votes;
drop policy if exists "public can update own round vote" on votes;
drop policy if exists "public can read points" on points;
drop policy if exists "public can read question sets" on question_sets;

-- Public read is needed by player and viewer screens.
-- Admin writes are no longer public: they go through Vercel API with SUPABASE_SERVICE_ROLE_KEY.
create policy "public can read games"
on games for select
to anon, authenticated
using (true);

create policy "public can read questions"
on questions for select
to anon, authenticated
using (true);

create policy "public can read players"
on players for select
to anon, authenticated
using (true);

create policy "public can join games"
on players for insert
to anon, authenticated
with check (
  coalesce(players.score,0) = 0
  and
  exists (
    select 1 from games
    where games.id = players.game_id
      and coalesce(games.status,'active') <> 'finished'
  )
);

create policy "public can read answers"
on answers for select
to anon, authenticated
using (true);

create policy "public can submit answers"
on answers for insert
to anon, authenticated
with check (
  exists (
    select 1
    from games
    join questions on questions.game_id = games.id
    where games.id = answers.game_id
      and questions.id = answers.question_id
      and games.phase = 'answering'
      and (games.answer_deadline is null or games.answer_deadline::bigint >= extract(epoch from now())::bigint)
  )
);

create policy "public can update own round answer"
on answers for update
to anon, authenticated
using (true)
with check (
  exists (
    select 1
    from games
    join questions on questions.game_id = games.id
    where games.id = answers.game_id
      and questions.id = answers.question_id
      and games.phase = 'answering'
      and (games.answer_deadline is null or games.answer_deadline::bigint >= extract(epoch from now())::bigint)
  )
);

create policy "public can read votes"
on votes for select
to anon, authenticated
using (true);

create policy "public can submit votes"
on votes for insert
to anon, authenticated
with check (
  exists (
    select 1
    from games
    join questions on questions.game_id = games.id
    where games.id = votes.game_id
      and questions.id = votes.question_id
      and games.phase = 'voting'
      and (games.vote_deadline is null or games.vote_deadline::bigint >= extract(epoch from now())::bigint)
  )
);

create policy "public can update own round vote"
on votes for update
to anon, authenticated
using (true)
with check (
  exists (
    select 1
    from games
    join questions on questions.game_id = games.id
    where games.id = votes.game_id
      and questions.id = votes.question_id
      and games.phase = 'voting'
      and (games.vote_deadline is null or games.vote_deadline::bigint >= extract(epoch from now())::bigint)
  )
);

create policy "public can read points"
on points for select
to anon, authenticated
using (true);

create policy "public can read question sets"
on question_sets for select
to anon, authenticated
using (true);
