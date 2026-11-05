-- Additive migration, also applied automatically by authenticated team endpoints.
BEGIN;
ALTER TABLE team_games ADD COLUMN IF NOT EXISTS round1_first_team integer NOT NULL DEFAULT 1 CHECK (round1_first_team IN (1,2));
ALTER TABLE team_games ADD COLUMN IF NOT EXISTS round3_hint integer NOT NULL DEFAULT 1 CHECK (round3_hint BETWEEN 1 AND 3);
ALTER TABLE team_absurd_prompts ADD COLUMN IF NOT EXISTS hints_json jsonb;
COMMIT;
