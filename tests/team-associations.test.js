import test from 'node:test';
import assert from 'node:assert/strict';
import { createHarness } from './harness.js';
import { CODENAMES_WORDS, WORD_CATEGORIES } from '../api/_codenames-data.js';

async function fixture(h) {
 const call=async(api,body,options)=>{const r=await h.call(api,body,options);assert.equal(r.status,200,JSON.stringify(r.data));return r.data};
 const {game}=await call('team-game-admin',{action:'create',teams:[{name:'Сонячні котики'},{name:'Нічні сови'}]});
 const gameId=game.id;
 await call('team-game-admin',{action:'saveContent',gameId,wordLists:[['слово першої'],['слово другої']],prompts:[
  {hints:['Сліди пальців','Павутина на склі','Паніка на одному відсотку'],answer:'Телефон'},
  {hints:['Невдалий момент','Удар навпомацки','Ще п’ять хвилин'],answer:'Будильник'},
  {hints:['Спиці','Суперечка з вітром','Сухий острів посеред зливи'],answer:'Парасолька'}
 ]});
 const details=await call('team-game-admin',{action:'details',gameId});
 return {call,gameId,code:game.invite_code,teams:details.teams};
}

test('either team can start round 1, and both get one separately started timer',async()=>{
 for(const firstTeam of [1,2]){
  const h=await createHarness();
  try{
   const f=await fixture(h),{gameId,teams,call}=f;
   await call('team-round1',{action:'start',gameId,firstTeam});
   let live=await call('team-live',null,{query:{gameId}});
   assert.equal(live.game.round1_first_team,firstTeam);
   assert.equal(String(live.game.active_team_id),String(teams[firstTeam-1].id));
   assert.equal(live.game.round_deadline,null);
   await call('team-round1',{action:'startTimer',gameId});
   await call('team-round1',{action:'score',gameId,result:'correct'});
   assert.equal((await h.call('team-round1',{action:'finishRound',gameId})).status,409);
   await call('team-round1',{action:'nextTeam',gameId});
   live=await call('team-live',null,{query:{gameId}});
   assert.equal(String(live.game.active_team_id),String(teams[2-firstTeam].id));
   assert.equal(live.game.round_deadline,null);
   await call('team-round1',{action:'startTimer',gameId});
   await call('team-round1',{action:'score',gameId,result:'correct'});
   await call('team-round1',{action:'finishRound',gameId});
   assert.equal((await call('team-live',null,{query:{gameId}})).game.phase,'round1_done');
  }finally{await h.db.close()}
 }
});

test('only the host reveals clues; unlimited -2 attempts never advance them; awards are 5/3/1',async()=>{
 const h=await createHarness();
 try{
  const {call,gameId,code,teams}=await fixture(h);
  await h.db.query("UPDATE team_games SET status='playing',current_round=2,phase='round2_done' WHERE id=$1",[gameId]);
  await call('team-play',{action:'round3Start',gameId});
  const viewer=()=>call('team-live',null,{public:true,query:{gameId,code}});
  let v=await viewer();assert.deepEqual(v.prompt.hints,['Сліди пальців']);assert.equal(v.prompt.answer,undefined);assert.equal(v.prompt.description.includes('Павутина'),false);
  const admin=await call('team-live',null,{query:{gameId}});
  assert.equal(admin.prompt.points,5);assert.equal(admin.prompt.hints.length,3);
  const role=admin.roleLinks[0].token;
  const teamView=await call('team-live',null,{public:true,query:{gameId,code,roleToken:role}});
  assert.equal(teamView.prompt.hints.length,1);assert.equal(teamView.prompt.answer,undefined);
  assert.equal((await h.call('team-play',{action:'revealHint',gameId},{public:true})).status,401);
  for(let n=0;n<6;n++)for(const t of teams)await call('team-play',{action:'guess',gameId,teamId:t.id,correct:false,hintStage:1,promptOrder:0});
  v=await viewer();assert.equal(v.game.round3_hint,1);assert.equal(v.game.phase,'round3_play');assert.equal(v.prompt.hints.length,1);
  assert.ok(v.teams.every(t=>t.round3_score===-12));
  await call('team-play',{action:'revealHint',gameId,hintStage:1,promptOrder:0});
  assert.equal((await h.call('team-play',{action:'revealHint',gameId,hintStage:1,promptOrder:0})).status,409);
  assert.equal((await h.call('team-play',{action:'guess',gameId,teamId:teams[0].id,correct:true,hintStage:1})).status,409);
  v=await viewer();assert.equal(v.prompt.hints.length,2);assert.equal(v.prompt.description.includes('Паніка'),false);
  await call('team-play',{action:'guess',gameId,teamId:teams[0].id,correct:true,hintStage:2,promptOrder:0});
  v=await viewer();assert.equal(v.teams[0].round3_score,-9);
  assert.equal((await h.call('team-play',{action:'revealHint',gameId})).status,409);
  await call('team-play',{action:'nextPrompt',gameId});
  v=await viewer();assert.equal(v.prompt.hintStage,1);assert.equal(v.prompt.hints.length,1);
  await call('team-play',{action:'guess',gameId,teamId:teams[1].id,correct:true,hintStage:1,promptOrder:1});
  assert.equal((await viewer()).teams[1].round3_score,-7);
  await call('team-play',{action:'nextPrompt',gameId});
  await call('team-play',{action:'revealHint',gameId,hintStage:1,promptOrder:2});
  await call('team-play',{action:'revealHint',gameId,hintStage:2,promptOrder:2});
  assert.equal((await h.call('team-play',{action:'revealHint',gameId,hintStage:3,promptOrder:2})).status,409);
  await call('team-play',{action:'guess',gameId,teamId:teams[0].id,correct:true,hintStage:3,promptOrder:2});
  v=await viewer();assert.equal(v.teams[0].round3_score,-8);
  await call('team-play',{action:'finishGame',gameId});assert.equal((await viewer()).game.phase,'round3_done');
  await call('team-play',{action:'showFinalScore',gameId});assert.equal((await viewer()).game.phase,'finished');
  await call('team-restart',{gameId});
  const reset=await call('team-live',null,{query:{gameId}});assert.equal(reset.game.round3_hint,1);assert.ok(reset.teams.every(t=>t.round3_score===0));
 }finally{await h.db.close()}
});

test('old deployments upgrade additively and retain saved descriptions',async()=>{
 const h=await createHarness({legacySchema:true});
 try{
  await h.db.exec("INSERT INTO team_games(title,invite_code) VALUES('Стара гра','old'); INSERT INTO team_game_teams(game_id,name,color,display_order) VALUES(1,'A','#80758c',1),(1,'B','#80758c',2); INSERT INTO team_absurd_prompts(game_id,prompt_order,description,answer) VALUES(1,0,'Старий опис без змін','Відповідь')");
  const r=await h.call('team-game-admin',{action:'details',gameId:1});assert.equal(r.status,200,JSON.stringify(r.data));
  assert.equal(r.data.prompts[0].description,'Старий опис без змін');assert.deepEqual(r.data.prompts[0].hints,['Старий опис без змін']);
  assert.equal(r.data.game.round1_first_team,1);
  const bad=await h.call('team-game-admin',{action:'saveContent',gameId:1,wordLists:[[],[]],prompts:[{hints:['одна','дві'],answer:'Ні'}]});assert.equal(bad.status,400);
  assert.equal((await h.db.query('SELECT description FROM team_absurd_prompts')).rows[0].description,'Старий опис без змін');
 }finally{await h.db.close()}
});

test('curated bank is large, removes unused household words and preserves saved boards',async()=>{
 assert.ok(CODENAMES_WORDS.length>=1500);assert.equal(new Set(CODENAMES_WORDS.map(w=>w.toLocaleLowerCase('uk'))).size,CODENAMES_WORDS.length);
 for(const word of ['ложка','стілець','чайник','каструля','пральна машина'])assert.ok(!CODENAMES_WORDS.includes(word));
 for(const category of ['Тварини','Країни','Міста','Страви'])assert.ok(WORD_CATEGORIES[category].length>=100);
 const h=await createHarness();
 try{
  const f=await fixture(h),other=await fixture(h);
  await h.db.exec("INSERT INTO team_codenames_bank(word) VALUES('ложка'),('стілець')");
  await h.db.exec("INSERT INTO team_codenames_bank(word,used_at) VALUES('венера',now())");
  const spoon=(await h.db.query("SELECT id FROM team_codenames_bank WHERE word='ложка'")).rows[0].id;
  await h.db.query("INSERT INTO team_codenames_cards(game_id,position,word_id,card_color) VALUES($1,0,$2,'blue')",[other.gameId,spoon]);
  await h.db.query("UPDATE team_games SET status='playing',phase='round1_done' WHERE id=$1",[f.gameId]);
  await f.call('team-play',{action:'round2Start',gameId:f.gameId,blueTeam:1});
  assert.equal((await h.db.query("SELECT id FROM team_codenames_bank WHERE word='стілець'")).rows.length,0);
  assert.ok((await h.db.query("SELECT used_at FROM team_codenames_bank WHERE word='Венера'")).rows[0].used_at);
  assert.equal((await h.db.query('SELECT word_id FROM team_codenames_cards WHERE game_id=$1',[other.gameId])).rows[0].word_id,spoon);
  const details=await f.call('team-game-admin',{action:'details',gameId:f.gameId});assert.ok(details.cards.every(c=>CODENAMES_WORDS.includes(c.word)));
 }finally{await h.db.close()}
});

test('failed scoring and content saves roll back without losing points or tasks',async()=>{
 const h=await createHarness();
 try{
  const {call,gameId,teams}=await fixture(h);
  await h.db.exec("CREATE FUNCTION reject_prompt() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test save failure'; END $$; CREATE TRIGGER reject_prompt BEFORE INSERT ON team_absurd_prompts FOR EACH ROW EXECUTE FUNCTION reject_prompt()");
  const save=await h.call('team-game-admin',{action:'saveContent',gameId,wordLists:[['нове'],['нове']],prompts:[{hints:['a','b','c'],answer:'new'}]});assert.equal(save.status,500);
  const retained=await call('team-game-admin',{action:'details',gameId});assert.equal(retained.prompts[0].answer,'Телефон');assert.equal(retained.words[0].word,'слово першої');
  await h.db.exec('DROP TRIGGER reject_prompt ON team_absurd_prompts');
  await h.db.query("UPDATE team_games SET status='playing',current_round=3,phase='round3_play' WHERE id=$1",[gameId]);
  await h.db.exec("CREATE FUNCTION reject_score() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test score failure'; END $$; CREATE TRIGGER reject_score BEFORE INSERT ON team_score_events FOR EACH ROW EXECUTE FUNCTION reject_score()");
  const score=await h.call('team-play',{action:'guess',gameId,teamId:teams[0].id,correct:true});assert.equal(score.status,500);
  const state=await call('team-live',null,{query:{gameId}});assert.equal(state.game.phase,'round3_play');assert.equal(state.teams[0].round3_score,0);
  assert.equal((await h.db.query('SELECT solved_by_team_id FROM team_absurd_prompts WHERE game_id=$1 AND prompt_order=0',[gameId])).rows[0].solved_by_team_id,null);
 }finally{await h.db.close()}
});
