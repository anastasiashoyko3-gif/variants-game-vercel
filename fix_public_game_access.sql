grant usage on schema public to anon, authenticated;

grant select on public.games to anon, authenticated;
grant select, insert, update on public.players to anon, authenticated;
grant select on public.questions to anon, authenticated;
grant select, insert, update on public.answers to anon, authenticated;
grant select, insert, update on public.votes to anon, authenticated;
grant select on public.points to anon, authenticated;
grant select, insert on public.word_events to anon, authenticated;

alter table public.games enable row level security;
alter table public.players enable row level security;
alter table public.questions enable row level security;
alter table public.answers enable row level security;
alter table public.votes enable row level security;
alter table public.points enable row level security;
alter table public.word_events enable row level security;

drop policy if exists "public can read games" on public.games;
create policy "public can read games"
on public.games
for select
to anon, authenticated
using (true);

drop policy if exists "public can read players" on public.players;
create policy "public can read players"
on public.players
for select
to anon, authenticated
using (true);

drop policy if exists "public can join games" on public.players;
create policy "public can join games"
on public.players
for insert
to anon, authenticated
with check (true);

drop policy if exists "public can update player profile" on public.players;
create policy "public can update player profile"
on public.players
for update
to anon, authenticated
using (true)
with check (true);

drop policy if exists "public can read questions" on public.questions;
create policy "public can read questions"
on public.questions
for select
to anon, authenticated
using (true);

drop policy if exists "public can read answers" on public.answers;
create policy "public can read answers"
on public.answers
for select
to anon, authenticated
using (true);

drop policy if exists "public can submit answers" on public.answers;
create policy "public can submit answers"
on public.answers
for insert
to anon, authenticated
with check (true);

drop policy if exists "public can update own round answer" on public.answers;
create policy "public can update own round answer"
on public.answers
for update
to anon, authenticated
using (true)
with check (true);

drop policy if exists "public can read votes" on public.votes;
create policy "public can read votes"
on public.votes
for select
to anon, authenticated
using (true);

drop policy if exists "public can submit votes" on public.votes;
create policy "public can submit votes"
on public.votes
for insert
to anon, authenticated
with check (true);

drop policy if exists "public can update own round vote" on public.votes;
create policy "public can update own round vote"
on public.votes
for update
to anon, authenticated
using (true)
with check (true);

drop policy if exists "public can read points" on public.points;
create policy "public can read points"
on public.points
for select
to anon, authenticated
using (true);

drop policy if exists "public can read word events" on public.word_events;
create policy "public can read word events"
on public.word_events
for select
to anon, authenticated
using (true);

drop policy if exists "public can add word events" on public.word_events;
create policy "public can add word events"
on public.word_events
for insert
to anon, authenticated
with check (true);
