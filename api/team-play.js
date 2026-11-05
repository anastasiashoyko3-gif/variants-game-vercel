import { ensureTeamFeatures, promptHints, hintPoints } from './_team-features.js';
import {startRound2} from './_team-board.js';
import {getDb} from './_db.js';
import {isTeamAdmin} from './_team-auth.js';
const parse=req=>typeof req.body==='object'?(req.body||{}):JSON.parse(req.body||'{}');
export default async function handler(req,res){
 if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
 if(!isTeamAdmin(req))return res.status(401).json({error:'Потрібен вхід адміна'});
 let b;try{b=parse(req)}catch{return res.status(400).json({error:'Невірні дані'})}
 const id=Number(b.gameId),action=b.action;
 if(!Number.isSafeInteger(id)||id<1)return res.status(400).json({error:'Невірна гра'});
 const sql=getDb();
 try{
  await ensureTeamFeatures(sql);
  const [g]=await sql.query('SELECT * FROM team_games WHERE id=$1',[id]);
  if(!g)return res.status(404).json({error:'Гру не знайдено'});
  const teams=await sql.query('SELECT id FROM team_game_teams WHERE game_id=$1 ORDER BY display_order',[id]);
  const team=teams.find(t=>String(t.id)===String(b.teamId));
  if(action==='showFinalScore'){
   if(g.status!=='finished'||g.phase!=='round3_done')return res.status(409).json({error:'Спочатку заверши третій раунд'});
   await sql.query("UPDATE team_games SET phase='finished' WHERE id=$1 AND status='finished' AND phase='round3_done'",[id]);
   return res.json({ok:true});
  }
  if(g.status!=='playing')return res.status(409).json({error:'Гра не запущена або вже завершена'});
  if(action==='round2Start'){
   if(g.phase!=='round1_done')return res.status(409).json({error:'Спочатку заверши раунд 1'});
   const blue=Number(b.blueTeam);
   if(blue!==1&&blue!==2)return res.status(400).json({error:'Обери синю команду'});
   if(teams.length!==2)return res.status(409).json({error:'Потрібні дві команди'});
   await startRound2(sql,id,teams,blue);
   return res.json({ok:true});
  }
  if(action==='reveal'){
   if(g.phase!=='round2_play')return res.status(409).json({error:'Зараз не раунд 2'});
   const pos=Number(b.position);
   if(!Number.isInteger(pos)||pos<0||pos>24)return res.status(400).json({error:'Невірна картка'});
   const [card]=await sql.query('UPDATE team_codenames_cards SET revealed=true,revealed_by_team_id=$3 WHERE game_id=$1 AND position=$2 AND revealed=false RETURNING id,card_color',[id,pos,g.active_team_id]);
   if(!card)return res.status(409).json({error:'Картка вже відкрита'});
   if(card.card_color==='black'){
    await sql.query('UPDATE team_game_teams SET round2_score=0 WHERE game_id=$1 AND id=$2',[id,g.active_team_id]);
    await sql.query("UPDATE team_games SET phase='round2_done' WHERE id=$1 AND phase='round2_play'",[id]);
   }else{
    if(card.card_color==='blue'||card.card_color==='red'){
     const [owner]=await sql.query('SELECT team_id FROM team_codenames_roles WHERE game_id=$1 AND color=$2',[id,card.card_color]);
     if(owner){
      await sql.query('UPDATE team_game_teams SET round2_score=round2_score+2 WHERE game_id=$1 AND id=$2',[id,owner.team_id]);
      await sql.query("INSERT INTO team_score_events(game_id,team_id,round_no,points,event_type,reference_id) VALUES($1,$2,2,2,'codenames_reveal',$3)",[id,owner.team_id,card.id]);
     }
    }
    const [left]=await sql.query("SELECT count(*)::int AS n FROM team_codenames_cards WHERE game_id=$1 AND revealed=false AND card_color IN ('blue','red')",[id]);
    if(left.n===0)await sql.query("UPDATE team_games SET phase='round2_done' WHERE id=$1",[id]);
   }
   return res.json({ok:true});
  }
  if(action==='switchTeam'){
   if(g.phase!=='round2_play')return res.status(409).json({error:'Зараз не раунд 2'});
   const other=teams.find(t=>String(t.id)!==String(g.active_team_id));
   await sql.query('UPDATE team_games SET active_team_id=$2 WHERE id=$1',[id,other.id]);
   return res.json({ok:true});
  }
  if(action==='endRound2'){
   if(g.phase!=='round2_play')return res.status(409).json({error:'Раунд 2 не активний'});
   await sql.query("UPDATE team_games SET phase='round2_done' WHERE id=$1",[id]);
   return res.json({ok:true});
  }
  if(action==='round3Start'){
   if(g.phase!=='round2_done')return res.status(409).json({error:'Спочатку заверши раунд 2'});
   const [n]=await sql.query('SELECT count(*)::int AS n FROM team_absurd_prompts WHERE game_id=$1',[id]);
   if(!n.n)return res.status(409).json({error:'Додай описи третього раунду'});
   await sql.query("UPDATE team_games SET current_round=3,phase='round3_play',active_team_id=NULL,current_item=0,round3_hint=1 WHERE id=$1 AND phase='round2_done'",[id]);
   return res.json({ok:true});
  }
  if(action==='revealHint'){
   if(g.phase!=='round3_play')return res.status(409).json({error:'Зараз не можна відкрити підказку'});
   const [prompt]=await sql.query('SELECT description,hints_json FROM team_absurd_prompts WHERE game_id=$1 AND prompt_order=$2',[id,g.current_item]);
   const stage=Number(g.round3_hint||1);
   if((b.hintStage!==undefined&&Number(b.hintStage)!==stage)||(b.promptOrder!==undefined&&Number(b.promptOrder)!==g.current_item))return res.status(409).json({error:'Завдання або підказка змінилися. Онови екран.'});
   if(!prompt||stage>=promptHints(prompt).length)return res.status(409).json({error:'Усі підказки вже відкриті'});
   const updated=await sql.query("UPDATE team_games SET round3_hint=round3_hint+1 WHERE id=$1 AND phase='round3_play' AND round3_hint=$2 RETURNING id",[id,stage]);
   if(!updated.length)return res.status(409).json({error:'Стан змінився. Онови екран.'});
   return res.json({ok:true});
  }
  if(action==='guess'){
   if(g.phase!=='round3_play')return res.status(409).json({error:'Зараз не можна оцінити відповідь'});
   if(!team)return res.status(400).json({error:'Обери команду'});
   const [prompt]=await sql.query('SELECT id FROM team_absurd_prompts WHERE game_id=$1 AND prompt_order=$2',[id,g.current_item]);
   if(!prompt)return res.status(409).json({error:'Завдання не знайдено'});
   const stage=Number(g.round3_hint||1);
   if(b.hintStage!==undefined&&Number(b.hintStage)!==stage)return res.status(409).json({error:'Підказка змінилася. Перевір поточні бали й повтори дію.'});
   if(b.promptOrder!==undefined&&Number(b.promptOrder)!==g.current_item)return res.status(409).json({error:'Завдання змінилося. Онови екран.'});
   const correct=b.correct===true,points=correct?hintPoints(stage):-2;
   await sql.transaction([
    sql.query("SELECT 1 / CASE WHEN status='playing' AND phase='round3_play' AND current_item=$2 AND round3_hint=$3 THEN 1 ELSE 0 END FROM team_games WHERE id=$1 FOR UPDATE",[id,g.current_item,stage]),
    ...(correct?[
     sql.query('UPDATE team_absurd_prompts SET solved_by_team_id=$3 WHERE game_id=$1 AND prompt_order=$2 AND solved_by_team_id IS NULL',[id,g.current_item,team.id]),
     sql.query("UPDATE team_games SET phase='round3_wait_next' WHERE id=$1",[id])
    ]:[]),
    sql.query('UPDATE team_game_teams SET round3_score=round3_score+$3 WHERE game_id=$1 AND id=$2',[id,team.id,points]),
    sql.query('INSERT INTO team_score_events(game_id,team_id,round_no,points,event_type,reference_id) VALUES($1,$2,3,$3,$4,$5)',[id,team.id,points,correct?'absurd_correct':'absurd_wrong',prompt.id])
   ],{isolationLevel:'Serializable'});
   return res.json({ok:true});
  }
  if(action==='nextPrompt'){
   if(g.phase!=='round3_wait_next')return res.status(409).json({error:'Спочатку зарахуй правильну відповідь'});
   const [next]=await sql.query('SELECT id FROM team_absurd_prompts WHERE game_id=$1 AND prompt_order=$2',[id,g.current_item+1]);
   if(!next)return res.status(409).json({error:'Це був останній опис. Заверши гру.'});
   await sql.query("UPDATE team_games SET current_item=current_item+1,phase='round3_play',round3_hint=1 WHERE id=$1 AND phase='round3_wait_next'",[id]);
   return res.json({ok:true});
  }
  if(action==='finishGame'){
   if(!['round3_wait_next','round3_play'].includes(g.phase))return res.status(409).json({error:'Раунд 3 не активний'});
   const [last]=await sql.query('SELECT max(prompt_order)::int AS n FROM team_absurd_prompts WHERE game_id=$1',[id]);
   if(g.current_item!==last.n||g.phase!=='round3_wait_next')return res.status(409).json({error:'Спочатку заверши всі описи'});
   await sql.query("UPDATE team_games SET status='finished',phase='round3_done',finished_at=now() WHERE id=$1",[id]);
   return res.json({ok:true});
  }
  return res.status(400).json({error:'Невідома дія'});
 }catch(e){
  if(['40001','22012'].includes(e.code))return res.status(409).json({error:'Стан гри змінився. Онови сторінку й спробуй знову.'});
  return res.status(e.status||500).json({error:e.message||'Помилка сервера'});
 }
}
