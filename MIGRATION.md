# Supabase → Neon + Cloudinary

## 1. Create the Neon tables

Open the Neon SQL Editor and run `neon_schema.sql`.

If the existing Supabase games must be retained, export these tables from Supabase and import them into Neon in this order: `games`, `questions`, `players`, `answers`, `votes`, `points`, `question_sets`, `word_events`. After importing explicit IDs, move each identity sequence past the largest imported ID.

## 2. Configure Vercel

Remove `VITE_SUPABASE_URL`, `VITE_SUPABASE_KEY`, `SUPABASE_URL`, and `SUPABASE_SERVICE_ROLE_KEY`. Add:

- `DATABASE_URL` — the pooled Neon connection string.
- `CLOUDINARY_URL` — `cloudinary://API_KEY:API_SECRET@CLOUD_NAME` from Cloudinary.
- `ADMIN_PASSWORD` — the admin password already used by the site.
- `ADMIN_SESSION_SECRET` — a long random secret (recommended).

Redeploy after changing environment variables.

## 3. Media

New uploads go to Cloudinary. Existing Supabase image URLs stored in the database remain usable while the old Supabase project/storage bucket is available. Copy those assets to Cloudinary before removing the old storage if they must remain permanent.

## Live updates

The player, admin, and viewer screens refresh through the existing 1.5-second polling fallback. This replaces Supabase Realtime without changing the game flow.

## Three associations and curated Codenames bank

Authenticated team endpoints automatically apply the additive columns from
`team_game_features.sql` once needed. Existing descriptions remain intact. New
prompts store three associations in `hints_json`; old single descriptions remain
readable and can be converted using the editor. The host chooses the team that
starts round 1 immediately before starting the game.

Round 3 keeps the current hint stage in the database. Only `revealHint` advances
it; wrong answers never do. Awards are 5 / 3 / 1; every wrong answer is -2, with
no attempt limit. Public responses contain only the already-revealed hints.

`api/_codenames-data.js` is the active curated vocabulary. Before generating a new
board, the API idempotently inserts its words and removes unreferenced retired
words. Words referenced by old boards are retained for those boards but excluded
from all future selections. The existing `used_at` tracking still prevents reuse
of selected words. `team_codenames_seed.sql` mirrors the curated list for fresh
installations; no manual import is required for an existing deployment.
