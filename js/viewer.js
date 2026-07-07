import { supabase, escapeHtml, avatarHtml, hostAvatarHtml, nowSec, safeJson } from './supabaseClient.js';

let game=null, questions=[], currentQuestion=null, players=[], answers=[], votes=[], channel=null, timerInterval=null, pollInterval=null, loading=false, lastSoundKey='';
const $=id=>document.getElementById(id);
const joinCard=$('viewerJoinCard'), viewerCard=$('viewerCard'), stateBox=$('viewerState');

const urlCode=new URLSearchParams(location.search).get('code');
if(urlCode)$('viewerInviteCode').value=urlCode;
$('viewerJoinBtn').onclick=joinAsViewer;
$('viewerLeaveBtn').onclick=()=>{localStorage.removeItem('viewer_game_id');location.reload()};
restoreViewerSession();

if(urlCode)joinAsViewer();

async function restoreViewerSession(){
  if(urlCode)return;
  const gameId=localStorage.getItem('viewer_game_id');
  if(!gameId)return;
  const {data,error}=await supabase.from('games').select('*').eq('id',gameId).single();
  if(error||!data)return;
  game=data;
  openViewerScreen();
  await refreshState();
  subscribe();
}

async function joinAsViewer(){
  unlockSound();
  const code=$('viewerInviteCode').value.trim();
  if(!code){$('viewerJoinMsg').textContent='Введи код гри';return}
  const {data,error}=await supabase.from('games').select('*').eq('invite_code',code).single();
  if(error||!data){$('viewerJoinMsg').textContent='Гру не знайдено';return}
  game=data;
  localStorage.setItem('viewer_game_id',game.id);
  openViewerScreen();
  await refreshState();
  subscribe();
}

function openViewerScreen(){
  joinCard.classList.add('hidden');
  viewerCard.classList.remove('hidden');
}

async function refreshState(){
  if(!game||loading)return;
  const previousPhase=game.phase;
  const previousQuestionId=currentQuestion?.id;
  const previousRevealed=currentQuestion?safeJson(currentQuestion.revealed_json).length:0;
  loading=true;
  try{
    const [gRes,qRes,pRes]=await Promise.all([
      supabase.from('games').select('*').eq('id',game.id).single(),
      supabase.from('questions').select('*').eq('game_id',game.id).order('q_order',{ascending:true}),
      supabase.from('players').select('*').eq('game_id',game.id)
    ]);
    if(!gRes.error&&gRes.data)game=gRes.data;
    questions=qRes.data||[];
    players=pRes.data||[];
    currentQuestion=questions[Number(game.current_q||0)]||null;
    if(currentQuestion){
      const [aRes,vRes]=await Promise.all([
        supabase.from('answers').select('*').eq('question_id',currentQuestion.id),
        supabase.from('votes').select('*').eq('question_id',currentQuestion.id)
      ]);
      answers=aRes.data||[];
      votes=vRes.data||[];
    }else{
      answers=[];
      votes=[];
    }
    render();
    playStateSound(previousPhase,previousQuestionId,previousRevealed);
  }finally{loading=false}
}

function subscribe(){
  if(channel)supabase.removeChannel(channel);
  if(pollInterval)clearInterval(pollInterval);
  channel=supabase.channel('viewer-game-'+game.id)
    .on('postgres_changes',{event:'*',schema:'public',table:'games',filter:'id=eq.'+game.id},p=>{game=p.new;refreshState()})
    .on('postgres_changes',{event:'*',schema:'public',table:'questions',filter:'game_id=eq.'+game.id},refreshState)
    .on('postgres_changes',{event:'*',schema:'public',table:'answers',filter:'game_id=eq.'+game.id},refreshState)
    .on('postgres_changes',{event:'*',schema:'public',table:'votes',filter:'game_id=eq.'+game.id},refreshState)
    .on('postgres_changes',{event:'*',schema:'public',table:'players',filter:'game_id=eq.'+game.id},refreshState)
    .subscribe(s=>console.log('viewer realtime',s));
  pollInterval=setInterval(refreshState,1500);
}

window.openPhoto=(src)=>{
  const overlay=document.createElement('div');
  overlay.className='photoOverlay';
  overlay.innerHTML=`<img src="${src}" alt="Фото"><button>×</button>`;
  overlay.onclick=()=>overlay.remove();
  document.body.appendChild(overlay);
};

function render(){
  clearInterval(timerInterval);
  if(!game)return;
  let html='';

  if(game.phase==='finished'||game.status==='finished'){
    stateBox.innerHTML=finalScreenHtml();
    return;
  }

  if(game.phase==='lobby'||game.phase==='setup'){
    html=`<h2>Лобі</h2><p class="muted">Чекаємо старт гри...</p><div class="lobbyPlayers">${players.length?players.map(p=>`<div class="lobbyPlayer">${avatarHtml(p)}<b>${escapeHtml(p.name)}</b></div>`).join(''):'<p class="muted">Гравців ще немає.</p>'}</div>`;
  }

  if(!currentQuestion&&game.phase!=='lobby')html='<p class="muted">Питання ще не додані.</p>';
  if(currentQuestion&&game.phase==='question_preview')html=questionHtml()+`<p class="muted">Питання на екрані. Відповіді ще не відкриті.</p>`;
  if(currentQuestion&&game.phase==='answering'){
    const left=deadlineLeft(game.answer_deadline);
    html=questionHtml()+timerHtml(left)+waitScreenHtml('Гравці пишуть відповіді', answers.length, players.length, 'Відправлено відповідей');
  }
  if(currentQuestion&&game.phase==='paused_answering'){
    html=questionHtml()+pauseScreenHtml(Number(game.answer_deadline||0),'Відповіді на паузі');
  }
  if(currentQuestion&&game.phase==='preview'){
    const opts=safeJson(currentQuestion.options_json);
    html=questionHtml()+`<h2>Варіанти</h2><p class="muted">Усі варіанти вже на екрані. Голосування ще не почалося.</p>${opts.map((o,i)=>`<button class="option" disabled>${i+1}. ${escapeHtml(o.text)}</button>`).join('')}`;
  }
  if(currentQuestion&&game.phase==='voting'){
    const left=deadlineLeft(game.vote_deadline), opts=safeJson(currentQuestion.options_json);
    html=questionHtml()+timerHtml(left)+waitScreenHtml('Гравці голосують', votes.length, players.length, 'Отримано голосів')+`<h2>Голосування</h2>${opts.map((o,i)=>`<button class="option" disabled>${i+1}. ${escapeHtml(o.text)}</button>`).join('')}`;
  }
  if(currentQuestion&&game.phase==='paused_voting'){
    const opts=safeJson(currentQuestion.options_json);
    html=questionHtml()+pauseScreenHtml(Number(game.vote_deadline||0),'Голосування на паузі')+`<h2>Голосування</h2>${opts.map((o,i)=>`<button class="option" disabled>${i+1}. ${escapeHtml(o.text)}</button>`).join('')}`;
  }
  if(currentQuestion&&game.phase==='results'){
    html=questionHtml()+renderResults();
    if(game.scoreboard_visible)html+=scoreHtml();
  }

  stateBox.innerHTML=html;
  startTimer();
}

function questionHtml(){
  return currentQuestion?`<div class="pill">Раунд ${currentQuestion.round_no} · питання ${Number(game.current_q)+1}</div><div class="question">${escapeHtml(currentQuestion.text)}</div>${currentQuestion.photo_url?`<img class="photo clickablePhoto" src="${escapeHtml(currentQuestion.photo_url)}" alt="Фото" onclick="window.openPhoto('${escapeHtml(currentQuestion.photo_url)}')">`:''}`:'';
}

function waitScreenHtml(title, done, total, label){
  const safeTotal=Math.max(0,total);
  const percent=safeTotal?Math.min(100,Math.round((done/safeTotal)*100)):0;
  return `
    <div class="viewerWait">
      <div class="pulseStage"><span></span><span></span><span></span></div>
      <h2>${escapeHtml(title)}</h2>
      <div class="progressLabel"><b>${escapeHtml(label)}</b><strong>${done}/${safeTotal}</strong></div>
      <div class="progressTrack"><div style="width:${percent}%"></div></div>
    </div>
  `;
}

function pauseScreenHtml(left,title){
  return `
    <div class="viewerWait pausePanel">
      <div class="pauseIcon">Ⅱ</div>
      <h2>${escapeHtml(title)}</h2>
      <p class="muted">Ведуча поставила таймер на паузу.</p>
      <div class="timer">${Math.max(0,left)} сек залишилось</div>
    </div>
  `;
}

function renderResults(){
  const opts=safeJson(currentQuestion.options_json), revealed=safeJson(currentQuestion.revealed_json), shown=opts.filter(o=>revealed.includes(o.id));
  return revealed.length?`<h2>Відкриття відповідей</h2>${shown.map(revealCard).join('')}`:'<h2>Відкриття відповідей</h2><p class="muted">Ведуча відкриває відповіді по черзі.</p>';
}

function revealCard(o){
  const voters=votes.filter(v=>v.option_id===o.id).map(v=>players.find(p=>Number(p.id)===Number(v.player_id))).filter(Boolean);
  let authorHtml='',label='';
  if(o.type==='correct'){authorHtml=avatarHtml({name:'Правильна',avatar:'✓'},'big');label='Правильна відповідь'}
  if(o.type==='fake'){authorHtml=hostAvatarHtml(game,'big');label='Фейк ведучої'}
  if(o.type==='player'){
    const author=players.find(p=>Number(p.id)===Number(o.player_id));
    authorHtml=avatarHtml(author||{name:'Гравець',avatar:'?'},'big');
    label=author?author.name:'Гравець';
  }
  return `<div class="revealRow revealGrid"><div class="avatarLine authorSide">${authorHtml}<b>${escapeHtml(label)}</b></div><div><span class="tag ${o.type==='correct'?'correct':o.type==='fake'?'fake':''}">${o.type==='correct'?'Правильна':o.type==='fake'?'Фейк':'Гравець'}</span><div class="answerBig">${escapeHtml(o.text)}</div></div><div><b>Голосували:</b>${voters.length?voters.map(v=>`<div class="avatarLine voterMini">${avatarHtml(v,'small')}<span>${escapeHtml(v.name)}</span></div>`).join(''):'<p class="muted">Ніхто</p>'}</div></div>`;
}

function finalScreenHtml(){
  const arr=[...players].sort((a,b)=>Number(b.score||0)-Number(a.score||0));
  const winner=arr[0];
  if(!winner)return '<div class="winnerBox"><h2>Гра завершена</h2><p class="muted">Гравців немає.</p></div>';
  const top3=arr.slice(0,3);
  return `<div class="winnerBox finalShow"><div class="confettiLayer"><span></span><span></span><span></span><span></span><span></span></div><div class="winnerCup">🏆</div><h2>Гра завершена</h2><p class="muted">Переможець гри</p><div class="avatarLine winnerLine">${avatarHtml(winner,'big')}<b>${escapeHtml(winner.name)}</b></div><div class="winnerPoints">${winner.score||0} балів</div><div class="podium">${top3.map((p,i)=>`<div class="podiumPlace place${i+1}"><div>${i===0?'🥇':i===1?'🥈':'🥉'}</div>${avatarHtml(p,'big')}<b>${escapeHtml(p.name)}</b><span>${p.score||0}</span></div>`).join('')}</div></div>${scoreHtml()}`;
}

function scoreHtml(){
  const arr=[...players].sort((a,b)=>Number(b.score||0)-Number(a.score||0));
  return `<h2>Таблиця гравців</h2>${arr.map((p,i)=>`<div class="playerRow rank${i+1}"><div class="avatarLine">${avatarHtml(p)}<b>${i===0?'🥇':i===1?'🥈':i===2?'🥉':i+1+'.'} ${escapeHtml(p.name)}</b></div><b>${p.score||0}</b></div>`).join('')}`;
}

function timerHtml(left){return `<div class="timer" id="timerBox">${Math.max(0,left)} сек</div>`}
function deadlineLeft(deadline){return deadline?Math.max(0,Number(deadline)-nowSec()):0}
function startTimer(){
  const box=$('timerBox');
  if(!box)return;
  const tick=()=>{
    const deadline=game.phase==='answering'?game.answer_deadline:game.vote_deadline;
    const left=deadlineLeft(deadline);
    box.textContent=`${left} сек`;
    if(left<=0)setTimeout(refreshState,250);
  };
  tick();
  timerInterval=setInterval(tick,1000);
}

let audioCtx=null;
function unlockSound(){
  try{
    audioCtx=audioCtx||new (window.AudioContext||window.webkitAudioContext)();
    if(audioCtx.state==='suspended')audioCtx.resume();
  }catch{}
}

function playTone(freq=520,duration=.12,type='sine',gain=.045,delay=0){
  try{
    unlockSound();
    if(!audioCtx)return;
    const osc=audioCtx.createOscillator();
    const vol=audioCtx.createGain();
    osc.type=type;
    osc.frequency.value=freq;
    vol.gain.value=gain;
    osc.connect(vol);
    vol.connect(audioCtx.destination);
    const start=audioCtx.currentTime+delay;
    osc.start(start);
    vol.gain.exponentialRampToValueAtTime(.001,start+duration);
    osc.stop(start+duration+.02);
  }catch{}
}

function playStateSound(previousPhase,previousQuestionId,previousRevealed){
  if(!game)return;
  const revealedNow=currentQuestion?safeJson(currentQuestion.revealed_json).length:0;
  const key=`${game.phase}:${currentQuestion?.id||0}:${revealedNow}`;
  if(key===lastSoundKey)return;
  lastSoundKey=key;

  if(previousPhase&&previousPhase!==game.phase){
    if(game.phase==='answering'||game.phase==='voting'){playTone(520);playTone(760,.14,'triangle',.04,.09)}
    if(game.phase==='results'){playTone(430,.1,'triangle');playTone(650,.13,'triangle',.04,.1)}
    if(game.phase==='finished'){playTone(523,.16,'triangle');playTone(659,.16,'triangle',.045,.16);playTone(784,.24,'triangle',.05,.32)}
    if(game.phase==='paused_answering'||game.phase==='paused_voting')playTone(260,.18,'sine',.035);
  }

  if(currentQuestion&&previousQuestionId===currentQuestion.id&&revealedNow>previousRevealed){
    playTone(620,.08,'triangle');
    playTone(880,.14,'triangle',.04,.08);
  }
}
