-- Third game mode: three-round team game.
-- Run in Neon SQL Editor only when the new mode is ready to test.
-- Separate tables keep the existing two game modes unchanged.

create table if not exists team_games (
  id bigint generated always as identity primary key,
  title text not null default 'Командна гра',
  invite_code text not null unique,
  status text not null default 'setup',
  current_round integer not null default 1 check (current_round between 1 and 3),
  phase text not null default 'setup',
  active_team_id bigint,
  current_item integer not null default 0,
  round1_first_team integer not null default 1 check (round1_first_team in (1,2)),
  round3_hint integer not null default 1 check (round3_hint between 1 and 3),
  round_deadline timestamptz,
  round_paused_seconds integer,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);

create table if not exists team_game_teams (
  id bigint generated always as identity primary key,
  game_id bigint not null references team_games(id) on delete cascade,
  name text not null,
  color text not null,
  display_order integer not null check (display_order in (1, 2)),
  round1_score integer not null default 0,
  round2_score integer not null default 0,
  round3_score integer not null default 0,
  unique (game_id, display_order)
);

alter table team_games
  add constraint team_games_active_team_fk
  foreign key (active_team_id) references team_game_teams(id) on delete set null;

create table if not exists team_association_words (
  id bigint generated always as identity primary key,
  game_id bigint not null references team_games(id) on delete cascade,
  team_id bigint not null references team_game_teams(id) on delete cascade,
  word_order integer not null,
  word text not null,
  result text not null default 'pending'
    check (result in ('pending', 'correct', 'skipped')),
  unique (team_id, word_order)
);

create table if not exists team_codenames_bank (
  id bigint generated always as identity primary key,
  word text not null unique,
  used_at timestamptz
);

create table if not exists team_codenames_cards (
  id bigint generated always as identity primary key,
  game_id bigint not null references team_games(id) on delete cascade,
  position integer not null check (position between 0 and 24),
  word_id bigint not null references team_codenames_bank(id),
  card_color text not null check (card_color in ('blue','red','neutral','black')),
  revealed boolean not null default false,
  revealed_by_team_id bigint references team_game_teams(id) on delete set null,
  unique (game_id, position),
  unique (game_id, word_id)
);

create table if not exists team_codenames_roles (
  game_id bigint not null references team_games(id) on delete cascade,
  team_id bigint not null references team_game_teams(id) on delete cascade,
  color text not null check (color in ('blue','red')),
  primary key (game_id, team_id),
  unique (game_id, color)
);

create table if not exists team_absurd_prompts (
  id bigint generated always as identity primary key,
  game_id bigint not null references team_games(id) on delete cascade,
  prompt_order integer not null,
  description text not null,
  hints_json jsonb,
  answer text not null,
  solved_by_team_id bigint references team_game_teams(id) on delete set null,
  unique (game_id, prompt_order)
);

create table if not exists team_score_events (
  id bigint generated always as identity primary key,
  game_id bigint not null references team_games(id) on delete cascade,
  team_id bigint not null references team_game_teams(id) on delete cascade,
  round_no integer not null check (round_no between 1 and 3),
  points integer not null,
  event_type text not null,
  reference_id bigint,
  created_at timestamptz not null default now()
);

create index if not exists team_association_game_idx on team_association_words(game_id,team_id,word_order);
create index if not exists team_codenames_cards_game_idx on team_codenames_cards(game_id,position);
create index if not exists team_absurd_game_idx on team_absurd_prompts(game_id,prompt_order);
create index if not exists team_score_events_game_idx on team_score_events(game_id,id);
