create table if not exists question_sets (
  id bigint generated always as identity primary key,
  title text,
  questions_json text,
  created_at text
);

alter table question_sets disable row level security;

alter publication supabase_realtime add table question_sets;
