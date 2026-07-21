import { supabase, escapeHtml, avatarHtml, hostAvatarHtml, nowSec, safeJson, uploadPublicFile } from './supabaseClient.js';

let game=null, player=null, questions=[], currentQuestion=null, players=[], answers=[], votes=[], wordEvents=[], channel=null, timerInterval=null, pollInterval=null, loading=false;
const $=id=>document.getElementById(id);
const joinCard=$('joinCard'), playCard=$('playCard'), stateBox=$('gameState');

const urlCode=readInviteCode();
$('joinBtn').onclick=joinGame;
$('leaveBtn').onclick=()=>{localStorage.removeItem('player_game_id');localStorage.removeItem('player_id');location.reload()};
restorePlayerSession();

async function restorePlayerSession(){
  const gameId=localStorage.getItem('player_game_id'), playerId=localStorage.getItem('player_id'); if(!gameId||!playerId)return;
  const [gRes,pRes]=await Promise.all([supabase.from('games').select('*').eq('id',gameId).single(),supabase.from('players').select('*').eq('id',playerId).single()]);
  if(gRes.error||pRes.error||!gRes.data||!pRes.data)return;
  game=gRes.data;player=pRes.data;joinCard.classList.add('hidden');playCard.classList.remove('hidden');$('meName').textContent=player.name;await refreshState();subscribe();
}

async function joinGame(){
  const code=urlCode, name=$('playerName').value.trim(), pin=$('playerPin').value.trim(), password=$('gamePassword').value.trim();
  let avatar=$('playerAvatar').value.trim(); const file=$('playerAvatarFile')?.files?.[0];
  if(!code){$('joinMsg').textContent='Відкрий гру через інвайт-посилання від ведучої.';return}
  if(!name||!pin||!password){$('joinMsg').textContent='Заповни імʼя, PIN і пароль';return}
  try{if(file)avatar=await uploadPublicFile(file,'player-avatars')}catch(e){$('joinMsg').textContent='Фото не завантажилось: '+e.message;return}
  const foundGame=await findGameByInviteCode(code);
  if(!foundGame){$('joinMsg').textContent=`Гру не знайдено. Код із посилання: ${code}. Скопіюй нове посилання з адмінки.`;return}
  if(password!==(foundGame.game_password||'game123')){$('joinMsg').textContent='Неправильний пароль гри';return}
  game=foundGame;
  const {data:existing}=await supabase.from('players').select('*').eq('game_id',game.id).ilike('name',name).eq('pin',pin).maybeSingle();
  if(existing){player=existing;if(avatar&&avatar!==existing.avatar){const {data}=await supabase.from('players').update({avatar}).eq('id',existing.id).select().single();if(data)player=data}}
  else{
    const {data:newPlayer,error:playerErr}=await supabase.from('players').insert({game_id:game.id,name,pin,avatar:avatar||'',score:0,created_at:new Date().toISOString()}).select().single();
    if(playerErr){$('joinMsg').textContent=playerErr.message;return}
    player=newPlayer;
  }
  localStorage.setItem('player_game_id',game.id);localStorage.setItem('player_id',player.id);
  joinCard.classList.add('hidden');playCard.classList.remove('hidden');$('meName').textContent=player.name;
  await refreshState();subscribe();
}

function readInviteCode(){
  const params=new URLSearchParams(location.search);
  const raw=params.get('code')||params.get('game')||'';
  return normalizeInviteCode(raw);
}

function normalizeInviteCode(value){
  return String(value||'').trim().replace(/[^a-z0-9]/gi,'').toUpperCase();
}

async function findGameByInviteCode(code){
  const normalized=normalizeInviteCode(code);
  if(!normalized)return null;

  const exact=await supabase.from('games').select('*').eq('invite_code',normalized).maybeSingle();
  if(!exact.error&&exact.data)return exact.data;

  const insensitive=await supabase.from('games').select('*').ilike('invite_code',normalized).maybeSingle();
  if(!insensitive.error&&insensitive.data)return insensitive.data;

  const {data,error}=await supabase.from('games').select('*');
  if(error)return null;
  return (data||[]).find(item=>normalizeInviteCode(item.invite_code)===normalized)||null;
}

async function refreshState(){
  if(!game||loading)return;

  const wasTyping = document.activeElement && document.activeElement.id === 'answerText';
  const oldPhase = game?.phase;
  const oldQuestionId = currentQuestion?.id;

  loading=true;
  try{
    const [gRes,qRes,pRes,eRes]=await Promise.all([supabase.from('games').select('*').eq('id',game.id).single(),supabase.from('questions').select('*').eq('game_id',game.id).order('q_order',{ascending:true}),supabase.from('players').select('*').eq('game_id',game.id),supabase.from('word_events').select('*').eq('game_id',game.id).order('id',{ascending:false})]);
    if(!gRes.error&&gRes.data)game=gRes.data;questions=qRes.data||[];players=pRes.data||[];currentQuestion=questions[Number(game.current_q||0)]||null;
    wordEvents=eRes.data||[];
    if(currentQuestion){const [aRes,vRes]=await Promise.all([supabase.from('answers').select('*').eq('question_id',currentQuestion.id),supabase.from('votes').select('*').eq('question_id',currentQuestion.id)]);answers=aRes.data||[];votes=vRes.data||[]}else{answers=[];votes=[]}

    const stillSameAnsweringScreen =
      wasTyping &&
      oldPhase === 'answering' &&
      game.phase === 'answering' &&
      oldQuestionId === currentQuestion?.id;

    if(!stillSameAnsweringScreen) render();
  }finally{loading=false}
}

function subscribe(){
  if(channel)supabase.removeChannel(channel); if(pollInterval)clearInterval(pollInterval);
  channel=supabase.channel('player-game-'+game.id)
  .on('postgres_changes',{event:'*',schema:'public',table:'games',filter:'id=eq.'+game.id},p=>{game=p.new;refreshState()})
  .on('postgres_changes',{event:'*',schema:'public',table:'questions',filter:'game_id=eq.'+game.id},refreshState)
  .on('postgres_changes',{event:'*',schema:'public',table:'answers',filter:'game_id=eq.'+game.id},refreshState)
  .on('postgres_changes',{event:'*',schema:'public',table:'votes',filter:'game_id=eq.'+game.id},refreshState)
  .on('postgres_changes',{event:'*',schema:'public',table:'word_events',filter:'game_id=eq.'+game.id},refreshState)
  .on('postgres_changes',{event:'*',schema:'public',table:'players',filter:'game_id=eq.'+game.id},refreshState)
  .subscribe(s=>console.log('player realtime',s));
  pollInterval=setInterval(refreshState,1500);
}

async function sendAnswer(){
  const answer=$('answerText')?.value.trim(), msg=$('answerMsg');
  if(!answer){if(msg)msg.textContent='Спочатку напиши відповідь.';return}
  if(!currentQuestion||game.phase!=='answering')return;
  if(game.answer_deadline&&nowSec()>=Number(game.answer_deadline)){if(msg)msg.textContent='Час вийшов.';return}
  const {error}=await supabase.from('answers').upsert({game_id:game.id,question_id:currentQuestion.id,player_id:player.id,text:answer,created_at:new Date().toISOString()},{onConflict:'question_id,player_id'});
  if(msg)msg.textContent=error?error.message:'Відповідь збережено 💜';await refreshState();
}
async function vote(optionId){
  if(!currentQuestion||game.phase!=='voting')return;
  if(game.vote_deadline&&nowSec()>=Number(game.vote_deadline)){alert('Час голосування вийшов.');return}
  const opts=safeJson(currentQuestion.options_json), chosen=opts.find(o=>o.id===optionId);
  if(chosen?.type==='player'&&Number(chosen.player_id)===Number(player.id)){alert('Не можна голосувати за свою відповідь.');return}
  const {error}=await supabase.from('votes').upsert({game_id:game.id,question_id:currentQuestion.id,player_id:player.id,option_id:optionId,created_at:new Date().toISOString()},{onConflict:'question_id,player_id'});
  if(error)alert(error.message);await refreshState();
}
window.sendAnswer=sendAnswer;window.vote=vote;

window.openPhoto=(src)=>{
  const overlay=document.createElement('div');
  overlay.className='photoOverlay';
  overlay.innerHTML=`<img src="${src}" alt="Фото"><button>×</button>`;
  overlay.onclick=()=>overlay.remove();
  document.body.appendChild(overlay);
};


function getPlayerOptions(opts){
  if(!currentQuestion || !player) return opts;

  const key = `option_order_${currentQuestion.id}_${player.id}`;
  let saved = null;

  try{
    saved = JSON.parse(localStorage.getItem(key) || 'null');
  }catch{
    saved = null;
  }

  const ids = opts.map(o => o.id);
  const savedIsValid =
    Array.isArray(saved) &&
    saved.length === ids.length &&
    ids.every(id => saved.includes(id));

  let order = savedIsValid ? saved : null;

  if(!order){
    order = [...ids];

    for(let i = order.length - 1; i > 0; i--){
      const j = Math.floor(Math.random() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }

    localStorage.setItem(key, JSON.stringify(order));
  }

  const byId = new Map(opts.map(o => [o.id, o]));
  return order.map(id => byId.get(id)).filter(Boolean);
}


function render(){
  const savedAnswerDraft = document.getElementById('answerText')?.value ?? null;
  clearInterval(timerInterval); if(!game)return; let html='';
  if(game.mode==='letters'){
    stateBox.innerHTML=lettersPlayerHtml();
    startTimer();
    return;
  }
  if(game.phase==='finished' || game.status==='finished'){
    stateBox.innerHTML=finalScreenHtml();
    return;
  }
  if(game.phase==='finished'){
    html=finalScreenHtml();
    stateBox.innerHTML=html;
    return;
  }

  if(game.phase==='lobby'||game.phase==='setup'){
    html=`<h2>Лобі</h2><p class="muted">Чекаємо старт гри...</p><div class="lobbyPlayers">${players.length?players.map(p=>`<div class="lobbyPlayer">${avatarHtml(p)}<b>${escapeHtml(p.name)}</b></div>`).join(''):'<p class="muted">Гравців ще немає.</p>'}</div>`;
  }
  if(!currentQuestion&&game.phase!=='finished'&&game.phase!=='lobby')html='<p class="muted">Питання ще не додані.</p>';
  if(currentQuestion&&game.phase==='question_preview')html=questionHtml()+`<p class="muted">Подивіться питання, відповіді ще не відкриті.</p>`;
  if(currentQuestion&&game.phase==='answering'){
    const left=deadlineLeft(game.answer_deadline), myAnswer=answers.find(a=>Number(a.player_id)===Number(player.id)); html=questionHtml()+timerHtml(left);
    if(left<=0)html+='<p class="muted">Час на відповідь вийшов.</p>';else html+=`<textarea id="answerText" placeholder="Твій варіант відповіді">${escapeHtml(myAnswer?.text||'')}</textarea><button onclick="sendAnswer()">Відправити</button><p id="answerMsg" class="muted">${myAnswer?'Твоя відповідь вже збережена 💜':''}</p>`;
  }
  if(currentQuestion&&game.phase==='paused_answering'){
    const left=Number(game.answer_deadline||0);
    const myAnswer=answers.find(a=>Number(a.player_id)===Number(player.id));
    html=questionHtml()+pauseHtml(left,'Ведуча поставила таймер на паузу.')+(myAnswer?'<p class="muted">Твоя відповідь вже збережена.</p>':'<p class="muted">Відповідь можна буде надіслати після продовження таймера.</p>');
  }
  if(currentQuestion&&game.phase==='preview'){const opts=getPlayerOptions(safeJson(currentQuestion.options_json));html=questionHtml()+`<h2>Варіанти</h2><p class="muted">Поки тільки читаємо.</p>${opts.map((o,i)=>`<button class="option" disabled>${i+1}. ${escapeHtml(o.text)}</button>`).join('')}`}
  if(currentQuestion&&game.phase==='voting'){
    const left=deadlineLeft(game.vote_deadline), opts=getPlayerOptions(safeJson(currentQuestion.options_json)), myVote=votes.find(v=>Number(v.player_id)===Number(player.id)); html=questionHtml()+timerHtml(left)+'<h2>Голосування</h2>';
    html+=opts.map((o,i)=>{const own=o.type==='player'&&Number(o.player_id)===Number(player.id), sel=myVote&&myVote.option_id===o.id?' ✓':'';if(left<=0)return `<button class="option" disabled>${i+1}. ${escapeHtml(o.text)}${sel}</button>`;if(own)return `<button class="option ownOption" disabled>${i+1}. ${escapeHtml(o.text)} — твоя відповідь</button>`;return `<button class="option" onclick="vote('${escapeHtml(o.id)}')">${i+1}. ${escapeHtml(o.text)}${sel}</button>`}).join('');
  }
  if(currentQuestion&&game.phase==='paused_voting'){
    const left=Number(game.vote_deadline||0), opts=getPlayerOptions(safeJson(currentQuestion.options_json)), myVote=votes.find(v=>Number(v.player_id)===Number(player.id));
    html=questionHtml()+pauseHtml(left,'Ведуча поставила голосування на паузу.')+'<h2>Голосування</h2>'+opts.map((o,i)=>`<button class="option" disabled>${i+1}. ${escapeHtml(o.text)}${myVote&&myVote.option_id===o.id?' ✓':''}</button>`).join('');
  }
  if(currentQuestion&&game.phase==='results'){html=questionHtml()+renderResults();if(game.scoreboard_visible)html+=scoreHtml()}
  if(game.phase==='finished')html=finalScreenHtml();
  stateBox.innerHTML=html;

  if(savedAnswerDraft !== null && game.phase === 'answering'){
    const answerBox = document.getElementById('answerText');
    if(answerBox && !answerBox.value) answerBox.value = savedAnswerDraft;
  }

  startTimer();
}
function questionHtml(){return currentQuestion?`<div class="pill">Раунд ${currentQuestion.round_no} · питання ${Number(game.current_q)+1}</div><div class="question">${escapeHtml(currentQuestion.text)}</div>${currentQuestion.photo_url?`<img class="photo clickablePhoto" src="${escapeHtml(currentQuestion.photo_url)}" alt="Фото" onclick="window.openPhoto('${escapeHtml(currentQuestion.photo_url)}')">`:''}`:''}
function renderResults(){const opts=safeJson(currentQuestion.options_json), revealed=safeJson(currentQuestion.revealed_json), shown=opts.filter(o=>revealed.includes(o.id));return revealed.length?`<h2>Відкриття відповідей</h2>${shown.map(revealCard).join('')}`:'<h2>Відкриття відповідей</h2><p class="muted">Ведуча відкриває відповіді по черзі.</p>'}
function revealCard(o){
  const voters=votes.filter(v=>v.option_id===o.id).map(v=>players.find(p=>Number(p.id)===Number(v.player_id))).filter(Boolean);
  let authorHtml='',label=''; if(o.type==='correct'){authorHtml=avatarHtml({name:'Правильна',avatar:'✓'},'big');label='Правильна відповідь'} if(o.type==='fake'){authorHtml=hostAvatarHtml(game,'big');label='Фейк ведучої'} if(o.type==='player'){const author=players.find(p=>Number(p.id)===Number(o.player_id));authorHtml=avatarHtml(author||{name:'Гравець',avatar:'?'},'big');label=author?author.name:'Гравець'}
  return `<div class="revealRow revealGrid"><div class="avatarLine authorSide">${authorHtml}<b>${escapeHtml(label)}</b></div><div><span class="tag ${o.type==='correct'?'correct':o.type==='fake'?'fake':''}">${o.type==='correct'?'Правильна':o.type==='fake'?'Фейк':'Гравець'}</span><div class="answerBig">${escapeHtml(o.text)}</div></div><div><b>Голосували:</b>${voters.length?voters.map(v=>`<div class="avatarLine voterMini">${avatarHtml(v,'small')}<span>${escapeHtml(v.name)}</span></div>`).join(''):'<p class="muted">Ніхто</p>'}</div></div>`;
}

function finalScreenHtml(){
  const arr=[...players].sort((a,b)=>Number(b.score||0)-Number(a.score||0));
  const winner=arr[0];
  const top3=arr.slice(0,3);

  if(!winner){
    return '<div class="winnerBox"><h2>Гра завершена</h2><p class="muted">Гравців немає.</p></div>';
  }

  return `
    <div class="winnerBox finalShow">
      <div class="confettiLayer"><span></span><span></span><span></span><span></span><span></span></div>
      <div class="winnerCup">🏆</div>
      <h2>Гра завершена</h2>
      <p class="muted">Переможець гри</p>
      <div class="avatarLine winnerLine">${avatarHtml(winner,'big')}<b>${escapeHtml(winner.name)}</b></div>
      <div class="winnerPoints">${winner.score||0} балів</div>
      <div class="podium">${top3.map((p,i)=>`<div class="podiumPlace place${i+1}"><div>${i===0?'🥇':i===1?'🥈':'🥉'}</div>${avatarHtml(p,'big')}<b>${escapeHtml(p.name)}</b><span>${p.score||0}</span></div>`).join('')}</div>
    </div>
    ${scoreHtml()}
  `;
}

function scoreHtml(){const arr=[...players].sort((a,b)=>Number(b.score||0)-Number(a.score||0));return `<h2>Таблиця гравців</h2>${arr.map((p,i)=>`<div class="playerRow rank${i+1}"><div class="avatarLine">${avatarHtml(p)}<b>${i===0?'🥇':i===1?'🥈':i===2?'🥉':i+1+'.'} ${escapeHtml(p.name)}</b></div><b>${p.score||0}</b></div>`).join('')}`}
function timerHtml(left){return `<div class="timer" id="timerBox">${Math.max(0,left)} сек</div>`}
function pauseHtml(left,text){return `<div class="pausePanel"><div class="pauseIcon">Ⅱ</div><h2>Пауза</h2><p class="muted">${escapeHtml(text)}</p><div class="timer">${Math.max(0,left)} сек залишилось</div></div>`}
function deadlineLeft(deadline){return deadline?Math.max(0,Number(deadline)-nowSec()):0}
function startTimer(){const box=$('timerBox');if(!box)return;const tick=()=>{const deadline=game.phase==='voting'?game.vote_deadline:game.answer_deadline;const left=deadlineLeft(deadline);box.textContent=`${left} сек`;if(left<=0)setTimeout(refreshState,250)};tick();timerInterval=setInterval(tick,1000)}

function wordConfig(){
  return safeJson(game?.word_config_json,{round:1,categories:[],drawWords:[],usedDrawIndexes:[],letters9:[],teams:[]});
}

function lettersPlayerHtml(){
  const cfg=wordConfig();
  const phase=game.phase;
  if(phase==='finished'||game.status==='finished')return lettersFinalHtml();
  const left=['word_round1_timer','word_draw_timer','word_words_timer'].includes(phase)?deadlineLeft(game.answer_deadline):null;
  return `
    <div class="pill">Словесна гра${player.team_name?` · ${escapeHtml(player.team_name)}`:''}</div>
    ${left!==null?`<div class="timer" id="timerBox">${left} сек</div>`:''}
    ${lettersPlayerRoundHtml(cfg)}
    ${lettersScoreHtml()}
  `;
}

function lettersPlayerRoundHtml(cfg){
  const round=Number(cfg.round||1);
  if(game.phase==='word_lobby')return `<h2>Лобі</h2><p class="muted">Чекаємо старт від ведучої.</p>${playersListHtml()}`;
  if(round===1)return `
    <h2>Раунд 1: Категорії</h2>
    <div class="letterHero">${escapeHtml(cfg.letter||'Букву ще не обрали')}</div>
    <div class="notebookGrid">${(cfg.categories||[]).map((c,i)=>`<label class="noteInput"><b>${escapeHtml(c)}</b><textarea oninput="saveWordNote('r1_${i}',this.value)" placeholder="Твоя відповідь">${escapeHtml(loadWordNote(`r1_${i}`))}</textarea></label>`).join('')}</div>
    <p class="muted">Після таймера зачитуйте відповіді наживо.</p>
  `;
  if(round===2)return drawPlayerHtml(cfg);
  return `
    <h2>Раунд 3: Словотворці</h2>
    <div class="letterTiles">${(cfg.letters9||[]).map(l=>`<span>${escapeHtml(l)}</span>`).join('')}</div>
    <label class="noteInput"><b>Неіснуюче слово</b><textarea oninput="saveWordNote('r3_word',this.value)" placeholder="Наприклад: лосрано">${escapeHtml(loadWordNote('r3_word'))}</textarea></label>
    <label class="noteInput"><b>Що воно означає</b><textarea oninput="saveWordNote('r3_meaning',this.value)" placeholder="Пояснення зачитуєте наживо">${escapeHtml(loadWordNote('r3_meaning'))}</textarea></label>
  `;
}

function drawPlayerHtml(cfg){
  const active=Number(cfg.activePlayerId||0)===Number(player.id);
  const opened=wordEvents.find(e=>e.event_type==='draw_open'&&Number(e.player_id)===Number(player.id));
  const payload=safeJson(opened?.payload_json,{});
  const usedIndexes=usedDrawIndexes(cfg);
  return `
    <h2>Раунд 2: Намалюй за 5 секунд</h2>
    ${active?'<p class="finalNote">Твій хід. Обери один папірчик.</p>':'<p class="muted">Чекаємо, кого призначить ведуча.</p>'}
    ${opened?`<div class="secretWord">Твоє слово: <b>${escapeHtml(payload.word||'')}</b></div>`:''}
    <div class="paperGrid">${(cfg.drawWords||[]).map((w,i)=>{
      const used=usedIndexes.includes(i);
      const can=active&&!opened&&!used&&game.phase==='word_draw_pick';
      return `<button class="paperBall paper${i%6} ${used?'used':''}" ${can?`onclick="openDrawWord(${i})"`:'disabled'} aria-label="${used?'Взятий папірчик':'Закритий папірчик'}" title="${used?'Взято':'Закритий папірчик'}"></button>`;
    }).join('')}</div>
  `;
}

function usedDrawIndexes(cfg){
  const fromConfig=cfg.usedDrawIndexes||[];
  const fromEvents=wordEvents.filter(e=>e.event_type==='draw_open').map(e=>safeJson(e.payload_json,{}).index).filter(i=>Number.isInteger(Number(i))).map(Number);
  return [...new Set([...fromConfig,...fromEvents])];
}

async function openDrawWord(index){
  const cfg=wordConfig();
  if(Number(cfg.activePlayerId)!==Number(player.id))return;
  if((cfg.usedDrawIndexes||[]).includes(index))return;
  const word=(cfg.drawWords||[])[index];
  const {error}=await supabase.from('word_events').insert({game_id:game.id,player_id:player.id,event_type:'draw_open',payload_json:JSON.stringify({index,word}),created_at:new Date().toISOString()});
  if(error){alert(error.message);return}
  await refreshState();
}
window.openDrawWord=openDrawWord;

function lettersScoreHtml(){
  const teams=wordConfig().teams||[];
  if(!teams.length)return '';
  return `<h2>Команди</h2>${teams.map(t=>`<div class="teamScore"><b>${escapeHtml(t.name)}</b><span>${Number(t.score||0)} балів</span></div>`).join('')}`;
}

function playersListHtml(){
  return `<div class="lobbyPlayers">${players.map(p=>`<div class="lobbyPlayer">${avatarHtml(p)}<b>${escapeHtml(p.name)}</b><span>${escapeHtml(p.team_name||'без команди')}</span></div>`).join('')}</div>`;
}

function lettersFinalHtml(){
  const teams=[...(wordConfig().teams||[])].sort((a,b)=>Number(b.score||0)-Number(a.score||0));
  const winner=teams[0];
  return winner?`<div class="winnerBox finalShow"><div class="winnerCup">🏆</div><h2>Перемогла команда</h2><div class="winnerPoints">${escapeHtml(winner.name)} · ${winner.score||0}</div></div>${lettersScoreHtml()}`:'<h2>Гру завершено</h2>';
}

function wordNoteKey(key){
  return `letters_note_${game.id}_${player.id}_${key}`;
}

function saveWordNote(key,value){
  localStorage.setItem(wordNoteKey(key),value);
}

function loadWordNote(key){
  return localStorage.getItem(wordNoteKey(key))||'';
}
window.saveWordNote=saveWordNote;

