const root=document.getElementById('teamAdmin');
const $=id=>root.querySelector('#'+id);
let returnToMenu=()=>{};
export function configureTeamAdmin(onBack){returnToMenu=onBack}
export function closeTeamAdmin(){selectedGame=null;lastLive=null;deadline=null;root.classList.add('hidden')}

let selectedGame=null, prompts=[];
let serverOffset=0, deadline=null, lastLive=null, frozenSeconds=null;
function setVisible(id,show){$(id).classList.toggle('hidden',!show)}
function renderLive(data){
 renderLater(data);
 $('currentRoundTitle').textContent=data.game.status==='finished'?'Фінал · Підсумки':data.game.current_round===1?'Раунд 1 · Асоціації':data.game.current_round===2?'Раунд 2 · Кодові імена':'Раунд 3 · Смішні описи';
 setVisible('liveTimer',data.game.current_round===1&&data.game.status==='playing'&&data.game.phase!=='round1_done');
 setVisible('liveWord',data.game.current_round===1&&data.game.status==='playing'&&data.game.phase!=='round1_done');
 const playing=data.game.status!=='setup';

 setVisible('editorToolbar',!playing);
 if(playing)$('editor').classList.add('hidden');
 setVisible('livePanel',playing);
 setVisible('restartTeamGame',playing);
 lastLive=data;const g=data.game,active=data.teams.find(t=>String(t.id)===String(g.active_team_id));
 serverOffset=data.serverTime-Date.now();
 deadline=g.round_deadline?new Date(g.round_deadline).getTime():null;
 frozenSeconds=g.round_paused_seconds;
 const phases={setup:'Підготовка',round1_ready:'Готові до запуску таймера',round1_play:'Триває хід',round1_team_done:'Хід команди завершено',round1_done:'Перший раунд завершено',round2_play:'Триває другий раунд',round2_done:'Другий раунд завершено',round3_play:'Чекаємо відповідь',round3_wait_next:'Правильну відповідь зараховано',finished:'Гру завершено'};
 $('liveStatus').textContent=(phases[g.phase]||g.phase)+(active&&g.phase!=='round1_done'?' · '+active.name:'');
 $('liveWord').textContent=data.activeWord||'';
 $('liveScores').textContent=data.teams[0].name+'  '+(Number(data.teams[0].round1_score)+Number(data.teams[0].round2_score)+Number(data.teams[0].round3_score))+' : '+(Number(data.teams[1].round1_score)+Number(data.teams[1].round2_score)+Number(data.teams[1].round3_score))+'  '+data.teams[1].name;
 setVisible('startRound',g.status==='setup');
 setVisible('startTimer',g.phase==='round1_ready');
 setVisible('correct',g.phase==='round1_play'&&!!data.activeWordId);
 setVisible('skip',g.phase==='round1_play'&&!!data.activeWordId);
 setVisible('closeTime',g.phase==='round1_play'&&deadline!==null&&deadline<=Date.now()+serverOffset);
 setVisible('nextTeam',g.phase==='round1_team_done'&&String(g.active_team_id)===String(data.teams[0].id));
 setVisible('finishRound',g.phase==='round1_team_done'&&String(g.active_team_id)===String(data.teams[1].id));
 $('liveTimer').textContent=deadline?formatTime(Math.max(0,Math.ceil((deadline-Date.now()-serverOffset)/1000))):formatTime(frozenSeconds??0);
}
function formatTime(seconds){return String(Math.floor(seconds/60)).padStart(2,'0')+':'+String(seconds%60).padStart(2,'0')}
async function loadLive(){if(!selectedGame)return;const requestedGame=selectedGame;const response=await fetch('/api/team-live?gameId='+encodeURIComponent(selectedGame),{credentials:'same-origin'});if(!response.ok)throw new Error('Не вдалося отримати стан раунду');const data=await response.json();if(String(requestedGame)===String(selectedGame))renderLive(data)}
async function actionRound(action,result){
 if(!selectedGame)return;
 try{
  await request('/api/team-round1',{action,gameId:selectedGame,...(result?{result}:{})});
  await loadLive();
  if(action==='start')await openTeamGame(selectedGame);
 }catch(e){message(e.message)}
}
$('startRound').onclick=()=>{if(confirm('Почати гру? Таймер запуститься окремою кнопкою.'))actionRound('start')};
$('startTimer').onclick=()=>actionRound('startTimer');
$('correct').onclick=()=>actionRound('score','correct');
$('skip').onclick=()=>actionRound('score','skipped');
$('closeTime').onclick=()=>actionRound('closeTime');
$('nextTeam').onclick=()=>actionRound('nextTeam');
$('finishRound').onclick=()=>actionRound('finishRound');
setInterval(()=>{
 if(!lastLive)return;
 if(deadline)$('liveTimer').textContent=formatTime(Math.max(0,Math.ceil((deadline-Date.now()-serverOffset)/1000)));
 if(lastLive.game.phase==='round1_play'&&deadline&&deadline<=Date.now()+serverOffset)setVisible('closeTime',true);
},500);
setInterval(()=>{if(selectedGame)loadLive().catch(()=>{})},2000);

function drawPrompts(){
 $('prompts').replaceChildren();
 prompts.forEach((p,i)=>{
  const row=document.createElement('div');row.className='gameItem';
  const info=document.createElement('div');info.style.whiteSpace='pre-wrap';info.textContent=(i+1)+'. '+p.description+' — '+p.answer;
  const edit=document.createElement('button');edit.className='secondary smallBtn';edit.textContent='Редагувати';
  edit.onclick=()=>{const d=window.prompt('Опис',p.description);if(d===null)return;const a=window.prompt('Відповідь',p.answer);if(a===null)return;if(!d.trim()||!a.trim())return message('Опис і відповідь не можуть бути порожні');prompts[i]={description:d.trim(),answer:a.trim()};drawPrompts()};
  const remove=document.createElement('button');remove.className='danger smallBtn';remove.textContent='Видалити';remove.onclick=()=>{prompts.splice(i,1);drawPrompts()};
  const up=document.createElement('button');up.className='secondary smallBtn';up.textContent='↑';up.disabled=i===0;up.onclick=()=>{[prompts[i-1],prompts[i]]=[prompts[i],prompts[i-1]];drawPrompts()};
  const down=document.createElement('button');down.className='secondary smallBtn';down.textContent='↓';down.disabled=i===prompts.length-1;down.onclick=()=>{[prompts[i+1],prompts[i]]=[prompts[i],prompts[i+1]];drawPrompts()};
  const actions=document.createElement('div');actions.className='actions';actions.append(edit,up,down,remove);row.append(info,actions);$('prompts').append(row);
 });
}
export async function openTeamGame(id){
 const data=await request('/api/team-game-admin',{action:'details',gameId:id});
 selectedGame=id;
 window.teamSelectedGameId=id;
 $('livePanel').classList.remove('hidden');
 root.classList.remove('hidden');
 await loadLive();
 setVisible('editor',data.game.status==='setup');
 setVisible('toggleEditor',data.game.status==='setup');
 $('editorTitle').textContent='Завдання: '+data.game.title;
 for(let i=0;i<2;i++){
  $('wordsLabel'+(i+1)).textContent='Слова: '+data.teams[i].name;
  $('words'+(i+1)).value=data.words.filter(w=>String(w.team_id)===String(data.teams[i].id)).map(w=>w.word).join('\n');
 }
 $('blueTeam').replaceChildren(new Option('Обери команду',''));
 data.teams.forEach((team,i)=>$('blueTeam').append(new Option(team.name,String(i+1))));
 prompts=data.prompts.map(p=>({description:p.description,answer:p.answer}));drawPrompts();
 const locked=data.game.status!=='setup';
 for(const id of ['words1','words2','description','answer','addPrompt','saveContent'])$(id).disabled=locked;
 message(locked?'Гра вже запущена: редагування закрито':'Можна редагувати завдання');
 root.scrollIntoView({behavior:'smooth'});
}
$('addPrompt').onclick=()=>{
 const description=$('description').value.trim(),answer=$('answer').value.trim();
 if(!description||!answer)return message('Заповни опис та відповідь');
 prompts.push({description,answer});$('description').value='';$('answer').value='';drawPrompts();
};
$('saveContent').onclick=async()=>{
 if(!selectedGame)return;
 $('saveContent').disabled=true;
 try{
  const wordLists=[1,2].map(i=>$('words'+i).value.split(/\r?\n/).map(s=>s.trim()).filter(Boolean));
  await request('/api/team-game-admin',{action:'saveContent',gameId:selectedGame,wordLists,prompts});
  message('Завдання успішно збережені');
 }catch(e){message(e.message)}finally{$('saveContent').disabled=false}
};

function message(text){$('message').textContent=text}
async function request(url,body){
 const res=await fetch(url,{method:body?'POST':'GET',headers:{'Content-Type':'application/json'},credentials:'same-origin',...(body?{body:JSON.stringify(body)}:{})});
 const data=await res.json().catch(()=>({}));
 if(!res.ok)throw new Error(data.error||data.message||'Помилка запиту');
 return data;
}
function renderLater(data){
 const g=data.game,teams=data.teams;
 const total=t=>Number(t.round1_score)+Number(t.round2_score)+Number(t.round3_score);
 $('liveScores').textContent=teams.map(t=>t.name).join(' : ')+'   '+total(teams[0])+' : '+total(teams[1]);
 $('shareLinks').replaceChildren();
 const viewer=document.createElement('a');viewer.href='/team-game-live.html?gameId='+selectedGame+'&code='+encodeURIComponent(data.gameCode||'');viewer.className='button secondary';viewer.textContent='Екран глядачів';viewer.target='_blank';
 $('shareLinks').append(viewer);
 if(data.roleLinks)for(const role of data.roleLinks){
  const team=teams.find(t=>String(t.id)===String(role.teamId));
  const a=document.createElement('a');a.href='/team-game-live.html?gameId='+selectedGame+'&code='+encodeURIComponent(data.gameCode||'')+'&roleToken='+role.token;a.target='_blank';a.className='button secondary';a.textContent='Екран команди '+team.name;a.style.display='block';$('shareLinks').append(a);
 }
 setVisible('round2Panel',g.status==='playing'&&(g.phase==='round1_done'||(g.current_round===2&&g.phase!=='round2_done')));
 setVisible('round2Start',g.phase==='round1_done');
 setVisible('colorSelection',g.phase==='round1_done');
 $('round2Start').disabled=!$('blueTeam').value;
 setVisible('switchTeam',g.phase==='round2_play');
 setVisible('endRound2',g.phase==='round2_play');
 const blue=teams.find(t=>(data.roles||[]).some(r=>r.color==='blue'&&String(r.team_id)===String(t.id)));
 const red=teams.find(t=>(data.roles||[]).some(r=>r.color==='red'&&String(r.team_id)===String(t.id)));
 $('round2Status').textContent=g.phase==='round1_done'?'Поле ще не згенеровано. Кольори обирає ведуча.':(blue&&red?'Синя: '+blue.name+' · Червона: '+red.name+' · ':'')+'Хід: '+(teams.find(t=>String(t.id)===String(g.active_team_id))?.name||'—');
 $('round2Board').replaceChildren();
 for(const card of data.cards||[]){
  const btn=document.createElement('button');btn.className='secondary';
  btn.textContent=card.word;btn.style.cssText='padding:10px 2px;min-width:0;overflow-wrap:anywhere;font-size:12px;background:'+({blue:'#9cc7ff',red:'#ffacbd',neutral:'#e5e1d9',black:'#43404b'}[card.card_color]||'#fff')+';color:'+(card.card_color==='black'?'white':'#251b33');
  btn.disabled=g.phase!=='round2_play'||card.revealed;
  if(card.revealed)btn.style.opacity='.5';
  btn.onclick=()=>{if(confirm('Відкрити картку «'+card.word+'»?'))playAction('reveal',{position:card.position})};
  $('round2Board').append(btn);
 }
 setVisible('round3Panel',g.status==='playing'&&(g.phase==='round2_done'||g.current_round===3));
 setVisible('round3Start',g.phase==='round2_done');
 $('round3Description').textContent=data.prompt?.description||'';
 $('round3Answer').textContent=data.prompt?'Відповідь для адміна: '+data.prompt.answer:'';
 $('guessButtons').replaceChildren();
 if(g.phase==='round3_play')for(const t of teams){
  for(const correct of [false,true]){
   const b=document.createElement('button');b.className=correct?'':'secondary';
   b.textContent=t.name+' · '+(correct?'+3':'−3');
   b.onclick=()=>playAction('guess',{teamId:t.id,correct});
   $('guessButtons').append(b);
  }
 }
 setVisible('nextPrompt',g.phase==='round3_wait_next'&&!data.isLastPrompt);
 setVisible('finishGame',g.phase==='round3_wait_next'&&data.isLastPrompt);
 const a=total(teams[0]),b=total(teams[1]);
 $('winner').textContent=g.status==='finished'?(a===b?'Нічия!':('Перемогла '+(a>b?teams[0].name:teams[1].name)+'!')):'';
}
async function playAction(action,extra={}){
 try{await request('/api/team-play',{action,gameId:selectedGame,...extra});await loadLive();message('Збережено')}
 catch(e){message(e.message)}
}
for(const action of ['switchTeam','endRound2','round3Start','nextPrompt','finishGame'])
 $(action).onclick=()=>playAction(action);

$('blueTeam').onchange=()=>{$('round2Start').disabled=!$('blueTeam').value};
$('round2Start').onclick=async()=>{
 $('round2Start').disabled=true;
 await playAction('round2Start',{blueTeam:Number($('blueTeam').value)});
 $('round2Start').disabled=!$('blueTeam').value;
};

$('toggleEditor').onclick=()=>{$('editor').classList.remove('hidden');$('editor').scrollIntoView({behavior:'smooth'})};
$('closeTeamEditor').onclick=()=>{$('editor').classList.add('hidden');$('livePanel').scrollIntoView({behavior:'smooth'})};
$('restartTeamGame').onclick=async()=>{
 if(!selectedGame||!confirm('Почати гру заново? Усі бали та проходження раундів обнуляться. Слова та описи залишаться. Кольори й нове поле обереш після першого раунду.'))return;
 try{
  await request('/api/team-game-admin',{action:'restart',gameId:selectedGame});
  $('editor').classList.add('hidden');
  await openTeamGame(selectedGame);message('Гру скинуто. Можна починати заново.');
 }catch(e){message(e.message)}
};

function backToTeamGames(){closeTeamAdmin();returnToMenu()}
$('backToTeamGames').onclick=backToTeamGames;
$('backFromLive').onclick=backToTeamGames;
