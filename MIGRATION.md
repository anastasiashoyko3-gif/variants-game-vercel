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
