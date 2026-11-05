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
    if (body.action === 'delete' && validId(body.gameId)) {
      const id=Number(body.gameId);
      const deleted=await sql.query('DELETE FROM team_games WHERE id=$1 RETURNING id',[id]);
      if(!deleted.length)return res.status(404).json({error:'Гру вже видалено або не знайдено'});
      return res.status(200).json({ok:true});
    }
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
      const words=await sql.query('SELECT team_id,word_order,word FROM team_association_words WHERE game_id=$1 ORDER BY team_id,word_order',[id]);
      const prompts=await sql.query('SELECT prompt_order,description,answer FROM team_absurd_prompts WHERE game_id=$1 ORDER BY prompt_order',[id]);
      const cards=await sql.query('SELECT c.position,b.word,c.card_color,c.revealed FROM team_codenames_cards c JOIN team_codenames_bank b ON b.id=c.word_id WHERE c.game_id=$1 ORDER BY c.position',[id]);
      const roles=await sql.query('SELECT team_id,color FROM team_codenames_roles WHERE game_id=$1',[id]);
      return res.status(200).json({game:games[0],teams,words,prompts,cards,roles});
    }
    if (body.action === 'saveContent' && validId(body.gameId)) {
      const id=Number(body.gameId);
      const game=await sql.query('SELECT status FROM team_games WHERE id=$1',[id]);
      if(!game.length)return res.status(404).json({error:'Гру не знайдено'});
      if(game[0].status!=='setup')return res.status(409).json({error:'Після запуску гри змінювати завдання не можна'});
      const teams=await sql.query('SELECT id FROM team_game_teams WHERE game_id=$1 ORDER BY display_order',[id]);
      if(teams.length!==2)return res.status(409).json({error:'Потрібно дві команди'});
      const lists=body.wordLists, prompts=body.prompts;
      if(!Array.isArray(lists)||lists.length!==2||lists.some(list=>!Array.isArray(list)||list.length>150||list.some(w=>typeof w!=='string'||!w.trim()||w.length>120)))
        return res.status(400).json({error:'Перевір слова першого раунду (до 150 на команду)'});
      if(!Array.isArray(prompts)||prompts.length>150||prompts.some(p=>!p||typeof p.description!=='string'||!p.description.trim()||p.description.length>5000||typeof p.answer!=='string'||!p.answer.trim()||p.answer.length>200))
        return res.status(400).json({error:'Перевір описи та відповіді третього раунду'});
      await sql.query('DELETE FROM team_association_words WHERE game_id=$1',[id]);
      for(let i=0;i<2;i++)for(let j=0;j<lists[i].length;j++)
        await sql.query('INSERT INTO team_association_words(game_id,team_id,word_order,word) VALUES($1,$2,$3,$4)',[id,teams[i].id,j,lists[i][j].trim()]);
      await sql.query('DELETE FROM team_absurd_prompts WHERE game_id=$1',[id]);
      for(let j=0;j<prompts.length;j++)
        await sql.query('INSERT INTO team_absurd_prompts(game_id,prompt_order,description,answer) VALUES($1,$2,$3,$4)',[id,j,prompts[j].description.trim(),prompts[j].answer.trim()]);
      return res.status(200).json({ok:true});
    }
    if(body.action==='generateBoard' && validId(body.gameId)){
      const id=Number(body.gameId);
      const game=await sql.query('SELECT status FROM team_games WHERE id=$1',[id]);
      if(!game.length)return res.status(404).json({error:'Гру не знайдено'});
      if(game[0].status!=='setup')return res.status(409).json({error:'Після початку гри поле змінювати не можна'});
      const teams=await sql.query('SELECT id FROM team_game_teams WHERE game_id=$1 ORDER BY display_order',[id]);
      if(teams.length!==2)return res.status(409).json({error:'Потрібно дві команди'});
      const blue=Number(body.blueTeam);
      if(blue!==1&&blue!==2)return res.status(400).json({error:'Обери синю команду'});
      const old=await sql.query('SELECT word_id FROM team_codenames_cards WHERE game_id=$1',[id]);
      if(old.length)await sql.query('UPDATE team_codenames_bank SET used_at=NULL WHERE id=ANY($1::bigint[])',[old.map(x=>x.word_id)]);
      const available=await sql.query('SELECT id FROM team_codenames_bank WHERE used_at IS NULL ORDER BY random() LIMIT 25');
      if(available.length<25)return res.status(409).json({error:'У банку замало невикористаних слів. Додай нові слова.'});
      const colors=[...Array(9).fill('blue'),...Array(8).fill('red'),...Array(7).fill('neutral'),'black'];
      for(let i=colors.length-1;i>0;i--){const j=crypto.randomInt(i+1);[colors[i],colors[j]]=[colors[j],colors[i]]}
      await sql.query('DELETE FROM team_codenames_cards WHERE game_id=$1',[id]);
      await sql.query('DELETE FROM team_codenames_roles WHERE game_id=$1',[id]);
      for(let i=0;i<2;i++)await sql.query('INSERT INTO team_codenames_roles(game_id,team_id,color) VALUES($1,$2,$3)',[id,teams[i].id,i+1===blue?'blue':'red']);
      for(let i=0;i<25;i++)await sql.query('INSERT INTO team_codenames_cards(game_id,position,word_id,card_color) VALUES($1,$2,$3,$4)',[id,i,available[i].id,colors[i]]);
      await sql.query('UPDATE team_codenames_bank SET used_at=now() WHERE id=ANY($1::bigint[])',[available.map(x=>x.id)]);
      return res.status(200).json({ok:true});
    }
    return res.status(400).json({error:'Невідома дія'});
  } catch(error) { return res.status(500).json({error:error.message || 'Помилка сервера'}); }
}
