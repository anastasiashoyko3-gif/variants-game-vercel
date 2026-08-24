-- Run once in the Neon SQL Editor before deploying the migrated site.
-- The column names and text-based JSON/timestamps intentionally match the existing app.

create table if not exists games (
  id bigint generated always as identity primary key,
  invite_code text not null unique,
  title text,
  game_password text,
  host_avatar text,
  mode text default 'variants',
  word_config_json text default '{}',
  status text default 'active',
  phase text default 'lobby',
  current_q integer default 0,
  scoreboard_visible integer default 0,
  answer_deadline bigint,
  vote_deadline bigint,
  created_at text,
  finished_at text
);

create table if not exists questions (
  id bigint generated always as identity primary key,
  game_id bigint not null references games(id) on delete cascade,
  q_order integer not null default 0,
  round_no integer default 1,
  text text,
  correct_answer text,
  fake_answer text,
  photo_url text,
  options_json text default '[]',
  revealed_json text default '[]'
);

create table if not exists players (
  id bigint generated always as identity primary key,
  game_id bigint not null references games(id) on delete cascade,
  name text not null,
  pin text not null,
  avatar text,
  score integer default 0,
  team_name text,
  created_at text
);

create table if not exists answers (
  id bigint generated always as identity primary key,
  game_id bigint not null references games(id) on delete cascade,
  question_id bigint not null references questions(id) on delete cascade,
  player_id bigint not null references players(id) on delete cascade,
  text text,
  created_at text,
  unique(question_id,player_id)
);

create table if not exists votes (
  id bigint generated always as identity primary key,
  game_id bigint not null references games(id) on delete cascade,
  question_id bigint not null references questions(id) on delete cascade,
  player_id bigint not null references players(id) on delete cascade,
  option_id text,
  created_at text,
  unique(question_id,player_id)
);

create table if not exists points (
  id bigint generated always as identity primary key,
  game_id bigint not null references games(id) on delete cascade,
  question_id bigint not null references questions(id) on delete cascade,
  player_id bigint not null references players(id) on delete cascade,
  points integer default 0,
  created_at text
);

create table if not exists question_sets (
  id bigint generated always as identity primary key,
  title text,
  questions_json text,
  created_at text
);

create table if not exists word_events (
  id bigint generated always as identity primary key,
  game_id bigint not null references games(id) on delete cascade,
  player_id bigint references players(id) on delete cascade,
  event_type text,
  payload_json text,
  created_at text
);

create index if not exists questions_game_order_idx on questions(game_id,q_order);
create index if not exists players_game_idx on players(game_id);
create index if not exists answers_question_idx on answers(question_id);
create index if not exists votes_question_idx on votes(question_id);
create index if not exists word_events_game_idx on word_events(game_id,id desc);
