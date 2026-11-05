import { ensureTeamFeatures } from './_team-features.js';
import {getDb} from './_db.js';
import {isTeamAdmin} from './_team-auth.js';
function body(req){if(typeof req.body==='object')return req.body||{};try{return JSON.parse(req.body||'{}')}catch{return {}}}
export default async function handler(req,res){
 if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
 if(!isTeamAdmin(req))return res.status(401).json({error:'Потрібен вхід адміністратора'});
 const {action,gameId,result,firstTeam}=body(req),id=Number(gameId);
 if(!Number.isSafeInteger(id)||id<1)return res.status(400).json({error:'Невірна гра'});
 const sql=getDb();
 try{
  await ensureTeamFeatures(sql);
  const games=await sql.query('SELECT id,status,current_round,phase,active_team_id,current_item,round_deadline,round_paused_seconds,round1_first_team FROM team_games WHERE id=$1',[id]);
  if(!games.length)return res.status(404).json({error:'Гру не знайдено'});
  const g=games[0];
  const teams=await sql.query('SELECT id,display_order FROM team_game_teams WHERE game_id=$1 ORDER BY display_order',[id]);
  if(teams.length!==2)return res.status(409).json({error:'Потрібні дві команди'});
  if(action==='start'){
   if(g.status!=='setup')return res.status(409).json({error:'Гра вже почалася'});
   const first=firstTeam===undefined?1:Number(firstTeam);
   if(![1,2].includes(first))return res.status(400).json({error:'Обери команду, яка починає'});
   const count=await sql.query('SELECT team_id,count(*)::int AS n FROM team_association_words WHERE game_id=$1 GROUP BY team_id',[id]);
   if(teams.some(t=>!count.some(c=>String(c.team_id)===String(t.id)&&c.n>0)))return res.status(409).json({error:'Додай слова обом командам'});
   const updated=await sql.query("UPDATE team_games SET status='playing',current_round=1,phase='round1_ready',active_team_id=$2,round1_first_team=$3,current_item=0,round_paused_seconds=90,round_deadline=NULL WHERE id=$1 AND status='setup' RETURNING id",[id,teams[first-1].id,first]);
   if(!updated.length)return res.status(409).json({error:'Гру вже запущено'});
   return res.status(200).json({ok:true});
  }
  if(action==='startTimer'){
   if(g.status!=='playing'||g.phase!=='round1_ready')return res.status(409).json({error:'Команда ще не готова до запуску'});
   const updated=await sql.query("UPDATE team_games SET phase='round1_play',round_paused_seconds=NULL,round_deadline=now()+interval '90 seconds' WHERE id=$1 AND phase='round1_ready' RETURNING id",[id]);
   if(!updated.length)return res.status(409).json({error:'Таймер уже запущено'});
   return res.status(200).json({ok:true});
  }
  if(action==='score'){
   if(g.status!=='playing'||g.current_round!==1||g.phase!=='round1_play')return res.status(409).json({error:'Зараз не можна оцінювати слово'});
   if(!['correct','skipped'].includes(result))return res.status(400).json({error:'Невірна оцінка'});
   const words=await sql.query("SELECT id,word_order FROM team_association_words WHERE game_id=$1 AND team_id=$2 AND result='pending' ORDER BY word_order LIMIT 1",[id,g.active_team_id]);
   if(!words.length)return res.status(409).json({error:'Слова закінчилися'});
   const word=words[0];
   const changed=await sql.query("UPDATE team_association_words SET result=$2 WHERE id=$1 AND result='pending' RETURNING id",[word.id,result]);
   if(!changed.length)return res.status(409).json({error:'Слово вже оцінено'});
   if(result==='correct'){
    await sql.query('UPDATE team_game_teams SET round1_score=round1_score+1 WHERE id=$1 AND game_id=$2',[g.active_team_id,id]);
    await sql.query("INSERT INTO team_score_events(game_id,team_id,round_no,points,event_type,reference_id) VALUES($1,$2,1,1,'association_correct',$3)",[id,g.active_team_id,word.id]);
   }
   const pending=await sql.query("SELECT count(*)::int AS n FROM team_association_words WHERE game_id=$1 AND team_id=$2 AND result='pending'",[id,g.active_team_id]);
   const expired=new Date(g.round_deadline).getTime()<=Date.now();
   if(expired||pending[0].n===0)await sql.query("UPDATE team_games SET phase='round1_team_done',round_paused_seconds=GREATEST(0,CEIL(EXTRACT(EPOCH FROM (round_deadline-now())))::integer),round_deadline=NULL WHERE id=$1 AND phase='round1_play' AND active_team_id=$2",[id,g.active_team_id]);
   else await sql.query("UPDATE team_games SET current_item=current_item+1 WHERE id=$1 AND phase='round1_play' AND active_team_id=$2",[id,g.active_team_id]);
   return res.status(200).json({ok:true});
  }
  if(action==='closeTime'){
   if(g.status!=='playing'||g.current_round!==1||g.phase!=='round1_play')return res.status(409).json({error:'Немає активного таймера'});
   if(new Date(g.round_deadline).getTime()>Date.now())return res.status(409).json({error:'Час ще не закінчився'});
   await sql.query("UPDATE team_games SET phase='round1_team_done',round_paused_seconds=0,round_deadline=NULL WHERE id=$1 AND phase='round1_play'",[id]);
   return res.status(200).json({ok:true});
  }
  const firstIndex=(g.round1_first_team||1)-1,secondIndex=1-firstIndex;
  if(action==='nextTeam'){
   if(g.phase!=='round1_team_done'||String(g.active_team_id)!==String(teams[firstIndex].id))return res.status(409).json({error:'Спочатку заверши першу команду'});
   await sql.query("UPDATE team_games SET phase='round1_ready',active_team_id=$2,current_item=0,round_paused_seconds=90,round_deadline=NULL WHERE id=$1 AND phase='round1_team_done' AND active_team_id=$3",[id,teams[secondIndex].id,teams[firstIndex].id]);
   return res.status(200).json({ok:true});
  }
  if(action==='finishRound'){
   if(g.phase!=='round1_team_done'||String(g.active_team_id)!==String(teams[secondIndex].id))return res.status(409).json({error:'Спочатку заверши другу команду'});
   await sql.query("UPDATE team_games SET phase='round1_done',round_deadline=NULL WHERE id=$1 AND phase='round1_team_done'",[id]);
   return res.status(200).json({ok:true});
  }
  return res.status(400).json({error:'Невідома дія'});
 }catch(e){return res.status(500).json({error:e.message||'Помилка сервера'})}
}
