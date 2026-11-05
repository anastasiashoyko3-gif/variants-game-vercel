const $=id=>document.getElementById(id);
let selectedGame=null, prompts=[], livePoll=null;
let serverOffset=0, deadline=null, lastLive=null, frozenSeconds=null;
function setVisible(id,show){$(id).classList.toggle('hidden',!show)}
function renderLive(data){
 renderLater(data);
 $('currentRoundTitle').textContent=data.game.status==='finished'?'Фінал · Підсумки':data.game.current_round===1?'Раунд 1 · Асоціації':data.game.current_round===2?'Раунд 2 · Кодові імена':'Раунд 3 · Смішні описи';
 setVisible('liveTimer',data.game.current_round===1&&data.game.status==='playing');
 setVisible('liveWord',data.game.current_round===1&&data.game.status==='playing');
 const playing=data.game.status!=='setup';
 setVisible('setup',!playing);
 setVisible('editorToolbar',!playing);
 if(playing)$('editor').classList.add('hidden');
 setVisible('restartTeamGame',playing);
 lastLive=data;const g=data.game,active=data.teams.find(t=>String(t.id)===String(g.active_team_id));
 serverOffset=data.serverTime-Date.now();
 deadline=g.round_deadline?new Date(g.round_deadline).getTime():null;
 frozenSeconds=g.round_paused_seconds;
 $('liveStatus').textContent='Статус: '+g.phase+(active?' · '+active.name:'');
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
async function loadLive(){if(!selectedGame)return;const response=await fetch('/api/team-live?gameId='+encodeURIComponent(selectedGame),{credentials:'same-origin'});if(!response.ok)throw new Error('Не вдалося отримати стан раунду');renderLive(await response.json())}
async function actionRound(action,result){
 if(!selectedGame)return;
 try{
  await request('/api/team-round1',{action,gameId:selectedGame,...(result?{result}:{})});
  await loadLive();
  if(action==='start')await openGame(selectedGame);
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

function drawBoard(cards){
 $('board').replaceChildren();
 const colors={blue:'#9cc7ff',red:'#ffacbd',neutral:'#e5e1d9',black:'#43404b'};
 cards.forEach(card=>{
  const cell=document.createElement('div');
  cell.textContent=card.word;
  cell.style.cssText='min-width:0;overflow-wrap:anywhere;padding:14px 4px;border-radius:12px;text-align:center;font-weight:800;font-size:clamp(10px,1.5vw,15px);color:#251b33;background:'+colors[card.card_color];
  if(card.card_color==='black')cell.style.color='#fff';
  $('board').append(cell);
 });
}
$('generateBoard').onclick=async()=>{
 if(!selectedGame)return;
 if($('board').children.length&&!confirm('Згенерувати нове поле? Попереднє буде замінено.'))return;
 $('generateBoard').disabled=true;
 try{
  await request('/api/team-game-admin',{action:'generateBoard',gameId:selectedGame,blueTeam:Number($('blueTeam').value)});
  await openGame(selectedGame);message('Нове поле 5×5 збережено');
 }catch(e){message(e.message)}finally{$('generateBoard').disabled=false}
};

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
async function openGame(id){
 const data=await request('/api/team-game-admin',{action:'details',gameId:id});
 selectedGame=id;
 window.teamSelectedGameId=id;
 $('livePanel').classList.remove('hidden');
 $('setup').classList.add('hidden');
 loadLive().catch(e=>message(e.message));
 $('editor').classList.add('hidden');
 setVisible('toggleEditor',data.game.status==='setup');
 $('editorTitle').textContent='Завдання: '+data.game.title;
 for(let i=0;i<2;i++){
  $('wordsLabel'+(i+1)).textContent='Слова: '+data.teams[i].name;
  $('words'+(i+1)).value=data.words.filter(w=>String(w.team_id)===String(data.teams[i].id)).map(w=>w.word).join('\n');
 }
 $('blueTeam').replaceChildren();
 data.teams.forEach((team,i)=>{const opt=document.createElement('option');opt.value=i+1;opt.textContent=team.name;$('blueTeam').append(opt)});
 const role=data.roles.find(r=>r.color==='blue');
 if(role)$('blueTeam').value=String(data.teams.findIndex(t=>String(t.id)===String(role.team_id))+1);
 drawBoard(data.cards);
 prompts=data.prompts.map(p=>({description:p.description,answer:p.answer}));drawPrompts();
 const locked=data.game.status!=='setup';
 for(const id of ['words1','words2','description','answer','addPrompt','saveContent','blueTeam','generateBoard'])$(id).disabled=locked;
 message(locked?'Гра вже запущена: редагування закрито':'Можна редагувати завдання');
 $('livePanel').scrollIntoView({behavior:'smooth'});
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
  message('Завдання успішно збережені в Neon');
 }catch(e){message(e.message)}finally{$('saveContent').disabled=false}
};

function message(text){$('message').textContent=text}
async function request(url,body){
 const res=await fetch(url,{method:body?'POST':'GET',headers:{'Content-Type':'application/json'},credentials:'same-origin',...(body?{body:JSON.stringify(body)}:{})});
 const data=await res.json().catch(()=>({}));
 if(!res.ok)throw new Error(data.error||data.message||'Помилка запиту');
 return data;
}
async function refresh(){
 const data=await request('/api/team-game-admin');
 $('login').classList.add('hidden');$('setup').classList.remove('hidden');
 $('games').replaceChildren();
 for(const game of data.games){
  const el=document.createElement('div');el.className='gameItem';
  el.textContent=game.title+' · код: '+game.invite_code+' · '+game.status;
  const btn=document.createElement('button');btn.className='secondary smallBtn';btn.textContent='Налаштувати раунди';btn.onclick=()=>openGame(game.id).catch(e=>message(e.message));el.append(btn);
  const del=document.createElement('button');del.className='secondary smallBtn';del.textContent='Видалити';
  del.onclick=async()=>{
    if(!confirm('Назавжди видалити гру «'+game.title+'» та всі її завдання й бали? Це неможливо скасувати.'))return;
    del.disabled=true;
    try{
      await request('/api/team-game-admin',{action:'delete',gameId:game.id});
      if(String(selectedGame)===String(game.id)){selectedGame=null;$('editor').classList.add('hidden');$('livePanel').classList.add('hidden');lastLive=null}
      await refresh();message('Гру видалено');
    }catch(e){message(e.message);del.disabled=false}
  };
  el.append(del);$('games').append(el);
 }
 if(!data.games.length)$('games').textContent='Ігор поки немає';
}
$('loginBtn').onclick=async()=>{
 try{
  const res=await fetch('/api/admin-login',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',body:JSON.stringify({password:$('password').value})});
  if(!res.ok)throw new Error('Неправильний пароль або помилка входу');
  $('password').value='';await refresh();message('Вхід успішний');
 }catch(e){message(e.message)}
};
$('create').onclick=async()=>{
 $('create').disabled=true;
 try{
  const teams=[1,2].map(i=>({name:$('team'+i).value.trim(),color:$('color'+i).value}));
  const data=await request('/api/team-game-admin',{action:'create',title:$('title').value,teams});
  message('Гру створено! Код: '+data.game.invite_code);
  await refresh();
 }catch(e){message(e.message)}finally{$('create').disabled=false}
};
$('refresh').onclick=()=>refresh().catch(e=>message(e.message));
refresh().then(()=>{
 const id=new URLSearchParams(location.search).get('gameId');
 if(id&&/^\\d+$/.test(id))openGame(Number(id)).catch(e=>message(e.message));
}).catch(()=>{});

function renderLater(data){
 const g=data.game,teams=data.teams;
 const total=t=>Number(t.round1_score)+Number(t.round2_score)+Number(t.round3_score);
 $('liveScores').textContent=teams.map(t=>t.name).join(' : ')+'   '+total(teams[0])+' : '+total(teams[1]);
 $('shareLinks').replaceChildren();
 const viewer=document.createElement('a');viewer.href='/team-game-live.html?gameId='+selectedGame+'&code='+encodeURIComponent(data.gameCode||'');viewer.textContent='Екран глядачів';viewer.target='_blank';
 $('shareLinks').append(viewer);
 if(data.roleLinks)for(const role of data.roleLinks){
  const team=teams.find(t=>String(t.id)===String(role.teamId));
  const a=document.createElement('a');a.href='/team-game-live.html?gameId='+selectedGame+'&code='+encodeURIComponent(data.gameCode||'')+'&roleToken='+role.token;a.target='_blank';a.textContent='Екран команди '+team.name;a.style.display='block';$('shareLinks').append(a);
 }
 setVisible('round2Panel',g.phase==='round1_done'||g.current_round===2);
 setVisible('round2Start',g.phase==='round1_done');
 setVisible('switchTeam',g.phase==='round2_play');
 setVisible('endRound2',g.phase==='round2_play');
 $('round2Status').textContent='Хід: '+(teams.find(t=>String(t.id)===String(g.active_team_id))?.name||'—');
 $('round2Board').replaceChildren();
 for(const card of data.cards||[]){
  const btn=document.createElement('button');btn.className='secondary';
  btn.textContent=card.word;btn.style.cssText='padding:10px 2px;min-width:0;overflow-wrap:anywhere;font-size:12px;background:'+({blue:'#9cc7ff',red:'#ffacbd',neutral:'#e5e1d9',black:'#43404b'}[card.card_color]||'#fff')+';color:'+(card.card_color==='black'?'white':'#251b33');
  btn.disabled=g.phase!=='round2_play'||card.revealed;
  if(card.revealed)btn.style.opacity='.5';
  btn.onclick=()=>{if(confirm('Відкрити картку «'+card.word+'»?'))playAction('reveal',{position:card.position})};
  $('round2Board').append(btn);
 }
 setVisible('round3Panel',g.phase==='round2_done'||g.current_round===3);
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
for(const action of ['round2Start','switchTeam','endRound2','round3Start','nextPrompt','finishGame'])
 $(action).onclick=()=>playAction(action);

$('toggleEditor').onclick=()=>{$('editor').classList.remove('hidden');$('editor').scrollIntoView({behavior:'smooth'})};
$('closeTeamEditor').onclick=()=>{$('editor').classList.add('hidden');$('livePanel').scrollIntoView({behavior:'smooth'})};
$('restartTeamGame').onclick=async()=>{
 if(!selectedGame||!confirm('Почати гру заново? Усі бали та проходження раундів обнуляться. Слова, описи й поле залишаться.'))return;
 try{
  await request('/api/team-game-admin',{action:'restart',gameId:selectedGame});
  $('editor').classList.add('hidden');
  await openGame(selectedGame);await refresh();message('Гру скинуто. Можна починати заново.');
 }catch(e){message(e.message)}
};

function backToTeamGames(){
 selectedGame=null;lastLive=null;deadline=null;
 $('editor').classList.add('hidden');
 $('editorToolbar').classList.add('hidden');
 $('livePanel').classList.add('hidden');
 $('setup').classList.remove('hidden');
 refresh().catch(e=>message(e.message));
 window.scrollTo({top:0,behavior:'smooth'});
}
$('backToTeamGames').onclick=backToTeamGames;
$('backFromLive').onclick=backToTeamGames;
