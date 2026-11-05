let migration;
// Additive, idempotent upgrade for existing deployments; old prompts stay intact.
export function ensureTeamFeatures(sql) {
  if (!migration) migration = (async () => {
    const columns = await sql.query("SELECT column_name FROM information_schema.columns WHERE table_schema=current_schema() AND ((table_name='team_games' AND column_name IN ('round1_first_team','round3_hint')) OR (table_name='team_absurd_prompts' AND column_name='hints_json'))");
    if (columns.length === 3) return;
    await sql.transaction([
      sql.query('ALTER TABLE team_games ADD COLUMN IF NOT EXISTS round1_first_team integer NOT NULL DEFAULT 1 CHECK (round1_first_team IN (1,2))'),
      sql.query('ALTER TABLE team_games ADD COLUMN IF NOT EXISTS round3_hint integer NOT NULL DEFAULT 1 CHECK (round3_hint BETWEEN 1 AND 3)'),
      sql.query('ALTER TABLE team_absurd_prompts ADD COLUMN IF NOT EXISTS hints_json jsonb')
    ]);
  })().catch(error => { migration = null; throw error; });
  return migration;
}

export function promptHints(prompt) {
  let hints = prompt.hints_json;
  if (typeof hints === 'string') { try { hints = JSON.parse(hints); } catch { hints = null; } }
  if (Array.isArray(hints) && hints.length === 3 && hints.every(h => typeof h === 'string' && h.trim())) return hints;
  // Legacy saved descriptions are retained verbatim; the editor can replace them
  // with three associations, without inventing missing clues or losing content.
  return [prompt.description || ''];
}
export const hintPoints = stage => [5, 3, 1][Math.max(0, Math.min(2, Number(stage || 1) - 1))];
