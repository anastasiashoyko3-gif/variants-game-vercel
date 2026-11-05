const $=id=>document.getElementById(id);
let selectedGame=null, prompts=[], livePoll=null;
let serverOffset=0, deadline=null, lastLive=null;
function setVisible(id,show){$(id).classList.toggle('hidden',!show)}
function renderLive(data){
 lastLive=data;const g=data.game,active=data.teams.find(t=>String(t.id)===String(g.active_team_id));
 serverOffset=data.serverTime-Date.now();
 deadline=g.round_deadline?new Date(g.round_deadline).getTime():null;
 $('liveStatus').textContent='Статус: '+g.phase+(active?' · '+active.name:'');
 $('liveWord').textContent=data.activeWord||'';
 $('liveScores').replaceChildren();
 for(const team of data.teams){
  const block=document.createElement('div');block.className='card';block.style.margin='0';
  block.textContent=team.name+' — '+(team.round1_score+team.round2_score+team.round3_score)+' балів';
  $('liveScores').append(block);
 }
 setVisible('startRound',g.status==='setup');
 setVisible('correct',g.phase==='round1_play'&&!!data.activeWordId);
 setVisible('skip',g.phase==='round1_play'&&!!data.activeWordId);
 setVisible('closeTime',g.phase==='round1_play'&&deadline!==null&&deadline<=Date.now()+serverOffset);
 setVisible('nextTeam',g.phase==='round1_team_done'&&String(g.active_team_id)===String(data.teams[0].id));
 setVisible('finishRound',g.phase==='round1_team_done'&&String(g.active_team_id)===String(data.teams[1].id));
 $('liveTimer').textContent=deadline?formatTime(Math.max(0,Math.ceil((deadline-Date.now()-serverOffset)/1000))):'00:00';
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
$('startRound').onclick=()=>{if(confirm('Запустити перший раунд? Завдання після цього не можна змінювати.'))actionRound('start')};
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
 $('livePanel').classList.remove('hidden');
 loadLive().catch(e=>message(e.message));
 $('editor').classList.remove('hidden');
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
 $('editor').scrollIntoView({behavior:'smooth'});
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
  const btn=document.createElement('button');btn.className='secondary smallBtn';btn.textContent='Налаштувати раунди';btn.onclick=()=>openGame(game.id).catch(e=>message(e.message));el.append(btn);$('games').append(el);
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
refresh().catch(()=>{});
