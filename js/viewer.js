import { supabase, escapeHtml, avatarHtml, hostAvatarHtml, nowSec, safeJson } from './supabaseClient.js';

let game=null, questions=[], currentQuestion=null, players=[], answers=[], votes=[], wordEvents=[], channel=null, timerInterval=null, pollInterval=null, loading=false, lastSoundKey='';
const $=id=>document.getElementById(id);
const joinCard=$('viewerJoinCard'), viewerCard=$('viewerCard'), stateBox=$('viewerState');

const urlCode=readInviteCode();
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
  const code=readInviteCode($('viewerInviteCode').value);
  if(!code){$('viewerJoinMsg').textContent='Ð’Ð²ÐµÐ´Ð¸ ÐºÐ¾Ð´ Ð³Ñ€Ð¸';return}
  const foundGame=await findGameByInviteCode(code);
  if(!foundGame){$('viewerJoinMsg').textContent=`Гру не знайдено. Код із посилання: ${code}. Скопіюй нове посилання з адмінки.`;return}
  game=foundGame;
  localStorage.setItem('viewer_game_id',game.id);
  openViewerScreen();
  await refreshState();
  subscribe();
}

function readInviteCode(fallback=''){
  const params=new URLSearchParams(location.search);
  const raw=params.get('code')||params.get('game')||fallback||'';
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
  const localMatch=(data||[]).find(item=>normalizeInviteCode(item.invite_code)===normalized);
  if(localMatch)return localMatch;

  try{
    const res=await fetch(`/api/public-game?code=${encodeURIComponent(normalized)}`);
    const json=await res.json().catch(()=>({}));
    return res.ok ? json.data : null;
  }catch{
    return null;
  }
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
    const [gRes,qRes,pRes,eRes]=await Promise.all([
      supabase.from('games').select('*').eq('id',game.id).single(),
      supabase.from('questions').select('*').eq('game_id',game.id).order('q_order',{ascending:true}),
      supabase.from('players').select('*').eq('game_id',game.id),
      supabase.from('word_events').select('*').eq('game_id',game.id).order('id',{ascending:false})
    ]);
    if(!gRes.error&&gRes.data)game=gRes.data;
    questions=qRes.data||[];
    players=pRes.data||[];
    wordEvents=eRes.data||[];
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
    .on('postgres_changes',{event:'*',schema:'public',table:'word_events',filter:'game_id=eq.'+game.id},refreshState)
    .on('postgres_changes',{event:'*',schema:'public',table:'players',filter:'game_id=eq.'+game.id},refreshState)
    .subscribe(s=>console.log('viewer realtime',s));
  pollInterval=setInterval(refreshState,1500);
}

window.openPhoto=(src)=>{
  const overlay=document.createElement('div');
  overlay.className='photoOverlay';
  overlay.innerHTML=`<img src="${src}" alt="Ð¤Ð¾Ñ‚Ð¾"><button>Ã—</button>`;
  overlay.onclick=()=>overlay.remove();
  document.body.appendChild(overlay);
};

function render(){
  clearInterval(timerInterval);
  if(!game)return;
  let html='';

  if(game.mode==='letters'){
    stateBox.innerHTML=lettersViewerHtml();
    startTimer();
    return;
  }

  if(game.phase==='finished'||game.status==='finished'){
    stateBox.innerHTML=finalScreenHtml();
    return;
  }

  if(game.phase==='lobby'||game.phase==='setup'){
    html=`<h2>Ð›Ð¾Ð±Ñ–</h2><p class="muted">Ð§ÐµÐºÐ°Ñ”Ð¼Ð¾ ÑÑ‚Ð°Ñ€Ñ‚ Ð³Ñ€Ð¸...</p><div class="lobbyPlayers">${players.length?players.map(p=>`<div class="lobbyPlayer">${avatarHtml(p)}<b>${escapeHtml(p.name)}</b></div>`).join(''):'<p class="muted">Ð“Ñ€Ð°Ð²Ñ†Ñ–Ð² Ñ‰Ðµ Ð½ÐµÐ¼Ð°Ñ”.</p>'}</div>`;
  }

  if(!currentQuestion&&game.phase!=='lobby')html='<p class="muted">ÐŸÐ¸Ñ‚Ð°Ð½Ð½Ñ Ñ‰Ðµ Ð½Ðµ Ð´Ð¾Ð´Ð°Ð½Ñ–.</p>';
  if(currentQuestion&&game.phase==='question_preview')html=questionHtml()+`<p class="muted">ÐŸÐ¸Ñ‚Ð°Ð½Ð½Ñ Ð½Ð° ÐµÐºÑ€Ð°Ð½Ñ–. Ð’Ñ–Ð´Ð¿Ð¾Ð²Ñ–Ð´Ñ– Ñ‰Ðµ Ð½Ðµ Ð²Ñ–Ð´ÐºÑ€Ð¸Ñ‚Ñ–.</p>`;
  if(currentQuestion&&game.phase==='answering'){
    const left=deadlineLeft(game.answer_deadline);
    html=questionHtml()+timerHtml(left)+waitScreenHtml('Ð“Ñ€Ð°Ð²Ñ†Ñ– Ð¿Ð¸ÑˆÑƒÑ‚ÑŒ Ð²Ñ–Ð´Ð¿Ð¾Ð²Ñ–Ð´Ñ–', answers.length, players.length, 'Ð’Ñ–Ð´Ð¿Ñ€Ð°Ð²Ð»ÐµÐ½Ð¾ Ð²Ñ–Ð´Ð¿Ð¾Ð²Ñ–Ð´ÐµÐ¹');
  }
  if(currentQuestion&&game.phase==='paused_answering'){
    html=questionHtml()+pauseScreenHtml(Number(game.answer_deadline||0),'Ð’Ñ–Ð´Ð¿Ð¾Ð²Ñ–Ð´Ñ– Ð½Ð° Ð¿Ð°ÑƒÐ·Ñ–');
  }
  if(currentQuestion&&game.phase==='preview'){
    const opts=safeJson(currentQuestion.options_json);
    html=questionHtml()+`<h2>Ð’Ð°Ñ€Ñ–Ð°Ð½Ñ‚Ð¸</h2><p class="muted">Ð£ÑÑ– Ð²Ð°Ñ€Ñ–Ð°Ð½Ñ‚Ð¸ Ð²Ð¶Ðµ Ð½Ð° ÐµÐºÑ€Ð°Ð½Ñ–. Ð“Ð¾Ð»Ð¾ÑÑƒÐ²Ð°Ð½Ð½Ñ Ñ‰Ðµ Ð½Ðµ Ð¿Ð¾Ñ‡Ð°Ð»Ð¾ÑÑ.</p>${opts.map((o,i)=>`<button class="option" disabled>${i+1}. ${escapeHtml(o.text)}</button>`).join('')}`;
  }
  if(currentQuestion&&game.phase==='voting'){
    const left=deadlineLeft(game.vote_deadline), opts=safeJson(currentQuestion.options_json);
    html=questionHtml()+timerHtml(left)+waitScreenHtml('Ð“Ñ€Ð°Ð²Ñ†Ñ– Ð³Ð¾Ð»Ð¾ÑÑƒÑŽÑ‚ÑŒ', votes.length, players.length, 'ÐžÑ‚Ñ€Ð¸Ð¼Ð°Ð½Ð¾ Ð³Ð¾Ð»Ð¾ÑÑ–Ð²')+`<h2>Ð“Ð¾Ð»Ð¾ÑÑƒÐ²Ð°Ð½Ð½Ñ</h2>${opts.map((o,i)=>`<button class="option" disabled>${i+1}. ${escapeHtml(o.text)}</button>`).join('')}`;
  }
  if(currentQuestion&&game.phase==='paused_voting'){
    const opts=safeJson(currentQuestion.options_json);
    html=questionHtml()+pauseScreenHtml(Number(game.vote_deadline||0),'Ð“Ð¾Ð»Ð¾ÑÑƒÐ²Ð°Ð½Ð½Ñ Ð½Ð° Ð¿Ð°ÑƒÐ·Ñ–')+`<h2>Ð“Ð¾Ð»Ð¾ÑÑƒÐ²Ð°Ð½Ð½Ñ</h2>${opts.map((o,i)=>`<button class="option" disabled>${i+1}. ${escapeHtml(o.text)}</button>`).join('')}`;
  }
  if(currentQuestion&&game.phase==='results'){
    html=questionHtml()+renderResults();
    if(game.scoreboard_visible)html+=scoreHtml();
  }

  stateBox.innerHTML=html;
  startTimer();
}

function questionHtml(){
  return currentQuestion?`<div class="pill">Ð Ð°ÑƒÐ½Ð´ ${currentQuestion.round_no} Â· Ð¿Ð¸Ñ‚Ð°Ð½Ð½Ñ ${Number(game.current_q)+1}</div><div class="question">${escapeHtml(currentQuestion.text)}</div>${currentQuestion.photo_url?`<img class="photo clickablePhoto" src="${escapeHtml(currentQuestion.photo_url)}" alt="Ð¤Ð¾Ñ‚Ð¾" onclick="window.openPhoto('${escapeHtml(currentQuestion.photo_url)}')">`:''}`:'';
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
      <div class="pauseIcon">â…¡</div>
      <h2>${escapeHtml(title)}</h2>
      <p class="muted">Ð’ÐµÐ´ÑƒÑ‡Ð° Ð¿Ð¾ÑÑ‚Ð°Ð²Ð¸Ð»Ð° Ñ‚Ð°Ð¹Ð¼ÐµÑ€ Ð½Ð° Ð¿Ð°ÑƒÐ·Ñƒ.</p>
      <div class="timer">${Math.max(0,left)} ÑÐµÐº Ð·Ð°Ð»Ð¸ÑˆÐ¸Ð»Ð¾ÑÑŒ</div>
    </div>
  `;
}

function renderResults(){
  const opts=safeJson(currentQuestion.options_json), revealed=safeJson(currentQuestion.revealed_json), shown=opts.filter(o=>revealed.includes(o.id));
  return revealed.length?`<h2>Ð’Ñ–Ð´ÐºÑ€Ð¸Ñ‚Ñ‚Ñ Ð²Ñ–Ð´Ð¿Ð¾Ð²Ñ–Ð´ÐµÐ¹</h2>${shown.map(revealCard).join('')}`:'<h2>Ð’Ñ–Ð´ÐºÑ€Ð¸Ñ‚Ñ‚Ñ Ð²Ñ–Ð´Ð¿Ð¾Ð²Ñ–Ð´ÐµÐ¹</h2><p class="muted">Ð’ÐµÐ´ÑƒÑ‡Ð° Ð²Ñ–Ð´ÐºÑ€Ð¸Ð²Ð°Ñ” Ð²Ñ–Ð´Ð¿Ð¾Ð²Ñ–Ð´Ñ– Ð¿Ð¾ Ñ‡ÐµÑ€Ð·Ñ–.</p>';
}

function revealCard(o){
  const voters=votes.filter(v=>v.option_id===o.id).map(v=>players.find(p=>Number(p.id)===Number(v.player_id))).filter(Boolean);
  let authorHtml='',label='';
  if(o.type==='correct'){authorHtml=avatarHtml({name:'ÐŸÑ€Ð°Ð²Ð¸Ð»ÑŒÐ½Ð°',avatar:'âœ“'},'big');label='ÐŸÑ€Ð°Ð²Ð¸Ð»ÑŒÐ½Ð° Ð²Ñ–Ð´Ð¿Ð¾Ð²Ñ–Ð´ÑŒ'}
  if(o.type==='fake'){authorHtml=hostAvatarHtml(game,'big');label='Ð¤ÐµÐ¹Ðº Ð²ÐµÐ´ÑƒÑ‡Ð¾Ñ—'}
  if(o.type==='player'){
    const author=players.find(p=>Number(p.id)===Number(o.player_id));
    authorHtml=avatarHtml(author||{name:'Ð“Ñ€Ð°Ð²ÐµÑ†ÑŒ',avatar:'?'},'big');
    label=author?author.name:'Ð“Ñ€Ð°Ð²ÐµÑ†ÑŒ';
  }
  return `<div class="revealRow revealGrid"><div class="avatarLine authorSide">${authorHtml}<b>${escapeHtml(label)}</b></div><div><span class="tag ${o.type==='correct'?'correct':o.type==='fake'?'fake':''}">${o.type==='correct'?'ÐŸÑ€Ð°Ð²Ð¸Ð»ÑŒÐ½Ð°':o.type==='fake'?'Ð¤ÐµÐ¹Ðº':'Ð“Ñ€Ð°Ð²ÐµÑ†ÑŒ'}</span><div class="answerBig">${escapeHtml(o.text)}</div></div><div><b>Ð“Ð¾Ð»Ð¾ÑÑƒÐ²Ð°Ð»Ð¸:</b>${voters.length?voters.map(v=>`<div class="avatarLine voterMini">${avatarHtml(v,'small')}<span>${escapeHtml(v.name)}</span></div>`).join(''):'<p class="muted">ÐÑ–Ñ…Ñ‚Ð¾</p>'}</div></div>`;
}

function finalScreenHtml(){
  const arr=[...players].sort((a,b)=>Number(b.score||0)-Number(a.score||0));
  const winner=arr[0];
  if(!winner)return '<div class="winnerBox"><h2>Ð“Ñ€Ð° Ð·Ð°Ð²ÐµÑ€ÑˆÐµÐ½Ð°</h2><p class="muted">Ð“Ñ€Ð°Ð²Ñ†Ñ–Ð² Ð½ÐµÐ¼Ð°Ñ”.</p></div>';
  const top3=arr.slice(0,3);
  return `<div class="winnerBox finalShow"><div class="confettiLayer"><span></span><span></span><span></span><span></span><span></span></div><div class="winnerCup">ðŸ†</div><h2>Ð“Ñ€Ð° Ð·Ð°Ð²ÐµÑ€ÑˆÐµÐ½Ð°</h2><p class="muted">ÐŸÐµÑ€ÐµÐ¼Ð¾Ð¶ÐµÑ†ÑŒ Ð³Ñ€Ð¸</p><div class="avatarLine winnerLine">${avatarHtml(winner,'big')}<b>${escapeHtml(winner.name)}</b></div><div class="winnerPoints">${winner.score||0} Ð±Ð°Ð»Ñ–Ð²</div><div class="podium">${top3.map((p,i)=>`<div class="podiumPlace place${i+1}"><div>${i===0?'ðŸ¥‡':i===1?'ðŸ¥ˆ':'ðŸ¥‰'}</div>${avatarHtml(p,'big')}<b>${escapeHtml(p.name)}</b><span>${p.score||0}</span></div>`).join('')}</div></div>${scoreHtml()}`;
}

function scoreHtml(){
  const arr=[...players].sort((a,b)=>Number(b.score||0)-Number(a.score||0));
  return `<h2>Ð¢Ð°Ð±Ð»Ð¸Ñ†Ñ Ð³Ñ€Ð°Ð²Ñ†Ñ–Ð²</h2>${arr.map((p,i)=>`<div class="playerRow rank${i+1}"><div class="avatarLine">${avatarHtml(p)}<b>${i===0?'ðŸ¥‡':i===1?'ðŸ¥ˆ':i===2?'ðŸ¥‰':i+1+'.'} ${escapeHtml(p.name)}</b></div><b>${p.score||0}</b></div>`).join('')}`;
}

function timerHtml(left){return `<div class="timer" id="timerBox">${Math.max(0,left)} ÑÐµÐº</div>`}
function deadlineLeft(deadline){return deadline?Math.max(0,Number(deadline)-nowSec()):0}
function startTimer(){
  const box=$('timerBox');
  if(!box)return;
  const tick=()=>{
    const deadline=game.phase==='voting'?game.vote_deadline:game.answer_deadline;
    const left=deadlineLeft(deadline);
    box.textContent=`${left} ÑÐµÐº`;
    if(left<=0)clearInterval(timerInterval);
  };
  tick();
  timerInterval=setInterval(tick,1000);
}

function wordConfig(){
  return safeJson(game?.word_config_json,{round:1,categories:[],drawWords:[],usedDrawIndexes:[],letters9:[],teams:[]});
}

function lettersViewerHtml(){
  const cfg=wordConfig();
  if(game.phase==='finished'||game.status==='finished')return lettersFinalHtml();
  const left=['word_round1_timer','word_draw_timer','word_words_timer'].includes(game.phase)?deadlineLeft(game.answer_deadline):null;
  return `
    <div class="pill">Ð¡Ð»Ð¾Ð²ÐµÑÐ½Ð° Ð³Ñ€Ð°</div>
    ${left!==null?`<div class="timer" id="timerBox">${left} ÑÐµÐº</div>`:''}
    ${lettersViewerRoundHtml(cfg)}
    ${lettersScoreHtml()}
  `;
}

function lettersViewerRoundHtml(cfg){
  const round=Number(cfg.round||1);
  if(game.phase==='word_lobby')return `<h2>Ð›Ð¾Ð±Ñ–</h2><p class="muted">Ð’ÐµÐ´ÑƒÑ‡Ð° Ð³Ð¾Ñ‚ÑƒÑ” ÐºÐ¾Ð¼Ð°Ð½Ð´Ð¸.</p>${playersListHtml()}`;
  if(round===1)return `
    <h2>Ð Ð°ÑƒÐ½Ð´ 1: ÐšÐ°Ñ‚ÐµÐ³Ð¾Ñ€Ñ–Ñ—</h2>
    <div class="letterHero">${escapeHtml(cfg.letter||'Ð‘ÑƒÐºÐ²Ñƒ Ñ‰Ðµ Ð½Ðµ Ð¾Ð±Ñ€Ð°Ð»Ð¸')}</div>
    <div class="categoryGrid">${(cfg.categories||[]).map(c=>`<div class="noteCard">${escapeHtml(c)}</div>`).join('')}</div>
    <p class="muted">Ð“Ñ€Ð°Ð²Ñ†Ñ– Ð¿Ð¸ÑˆÑƒÑ‚ÑŒ Ñƒ Ð±Ð»Ð¾ÐºÐ½Ð¾Ñ‚Ð°Ñ… Ñ– Ð¿Ð¾Ñ‚Ñ–Ð¼ Ð·Ð°Ñ‡Ð¸Ñ‚ÑƒÑŽÑ‚ÑŒ Ð½Ð°Ð¶Ð¸Ð²Ð¾.</p>
  `;
  if(round===2){
    const active=players.find(p=>Number(p.id)===Number(cfg.activePlayerId));
    const used=usedDrawIndexes(cfg);
    return `
      <h2>Ð Ð°ÑƒÐ½Ð´ 2: ÐÐ°Ð¼Ð°Ð»ÑŽÐ¹ Ð·Ð° 5 ÑÐµÐºÑƒÐ½Ð´</h2>
      <div class="turnBox">${active?`${avatarHtml(active)} <b>${escapeHtml(active.name)}</b> Ð¼Ð°Ð»ÑŽÑ” Ð·Ð°Ñ€Ð°Ð·`:'Ð’ÐµÐ´ÑƒÑ‡Ð° Ð¿Ñ€Ð¸Ð·Ð½Ð°Ñ‡Ð°Ñ” Ñ…Ñ–Ð´'}</div>
      <div class="paperGrid">${(cfg.drawWords||[]).map((w,i)=>`<button class="paperBall paper${i%6} ${used.includes(i)?'used':''}" disabled aria-label="${used.includes(i)?'Взятий папірчик':'Закритий папірчик'}" title="${used.includes(i)?'Взято':'Закритий папірчик'}"></button>`).join('')}</div>
      <p class="muted">Ð¡ÐµÐºÑ€ÐµÑ‚Ð½Ðµ ÑÐ»Ð¾Ð²Ð¾ Ð±Ð°Ñ‡Ð°Ñ‚ÑŒ Ñ‚Ñ–Ð»ÑŒÐºÐ¸ Ð³Ñ€Ð°Ð²ÐµÑ†ÑŒ Ñ– Ð²ÐµÐ´ÑƒÑ‡Ð°.</p>
    `;
  }
  return `
    <h2>Ð Ð°ÑƒÐ½Ð´ 3: Ð¡Ð»Ð¾Ð²Ð¾Ñ‚Ð²Ð¾Ñ€Ñ†Ñ–</h2>
    <div class="letterTiles">${(cfg.letters9||[]).map(l=>`<span>${escapeHtml(l)}</span>`).join('')}</div>
    <p class="muted">ÐšÐ¾Ð¼Ð°Ð½Ð´Ð¸ Ð²Ð¸Ð³Ð°Ð´ÑƒÑŽÑ‚ÑŒ Ð½ÐµÑ–ÑÐ½ÑƒÑŽÑ‡Ðµ ÑÐ»Ð¾Ð²Ð¾ Ð¹ Ð¿Ð¾ÑÑÐ½ÑŽÑŽÑ‚ÑŒ Ð¹Ð¾Ð³Ð¾ Ð½Ð°Ð¶Ð¸Ð²Ð¾.</p>
  `;
}

function usedDrawIndexes(cfg){
  const fromConfig=cfg.usedDrawIndexes||[];
  const fromEvents=wordEvents.filter(e=>e.event_type==='draw_open').map(e=>safeJson(e.payload_json,{}).index).filter(i=>Number.isInteger(Number(i))).map(Number);
  return [...new Set([...fromConfig,...fromEvents])];
}

function lettersScoreHtml(){
  const teams=wordConfig().teams||[];
  if(!teams.length)return '';
  return `<h2>ÐšÐ¾Ð¼Ð°Ð½Ð´Ð¸</h2>${teams.map(t=>`<div class="teamScore"><b>${escapeHtml(t.name)}</b><span>${Number(t.score||0)} Ð±Ð°Ð»Ñ–Ð²</span></div>`).join('')}`;
}

function playersListHtml(){
  return `<div class="lobbyPlayers">${players.map(p=>`<div class="lobbyPlayer">${avatarHtml(p)}<b>${escapeHtml(p.name)}</b><span>${escapeHtml(p.team_name||'Ð±ÐµÐ· ÐºÐ¾Ð¼Ð°Ð½Ð´Ð¸')}</span></div>`).join('')}</div>`;
}

function lettersFinalHtml(){
  const teams=[...(wordConfig().teams||[])].sort((a,b)=>Number(b.score||0)-Number(a.score||0));
  const winner=teams[0];
  return winner?`<div class="winnerBox finalShow"><div class="winnerCup">ðŸ†</div><h2>ÐŸÐµÑ€ÐµÐ¼Ð¾Ð³Ð»Ð° ÐºÐ¾Ð¼Ð°Ð½Ð´Ð°</h2><div class="winnerPoints">${escapeHtml(winner.name)} Â· ${winner.score||0}</div></div>${lettersScoreHtml()}`:'<h2>Ð“Ñ€Ñƒ Ð·Ð°Ð²ÐµÑ€ÑˆÐµÐ½Ð¾</h2>';
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
