import {getDb} from './_db.js';
import {isTeamAdmin} from './_team-auth.js';
export default async function handler(req,res){
 if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
 if(!isTeamAdmin(req))return res.status(401).json({error:'Увійди в адмінку'});
 const body=typeof req.body==='object'?req.body:JSON.parse(req.body||'{}');
 const id=Number(body.gameId);
 if(!Number.isSafeInteger(id)||id<1)return res.status(400).json({error:'Невірна гра'});
 const sql=getDb();
 try{
  const found=await sql.query('SELECT id FROM team_games WHERE id=$1',[id]);
  if(!found.length)return res.status(404).json({error:'Гру не знайдено'});
  await sql.query("UPDATE team_games SET status='setup',current_round=1,phase='setup',active_team_id=NULL,current_item=0,round_deadline=NULL,round_paused_seconds=NULL,finished_at=NULL WHERE id=$1",[id]);
  await sql.query('UPDATE team_game_teams SET round1_score=0,round2_score=0,round3_score=0 WHERE game_id=$1',[id]);
  await sql.query("UPDATE team_association_words SET result='pending' WHERE game_id=$1",[id]);
  await sql.query('UPDATE team_codenames_cards SET revealed=false,revealed_by_team_id=NULL WHERE game_id=$1',[id]);
  await sql.query('UPDATE team_absurd_prompts SET solved_by_team_id=NULL WHERE game_id=$1',[id]);
  await sql.query('DELETE FROM team_score_events WHERE game_id=$1',[id]);
  return res.json({ok:true});
 }catch(e){return res.status(500).json({error:'Не вдалося перезапустити гру'})}
}