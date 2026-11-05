import { promptHints, hintPoints } from './_team-features.js';
import crypto from 'crypto';
import {getDb} from './_db.js';
import {isTeamAdmin} from './_team-auth.js';
export default async function handler(req,res){
 if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
 const id=Number(req.query.gameId);
 if(!Number.isSafeInteger(id)||id<1)return res.status(400).json({error:'Невірний номер гри'});
 const admin=isTeamAdmin(req) && !req.query.code,sql=getDb();
 try{
  const games=await sql.query('SELECT * FROM team_games WHERE id=$1',[id]);
  if(!games.length)return res.status(404).json({error:'Гру не знайдено'});
  const g=games[0];
  if(!admin && String(req.query.code||'')!==g.invite_code)return res.status(403).json({error:'Потрібен код гри'});
  const teams=await sql.query('SELECT id,name,color,display_order,round1_score,round2_score,round3_score FROM team_game_teams WHERE game_id=$1 ORDER BY display_order',[id]);
  const words=await sql.query("SELECT id,team_id,word_order,word,result FROM team_association_words WHERE game_id=$1 ORDER BY team_id,word_order",[id]);
  const active=words.find(w=>String(w.team_id)===String(g.active_team_id)&&w.result==='pending');
  const game={title:g.title,status:g.status,current_round:g.current_round,phase:g.phase,active_team_id:g.active_team_id,round_deadline:g.round_deadline,round_paused_seconds:g.round_paused_seconds,round1_first_team:g.round1_first_team||1,round3_hint:g.round3_hint||1,current_item:g.current_item};
  const response={game,teams,gameCode:g.invite_code,serverTime:Date.now(),activeWordId:active?.id||null};
  const secret=process.env.ADMIN_SESSION_SECRET||process.env.ADMIN_PASSWORD;
  const roleTeam=teams.find(t=>{
    if(!secret)return false;
    const token=crypto.createHmac('sha256',secret).update('team-role:'+id+':'+t.id).digest('hex');
    const supplied=String(req.query.roleToken||'');
    return supplied.length===token.length&&crypto.timingSafeEqual(Buffer.from(supplied),Buffer.from(token));
  });
  const cards=await sql.query('SELECT c.position,b.word,c.card_color,c.revealed FROM team_codenames_cards c JOIN team_codenames_bank b ON b.id=c.word_id WHERE c.game_id=$1 ORDER BY c.position',[id]);
  response.cards=cards.map(card=>({position:card.position,word:card.word,revealed:card.revealed,...((admin||roleTeam||card.revealed)?{card_color:card.card_color}:{})}));
  const roles=await sql.query('SELECT team_id,color FROM team_codenames_roles WHERE game_id=$1',[id]);
  response.roles=roles;
  const prompts=await sql.query('SELECT * FROM team_absurd_prompts WHERE game_id=$1 ORDER BY prompt_order',[id]);
  const prompt=prompts.find(p=>p.prompt_order===g.current_item);
  if(prompt){
    const hints=promptHints(prompt),stage=Math.min(Number(g.round3_hint||1),hints.length);
    const visible=g.current_round===3?hints.slice(0,stage):[];
    response.prompt={hints:admin?hints:visible,description:(admin?hints:visible).join('\n'),hintStage:stage,hintCount:hints.length,...(admin?{answer:prompt.answer,points:hintPoints(stage)}:{})};
  }else response.prompt=null;
  response.isLastPrompt=!!prompt&&g.current_item===prompts.length-1;
  if(roleTeam&&String(roleTeam.id)!==String(g.active_team_id))response.roleTeamId=roleTeam.id;
  if(roleTeam&&String(roleTeam.id)===String(g.active_team_id))response.activeWord=active?.word||null;
  if(admin){
    response.activeWord=active?.word||null;
    if(secret)response.roleLinks=teams.map(t=>({teamId:t.id,token:crypto.createHmac('sha256',secret).update('team-role:'+id+':'+t.id).digest('hex')}));
  }
  // The viewer never receives secret association words.
  return res.status(200).json(response);
 }catch(e){return res.status(500).json({error:'Не вдалося завантажити гру'})}
}
