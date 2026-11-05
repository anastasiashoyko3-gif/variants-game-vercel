import crypto from 'crypto';
import { getDb } from './_db.js';
import { isTeamAdmin } from './_team-auth.js';

function parseBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  try { return JSON.parse(req.body || '{}'); } catch { return {}; }
}
function validId(value) { return Number.isSafeInteger(Number(value)) && Number(value) > 0; }
function validateTeam(team) {
  return team && typeof team.name === 'string' && team.name.trim().length > 0 &&
    team.name.length <= 80 && /^#[0-9a-f]{6}$/i.test(team.color || '');
}
export default async function handler(req, res) {
  if (!['GET','POST'].includes(req.method)) return res.status(405).json({error:'Method not allowed'});
  if (!isTeamAdmin(req)) return res.status(401).json({error:'Потрібен вхід в адмінку'});
  const sql=getDb();
  try {
    if (req.method === 'GET') {
      const games=await sql.query('SELECT id,title,invite_code,status,current_round FROM team_games ORDER BY id DESC LIMIT 100');
      return res.status(200).json({games});
    }
    const body=parseBody(req);
    if (body.action === 'create') {
      const teams=body.teams;
      if (!Array.isArray(teams) || teams.length !== 2 || !teams.every(validateTeam)) {
        return res.status(400).json({error:'Заповни назви й кольори двох команд'});
      }
      const title=String(body.title || 'Командна гра').trim().slice(0,120);
      const code=crypto.randomBytes(8).toString('hex');
      const created=await sql.query('INSERT INTO team_games(title,invite_code) VALUES($1,$2) RETURNING id,invite_code',[title,code]);
      const id=created[0].id;
      try {
        for(let i=0;i<2;i++) await sql.query('INSERT INTO team_game_teams(game_id,name,color,display_order) VALUES($1,$2,$3,$4)',[id,teams[i].name.trim(),teams[i].color,i+1]);
      } catch(error) {
        await sql.query('DELETE FROM team_games WHERE id=$1',[id]);
        throw error;
      }
      return res.status(200).json({game:created[0]});
    }
    if (body.action === 'details' && validId(body.gameId)) {
      const id=Number(body.gameId);
      const games=await sql.query('SELECT id,title,status,current_round FROM team_games WHERE id=$1',[id]);
      if(!games.length) return res.status(404).json({error:'Гру не знайдено'});
      const teams=await sql.query('SELECT id,name,color,display_order,round1_score,round2_score,round3_score FROM team_game_teams WHERE game_id=$1 ORDER BY display_order',[id]);
      return res.status(200).json({game:games[0],teams});
    }
    return res.status(400).json({error:'Невідома дія'});
  } catch(error) { return res.status(500).json({error:error.message || 'Помилка сервера'}); }
}
