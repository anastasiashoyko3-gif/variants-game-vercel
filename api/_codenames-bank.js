import { CODENAMES_WORDS, RETIRED_WORDS } from './_codenames-data.js';
let synchronization;
export function ensureCodenamesBank(sql) {
  if (!synchronization) synchronization = sql.transaction([
    sql.query('INSERT INTO team_codenames_bank(word) SELECT unnest($1::text[]) ON CONFLICT (word) DO NOTHING', [CODENAMES_WORDS]),
    sql.query('DELETE FROM team_codenames_bank b WHERE b.word=ANY($1::text[]) AND NOT EXISTS (SELECT 1 FROM team_codenames_cards c WHERE c.word_id=b.id)', [RETIRED_WORDS])
  ]).catch(error => { synchronization = null; throw error; });
  return synchronization;
}
export { CODENAMES_WORDS };
