import { CODENAMES_WORDS, RETIRED_WORDS } from './_codenames-data.js';
let synchronization;
export function ensureCodenamesBank(sql) {
  if (!synchronization) synchronization = sql.transaction([
    sql.query('INSERT INTO team_codenames_bank(word) SELECT unnest($1::text[]) ON CONFLICT (word) DO NOTHING', [CODENAMES_WORDS]),
    sql.query('UPDATE team_codenames_bank b SET used_at=history.used_at FROM (SELECT lower(word) AS normalized,min(used_at) AS used_at FROM team_codenames_bank WHERE used_at IS NOT NULL GROUP BY lower(word)) history WHERE b.word=ANY($1::text[]) AND lower(b.word)=history.normalized AND b.used_at IS NULL', [CODENAMES_WORDS]),
    sql.query('DELETE FROM team_codenames_bank b WHERE b.word=ANY($1::text[]) AND NOT EXISTS (SELECT 1 FROM team_codenames_cards c WHERE c.word_id=b.id)', [RETIRED_WORDS])
  ]).catch(error => { synchronization = null; throw error; });
  return synchronization;
}
export { CODENAMES_WORDS };
