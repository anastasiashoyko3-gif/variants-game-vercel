import { ensureCodenamesBank, CODENAMES_WORDS } from './_codenames-bank.js';
import crypto from 'crypto';

// Reserve words, replace any legacy board and start the round as one transaction.
// Serializable isolation also rejects simultaneous starts and competing word claims.
export async function startRound2(sql, gameId, teams, blueTeam) {
  await ensureCodenamesBank(sql);
  const available = await sql.query('SELECT id FROM team_codenames_bank WHERE word=ANY($1::text[]) AND used_at IS NULL ORDER BY random() LIMIT 25', [CODENAMES_WORDS]);
  if (available.length < 25) throw Object.assign(new Error('У банку замало невикористаних слів. Додай нові слова.'), { status: 409 });
  const wordIds = available.map(word => word.id);
  const colors = [...Array(9).fill('blue'), ...Array(8).fill('red'), ...Array(7).fill('neutral'), 'black'];
  for (let i = colors.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [colors[i], colors[j]] = [colors[j], colors[i]];
  }
  const blueId = teams[blueTeam - 1].id;
  await sql.transaction([
    // A failed guard aborts the entire transaction, leaving the old state intact.
    sql.query("SELECT 1 / CASE WHEN status='playing' AND phase='round1_done' THEN 1 ELSE 0 END FROM team_games WHERE id=$1 FOR UPDATE", [gameId]),
    sql.query('SELECT 1 / CASE WHEN count(*)=25 THEN 1 ELSE 0 END FROM team_codenames_bank WHERE id=ANY($1::bigint[]) AND used_at IS NULL', [wordIds]),
    sql.query('DELETE FROM team_codenames_cards WHERE game_id=$1', [gameId]),
    sql.query('DELETE FROM team_codenames_roles WHERE game_id=$1', [gameId]),
    ...teams.map((team, index) => sql.query('INSERT INTO team_codenames_roles(game_id,team_id,color) VALUES($1,$2,$3)', [gameId, team.id, index + 1 === blueTeam ? 'blue' : 'red'])),
    ...available.map((word, index) => sql.query('INSERT INTO team_codenames_cards(game_id,position,word_id,card_color) VALUES($1,$2,$3,$4)', [gameId, index, word.id, colors[index]])),
    sql.query('UPDATE team_codenames_bank SET used_at=now() WHERE id=ANY($1::bigint[])', [wordIds]),
    sql.query("UPDATE team_games SET current_round=2,phase='round2_play',active_team_id=$2,current_item=0,round_deadline=NULL,round_paused_seconds=NULL WHERE id=$1", [gameId, blueId])
  ], { isolationLevel: 'Serializable' });
}
