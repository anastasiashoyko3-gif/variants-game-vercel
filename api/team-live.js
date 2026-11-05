import {getDb} from './_db.js';
import {isTeamAdmin} from './_team-auth.js';
export default async function handler(req,res){
 if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
 const id=Number(req.query.gameId);
 if(!Number.isSafeInteger(id)||id<1)return res.status(400).json({error:'Невірний номер гри'});
 const admin=isTeamAdmin(req),sql=getDb();
 try{
  const games=await sql.query('SELECT id,title,status,current_round,phase,active_team_id,round_deadline,round_paused_seconds,invite_code FROM team_games WHERE id=$1',[id]);
  if(!games.length)return res.status(404).json({error:'Гру не знайдено'});
  const g=games[0];
  if(!admin && String(req.query.code||'')!==g.invite_code)return res.status(403).json({error:'Потрібен код гри'});
  const teams=await sql.query('SELECT id,name,color,display_order,round1_score,round2_score,round3_score FROM team_game_teams WHERE game_id=$1 ORDER BY display_order',[id]);
  const words=await sql.query("SELECT id,team_id,word_order,word,result FROM team_association_words WHERE game_id=$1 ORDER BY team_id,word_order",[id]);
  const active=words.find(w=>String(w.team_id)===String(g.active_team_id)&&w.result==='pending');
  const game={title:g.title,status:g.status,current_round:g.current_round,phase:g.phase,active_team_id:g.active_team_id,round_deadline:g.round_deadline,round_paused_seconds:g.round_paused_seconds};
  const response={game,teams,serverTime:Date.now(),activeWordId:active?.id||null};
  if(admin)response.activeWord=active?.word||null;
  // The viewer never receives secret association words.
  return res.status(200).json(response);
 }catch(e){return res.status(500).json({error:'Не вдалося завантажити гру'})}
}
