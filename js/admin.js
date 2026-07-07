import {
  supabase, makeCode, escapeHtml, avatarHtml, hostAvatarHtml,
  TOTAL_QUESTIONS, ANSWER_SECONDS, VOTE_SECONDS, roundNo, nowSec,
  shuffle, safeJson, uploadPublicFile
} from './supabaseClient.js';
import { adminDb } from './adminDb.js';

let currentGame=null, games=[], sets=[], questions=[], players=[], answers=[], votes=[], channel=null, loading=false;
let guardedNextUntil=0;

const $=id=>document.getElementById(id);
const loginCard=$('loginCard'), menuCard=$('menuCard'), createPanel=$('createPanel'), gameCard=$('gameCard');
const questionEditor=$('questionEditor'), settingsPanel=$('settingsPanel');

function show(el){el.hidden=false;el.classList.remove('hidden')}
function hide(el){el.hidden=true;el.classList.add('hidden')}

$('loginBtn').onclick=loginAdmin;
$('logoutBtn').onclick=logoutAdmin;
$('showCreateBtn').onclick=()=>show(createPanel);
$('cancelCreateBtn').onclick=()=>hide(createPanel);
$('refreshBtn').onclick=showMenu;
$('backBtn').onclick=showMenu;
$('editQuestionsBtn').onclick=()=>{renderQuestionEditor();show(questionEditor)};
$('closeEditorBtn').onclick=()=>hide(questionEditor);
$('saveQuestionsBtn').onclick=saveQuestions;
$('settingsBtn').onclick=openSettings;
$('closeSettingsBtn').onclick=()=>hide(settingsPanel);
$('saveSettingsBtn').onclick=saveSettings;
$('saveSetBtn').onclick=saveCurrentAsSet;
$('duplicateBtn').onclick=duplicateCurrentGame;
$('deleteBtn').onclick=deleteCurrentGame;
$('nextStageBtn').onclick=nextStage;
$('pauseBtn').onclick=togglePause;

$('copyInviteBtn').onclick=()=>copyInvite('inviteLink','copyInviteBtn');
$('copyViewerInviteBtn').onclick=()=>copyInvite('viewerInviteLink','copyViewerInviteBtn');

async function copyInvite(linkId, buttonId){
  const text=$(linkId).textContent.trim();
  if(!text)return;
  try{
    await navigator.clipboard.writeText(text);
    $(buttonId).textContent='âœ“ Ð¡ÐºÐ¾Ð¿Ñ–Ð¹Ð¾Ð²Ð°Ð½Ð¾';
    setTimeout(()=>$(buttonId).textContent='ðŸ“‹ ÐšÐ¾Ð¿Ñ–ÑŽÐ²Ð°Ñ‚Ð¸',1200);
  }catch{
    alert('ÐÐµ Ð²Ð´Ð°Ð»Ð¾ÑÑ ÑÐºÐ¾Ð¿Ñ–ÑŽÐ²Ð°Ñ‚Ð¸. Ð¡ÐºÐ¾Ð¿Ñ–ÑŽÐ¹ Ð¿Ð¾ÑÐ¸Ð»Ð°Ð½Ð½Ñ Ð²Ñ€ÑƒÑ‡Ð½Ñƒ.');
  }
}


checkAdminSession();

async function loginAdmin(){
  const password=$('adminPassword').value.trim();
  $('loginMsg').textContent='';
  $('loginBtn').disabled=true;

  try{
    const res=await fetch('/api/admin-login',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({password})
    });

    if(!res.ok){
      $('loginMsg').textContent='ÐÐµÐ¿Ñ€Ð°Ð²Ð¸Ð»ÑŒÐ½Ð¸Ð¹ Ð¿Ð°Ñ€Ð¾Ð»ÑŒ';
      return;
    }

    localStorage.setItem('admin_ok','1');
    await showMenu();
  }catch{
    $('loginMsg').textContent='ÐÐµ Ð²Ð´Ð°Ð»Ð¾ÑÑ Ð¿ÐµÑ€ÐµÐ²Ñ–Ñ€Ð¸Ñ‚Ð¸ Ð¿Ð°Ñ€Ð¾Ð»ÑŒ. Ð¡Ð¿Ñ€Ð¾Ð±ÑƒÐ¹ Ñ‰Ðµ Ñ€Ð°Ð·.';
  }finally{
    $('loginBtn').disabled=false;
  }
}

async function logoutAdmin(){
  try{await fetch('/api/admin-logout',{method:'POST'})}catch{}
  localStorage.removeItem('admin_ok');
  localStorage.removeItem('current_game_id');
  location.reload();
}

async function checkAdminSession(){
  try{
    const res=await fetch('/api/admin-session');
    const data=await res.json();
    if(data.ok){
      localStorage.setItem('admin_ok','1');
      await showMenu();
      return;
    }
  }catch{}

  localStorage.removeItem('admin_ok');
  show(loginCard);
  hide(menuCard);
  hide(gameCard);
}

async function showMenu(){
  currentGame=null;
  if(channel) supabase.removeChannel(channel);
  hide(loginCard);hide(gameCard);show(menuCard);hide(createPanel);
  await Promise.all([loadGames(),loadSets()]);
}

async function loadGames(){
  const {data,error}=await adminDb.from('games').select('*').order('id',{ascending:false});
  if(error){alert(error.message);return}
  games=data||[];renderGames();
}

async function loadSets(){
  const {data,error}=await adminDb.from('question_sets').select('*').order('id',{ascending:false});
  if(error){$('setsList').innerHTML='<p class="muted">Ð©Ð¾Ð± Ð¿Ñ€Ð°Ñ†ÑŽÐ²Ð°Ð»Ð¸ Ð½Ð°Ð±Ð¾Ñ€Ð¸ Ð¿Ð¸Ñ‚Ð°Ð½ÑŒ, ÑÑ‚Ð²Ð¾Ñ€Ð¸ Ñ‚Ð°Ð±Ð»Ð¸Ñ†ÑŽ question_sets. SQL Ð´Ð°Ð¼ Ð½Ð¸Ð¶Ñ‡Ðµ.</p>';return}
  sets=data||[];renderSets();
}

function renderGames(){
  $('gamesList').innerHTML=games.length?games.map(g=>`
    <div class="gameItem">
      <div><h3>${escapeHtml(g.title||'Ð“Ñ€Ð°')}</h3><p class="muted">ÐšÐ¾Ð´: <b>${escapeHtml(g.invite_code)}</b> Â· ${escapeHtml(g.phase||'lobby')} Â· ${escapeHtml(g.status||'active')}</p></div>
      <div class="actions"><button onclick="window.openGameById(${g.id})">Ð’Ñ–Ð´ÐºÑ€Ð¸Ñ‚Ð¸</button><button class="secondary" onclick="window.duplicateGameById(${g.id})">Ð”ÑƒÐ±Ð»ÑŽÐ²Ð°Ñ‚Ð¸</button><button class="danger" onclick="window.deleteGameById(${g.id})">Ð’Ð¸Ð´Ð°Ð»Ð¸Ñ‚Ð¸</button></div>
    </div>`).join(''):'<p class="muted">Ð—Ð±ÐµÑ€ÐµÐ¶ÐµÐ½Ð¸Ñ… Ñ–Ð³Ð¾Ñ€ Ð¿Ð¾ÐºÐ¸ Ð½ÐµÐ¼Ð°Ñ”.</p>';
}

function renderSets(){
  $('setsList').innerHTML=sets.length?sets.map(s=>`
    <div class="gameItem">
      <div><h3>${escapeHtml(s.title||'ÐÐ°Ð±Ñ–Ñ€ Ð¿Ð¸Ñ‚Ð°Ð½ÑŒ')}</h3><p class="muted">ÐŸÐ¸Ñ‚Ð°Ð½ÑŒ: ${safeJson(s.questions_json).length}</p></div>
      <div class="actions"><button onclick="window.createGameFromSet(${s.id})">Ð¡Ñ‚Ð²Ð¾Ñ€Ð¸Ñ‚Ð¸ Ð³Ñ€Ñƒ</button><button class="danger" onclick="window.deleteSet(${s.id})">Ð’Ð¸Ð´Ð°Ð»Ð¸Ñ‚Ð¸</button></div>
    </div>`).join(''):'<p class="muted">ÐÐ°Ð±Ð¾Ñ€Ñ–Ð² Ð¿Ð¸Ñ‚Ð°Ð½ÑŒ Ð¿Ð¾ÐºÐ¸ Ð½ÐµÐ¼Ð°Ñ”.</p>';
}

$('createGameBtn').onclick=async()=>{
  const title=$('gameTitle').value.trim()||'Ð“Ñ€Ð° Ð’Ð°Ñ€Ñ–Ð°Ð½Ñ‚Ð¸';
  const game_password=$('gamePassword').value.trim()||'game123';
  let host_avatar=$('hostAvatar').value.trim()||'ðŸ‘‘';
  const file=$('hostAvatarFile')?.files?.[0];
  try{if(file)host_avatar=await uploadPublicFile(file,'host-avatars')}catch(e){alert('Ð¤Ð¾Ñ‚Ð¾ Ð²ÐµÐ´ÑƒÑ‡Ð¾Ñ— Ð½Ðµ Ð·Ð°Ð²Ð°Ð½Ñ‚Ð°Ð¶Ð¸Ð»Ð¾ÑÑŒ: '+e.message);return}
  const {data,error}=await adminDb.from('games').insert({invite_code:makeCode(),title,game_password,host_avatar,status:'active',phase:'lobby',current_q:0,scoreboard_visible:0,created_at:new Date().toISOString()}).select().single();
  if(error){alert(error.message);return}
  openGame(data);
};

window.openGameById=async(id)=>{const {data,error}=await adminDb.from('games').select('*').eq('id',id).single();if(error){alert(error.message);return}openGame(data)};
window.deleteGameById=async(id)=>{if(!confirm('Ð’Ð¸Ð´Ð°Ð»Ð¸Ñ‚Ð¸ Ð³Ñ€Ñƒ?'))return;const {error}=await adminDb.from('games').delete().eq('id',id);if(error)alert(error.message);await loadGames()};
window.duplicateGameById=async(id)=>{
  const source=games.find(g=>Number(g.id)===Number(id)); if(!source)return;
  const {data:qs}=await adminDb.from('questions').select('*').eq('game_id',id).order('q_order',{ascending:true});
  const {data:newGame,error}=await adminDb.from('games').insert({invite_code:makeCode(),title:(source.title||'Ð“Ñ€Ð°')+' ÐºÐ¾Ð¿Ñ–Ñ',game_password:source.game_password||'game123',host_avatar:source.host_avatar||'ðŸ‘‘',status:'active',phase:'lobby',current_q:0,scoreboard_visible:0,created_at:new Date().toISOString()}).select().single();
  if(error){alert(error.message);return}
  await insertQuestions(newGame.id,qs||[]); await loadGames();
};
window.createGameFromSet=async(id)=>{
  const set=sets.find(s=>Number(s.id)===Number(id));if(!set)return;
  const title=prompt('ÐÐ°Ð·Ð²Ð° Ð³Ñ€Ð¸:',set.title||'Ð“Ñ€Ð° Ð’Ð°Ñ€Ñ–Ð°Ð½Ñ‚Ð¸')||'Ð“Ñ€Ð° Ð’Ð°Ñ€Ñ–Ð°Ð½Ñ‚Ð¸';
  const game_password=prompt('ÐŸÐ°Ñ€Ð¾Ð»ÑŒ Ð´Ð»Ñ Ð³Ñ€Ð°Ð²Ñ†Ñ–Ð²:','game123')||'game123';
  const {data:newGame,error}=await adminDb.from('games').insert({invite_code:makeCode(),title,game_password,host_avatar:'ðŸ‘‘',status:'active',phase:'lobby',current_q:0,scoreboard_visible:0,created_at:new Date().toISOString()}).select().single();
  if(error){alert(error.message);return}
  await insertQuestions(newGame.id,safeJson(set.questions_json)); openGame(newGame);
};
window.deleteSet=async(id)=>{if(!confirm('Ð’Ð¸Ð´Ð°Ð»Ð¸Ñ‚Ð¸ Ð½Ð°Ð±Ñ–Ñ€?'))return;const {error}=await adminDb.from('question_sets').delete().eq('id',id);if(error)alert(error.message);await loadSets()};

async function insertQuestions(gameId,source){
  const rows=(source||[]).map((q,i)=>({game_id:gameId,q_order:Number(q.q_order??i),round_no:Number(q.round_no??roundNo(i)),text:q.text,correct_answer:q.correct_answer,fake_answer:q.fake_answer,photo_url:q.photo_url,options_json:'[]',revealed_json:'[]'}));
  if(rows.length)await adminDb.from('questions').insert(rows);
}

async function duplicateCurrentGame(){if(!currentGame)return;await window.duplicateGameById(currentGame.id);alert('Ð“Ñ€Ñƒ Ð¿Ñ€Ð¾Ð´ÑƒÐ±Ð»ÑŒÐ¾Ð²Ð°Ð½Ð¾')}

async function openGame(game){
  currentGame=game; localStorage.setItem('current_game_id',game.id);
  hide(loginCard);hide(menuCard);show(gameCard);
  $('gameName').textContent=game.title;
  $('inviteLink').textContent=`${location.origin}/game.html?code=${game.invite_code}`;
  $('viewerInviteLink').textContent=`${location.origin}/viewer.html?code=${game.invite_code}`;
  subscribe(game.id); await loadData(); renderQuestionEditor();
}

function openSettings(){
  if(!currentGame)return;
  $('editTitle').value=currentGame.title||'';
  $('editPassword').value=currentGame.game_password||'';
  $('editHostAvatar').value=currentGame.host_avatar||'';
  show(settingsPanel);
}

async function saveSettings(){
  let host_avatar=$('editHostAvatar').value.trim()||'ðŸ‘‘';
  const file=$('editHostAvatarFile')?.files?.[0];
  try{if(file)host_avatar=await uploadPublicFile(file,'host-avatars')}catch(e){alert('Ð¤Ð¾Ñ‚Ð¾ Ð½Ðµ Ð·Ð°Ð²Ð°Ð½Ñ‚Ð°Ð¶Ð¸Ð»Ð¾ÑÑŒ: '+e.message);return}
  const update={title:$('editTitle').value.trim()||'Ð“Ñ€Ð° Ð’Ð°Ñ€Ñ–Ð°Ð½Ñ‚Ð¸',game_password:$('editPassword').value.trim()||'game123',host_avatar};
  const {data,error}=await adminDb.from('games').update(update).eq('id',currentGame.id).select().single();
  if(error){alert(error.message);return}
  currentGame=data;$('gameName').textContent=data.title;hide(settingsPanel);await loadData();alert('Ð—Ð±ÐµÑ€ÐµÐ¶ÐµÐ½Ð¾');
}

async function loadData(){
  if(!currentGame||loading)return;loading=true;
  try{
    const [gRes,qRes,pRes]=await Promise.all([
      adminDb.from('games').select('*').eq('id',currentGame.id).single(),
      adminDb.from('questions').select('*').eq('game_id',currentGame.id).order('q_order',{ascending:true}),
      adminDb.from('players').select('*').eq('game_id',currentGame.id).order('score',{ascending:false})
    ]);
    if(!gRes.error&&gRes.data)currentGame=gRes.data;
    questions=qRes.data||[]; players=pRes.data||[];
    const q=getCurrentQuestion();
    if(q){
      const [aRes,vRes]=await Promise.all([adminDb.from('answers').select('*').eq('question_id',q.id),adminDb.from('votes').select('*').eq('question_id',q.id)]);
      answers=aRes.data||[];votes=vRes.data||[];
    }else{answers=[];votes=[]}
    renderAll();
  }finally{loading=false}
}

function getCurrentQuestion(){return questions[Number(currentGame?.current_q||0)]||null}
function renderAll(){
  renderPlayers();
  renderScore();

  if(currentGame?.phase === 'finished' || currentGame?.status === 'finished'){
    renderFinishedAdminScreen();
    return;
  }

  const nextBtn = $('nextStageBtn');
  if(nextBtn){
    nextBtn.disabled=false;
    nextBtn.textContent='ÐÐ°ÑÑ‚ÑƒÐ¿Ð½Ð¸Ð¹ ÐµÑ‚Ð°Ð¿';
  }

  renderAdminState();
  renderRevealPanel();
  renderNextHint();
  renderPauseButton();
}

function renderPauseButton(){
  const btn=$('pauseBtn');
  if(!btn)return;
  const phase=currentGame?.phase;
  const canPause=['answering','voting','paused_answering','paused_voting'].includes(phase);
  btn.disabled=!canPause;
  btn.textContent=phase==='paused_answering'||phase==='paused_voting'?'ÐŸÑ€Ð¾Ð´Ð¾Ð²Ð¶Ð¸Ñ‚Ð¸ Ñ‚Ð°Ð¹Ð¼ÐµÑ€':'ÐŸÐ°ÑƒÐ·Ð° Ñ‚Ð°Ð¹Ð¼ÐµÑ€Ð°';
}

function renderPlayers(){
  $('playersList').innerHTML=players.length?players.map(p=>`<div class="playerRow"><div class="avatarLine">${avatarHtml(p)}<b>${escapeHtml(p.name)}</b></div><div class="scoreControls"><button class="secondary smallBtn" onclick="window.adjustScore(${p.id},-1)">-1</button><b>${p.score||0}</b><button class="secondary smallBtn" onclick="window.adjustScore(${p.id},1)">+1</button></div></div>`).join(''):'<p class="muted">Ð“Ñ€Ð°Ð²Ñ†Ñ–Ð² Ñ‰Ðµ Ð½ÐµÐ¼Ð°Ñ”.</p>';
}
window.adjustScore=async(playerId,delta)=>{
  const p=players.find(x=>Number(x.id)===Number(playerId));
  if(!p)return;
  const {error}=await adminDb.from('players').update({score:Number(p.score||0)+Number(delta||0)}).eq('id',playerId);
  if(error)alert(error.message);
  await loadData();
};
function renderScore(){
  const arr=[...players].sort((a,b)=>Number(b.score||0)-Number(a.score||0));
  $('scoreBoard').innerHTML=arr.length?arr.map((p,i)=>`
    <div class="scoreCard rank${i+1}">
      <div class="avatarLine">${avatarHtml(p,'big')}<div><b>${i===0?'ðŸ¥‡':i===1?'ðŸ¥ˆ':i===2?'ðŸ¥‰':i+1+'.'} ${escapeHtml(p.name)}</b><p class="muted">${i===0?'Ð›Ñ–Ð´ÐµÑ€ Ð³Ñ€Ð¸':i===1?'Ð”Ñ€ÑƒÐ³Ðµ Ð¼Ñ–ÑÑ†Ðµ':i===2?'Ð¢Ñ€ÐµÑ‚Ñ” Ð¼Ñ–ÑÑ†Ðµ':'Ð£Ñ‡Ð°ÑÐ½Ð¸Ðº'}</p></div></div>
      <div class="scorePoints">${p.score||0}</div>
    </div>`).join(''):'<p class="muted">ÐŸÐ¾ÐºÐ¸ Ð½ÐµÐ¼Ð°Ñ” Ð±Ð°Ð»Ñ–Ð².</p>';
}

function adminWinnerHtml(){
  const arr=[...players].sort((a,b)=>Number(b.score||0)-Number(a.score||0));
  const winner=arr[0];

  if(!winner){
    return '<div class="winnerBox"><h2>Ð“Ñ€Ð° Ð·Ð°Ð²ÐµÑ€ÑˆÐµÐ½Ð°</h2><p class="muted">Ð“Ñ€Ð°Ð²Ñ†Ñ–Ð² Ð½ÐµÐ¼Ð°Ñ”.</p></div>';
  }

  return `
    <div class="winnerBox">
      <div class="winnerCup">ðŸ†</div>
      <h2>Ð“Ñ€Ð° Ð·Ð°Ð²ÐµÑ€ÑˆÐµÐ½Ð°</h2>
      <p class="muted">ÐŸÐµÑ€ÐµÐ¼Ð¾Ð¶ÐµÑ†ÑŒ Ð³Ñ€Ð¸</p>
      <div class="avatarLine winnerLine">${avatarHtml(winner,'big')}<b>${escapeHtml(winner.name)}</b></div>
      <div class="winnerPoints">${winner.score||0} Ð±Ð°Ð»Ñ–Ð²</div>
    </div>
    <h2>Ð¤Ñ–Ð½Ð°Ð»ÑŒÐ½Ð° Ñ‚Ð°Ð±Ð»Ð¸Ñ†Ñ</h2>
    ${arr.map((p,i)=>`
      <div class="scoreCard rank${i+1}">
        <div class="avatarLine">${avatarHtml(p,'big')}<div><b>${i===0?'ðŸ¥‡':i===1?'ðŸ¥ˆ':i===2?'ðŸ¥‰':i+1+'.'} ${escapeHtml(p.name)}</b><p class="muted">${i===0?'ÐŸÐµÑ€ÐµÐ¼Ð¾Ð¶ÐµÑ†ÑŒ':i===1?'Ð”Ñ€ÑƒÐ³Ðµ Ð¼Ñ–ÑÑ†Ðµ':i===2?'Ð¢Ñ€ÐµÑ‚Ñ” Ð¼Ñ–ÑÑ†Ðµ':'Ð£Ñ‡Ð°ÑÐ½Ð¸Ðº'}</p></div></div>
        <div class="scorePoints">${p.score||0}</div>
      </div>
    `).join('')}
  `;
}

function renderAdminState(){
  if(currentGame?.phase==='finished'){
    $('adminState').innerHTML=adminWinnerHtml();
    return;
  }

  const q=getCurrentQuestion();
  if(!q){$('adminState').innerHTML='<p class="muted">ÐŸÐ¸Ñ‚Ð°Ð½Ð½Ñ Ñ‰Ðµ Ð½Ðµ Ð´Ð¾Ð´Ð°Ð½Ñ–. ÐÐ°Ñ‚Ð¸ÑÐ½Ð¸ â€œÐŸÐ¸Ñ‚Ð°Ð½Ð½Ñâ€.</p>';return}
  const opts=safeJson(q.options_json);
  const paused=currentGame.phase==='paused_answering'||currentGame.phase==='paused_voting';
  const left=currentGame.phase==='answering'?leftSec(currentGame.answer_deadline):currentGame.phase==='voting'?leftSec(currentGame.vote_deadline):currentGame.phase==='paused_answering'?Number(currentGame.answer_deadline||0):currentGame.phase==='paused_voting'?Number(currentGame.vote_deadline||0):null;
  $('adminState').innerHTML=`
    <div class="pill">Ð¤Ð°Ð·Ð°: ${escapeHtml(currentGame.phase)}</div>
    <div class="pill">ÐŸÐ¸Ñ‚Ð°Ð½Ð½Ñ ${Number(currentGame.current_q)+1} / ${questions.length}</div>
    ${left!==null?`<div class="timer smallTimer">${paused?'ÐŸÐ°ÑƒÐ·Ð° Â· ':''}${left} ÑÐµÐº</div>`:''}
    <div class="question">${escapeHtml(q.text)}</div>
    ${q.photo_url?`<img class="photo clickablePhoto" src="${escapeHtml(q.photo_url)}" alt="Ð¤Ð¾Ñ‚Ð¾" onclick="window.openPhoto('${escapeHtml(q.photo_url)}')">`:''}

    <div class="statsGrid">
      <div class="statCard"><b>${answers.length}</b><span>Ð²Ñ–Ð´Ð¿Ð¾Ð²Ñ–Ð´ÐµÐ¹ Ð· ${players.length}</span></div>
      <div class="statCard"><b>${votes.length}</b><span>Ð³Ð¾Ð»Ð¾ÑÑ–Ð² Ð· ${players.length}</span></div>
    </div>

    ${paused?'<div class="finalNote">Ð¢Ð°Ð¹Ð¼ÐµÑ€ Ð½Ð° Ð¿Ð°ÑƒÐ·Ñ–. Ð“Ñ€Ð°Ð²Ñ†Ñ– Ð±Ð°Ñ‡Ð°Ñ‚ÑŒ Ð¿Ð°ÑƒÐ·Ñƒ Ñ– Ð½Ðµ Ð¼Ð¾Ð¶ÑƒÑ‚ÑŒ Ð¿Ñ€Ð¾Ð´Ð¾Ð²Ð¶Ð¸Ñ‚Ð¸ Ð´Ñ–ÑŽ, Ð´Ð¾ÐºÐ¸ Ñ‚Ð¸ Ð½Ðµ Ð½Ð°Ñ‚Ð¸ÑÐ½ÐµÑˆ â€œÐŸÑ€Ð¾Ð´Ð¾Ð²Ð¶Ð¸Ñ‚Ð¸ Ñ‚Ð°Ð¹Ð¼ÐµÑ€â€.</div>':''}
    <h3>Ð’Ñ–Ð´Ð¿Ð¾Ð²Ñ–Ð´Ñ– Ð½Ð°Ð¶Ð¸Ð²Ð¾</h3>
    ${answers.length?answers.map(a=>{const p=players.find(x=>Number(x.id)===Number(a.player_id));return `<div class="liveRow"><span class="avatarLine">${avatarHtml(p||{})}<b>${escapeHtml(p?.name||'Ð“Ñ€Ð°Ð²ÐµÑ†ÑŒ')}</b></span><span>${escapeHtml(a.text)}</span></div>`}).join(''):'<p class="muted">Ð©Ðµ Ð½ÐµÐ¼Ð°Ñ” Ð²Ñ–Ð´Ð¿Ð¾Ð²Ñ–Ð´ÐµÐ¹.</p>'}
    ${opts.length?`<h3>Ð’Ð°Ñ€Ñ–Ð°Ð½Ñ‚Ð¸</h3>${opts.map((o,i)=>`<div class="optionPreview">${i+1}. ${escapeHtml(o.text)}</div>`).join('')}`:''}`;
}

function renderNextHint(){
  const map={lobby:'Ð”Ð°Ð»Ñ–: Ð¿Ð¾ÐºÐ°Ð·Ð°Ñ‚Ð¸ Ð¿Ð¸Ñ‚Ð°Ð½Ð½Ñ',question_preview:'Ð”Ð°Ð»Ñ–: Ð¿Ð¾Ñ‡Ð°Ñ‚Ð¸ Ð²Ñ–Ð´Ð¿Ð¾Ð²Ñ–Ð´Ñ–',answering:'Ð”Ð°Ð»Ñ–: Ð¿Ð¾ÐºÐ°Ð·Ð°Ñ‚Ð¸ Ð²Ð°Ñ€Ñ–Ð°Ð½Ñ‚Ð¸',paused_answering:'Ð¢Ð°Ð¹Ð¼ÐµÑ€ Ð½Ð° Ð¿Ð°ÑƒÐ·Ñ–: ÑÐ¿Ð¾Ñ‡Ð°Ñ‚ÐºÑƒ Ð½Ð°Ñ‚Ð¸ÑÐ½Ð¸ â€œÐŸÑ€Ð¾Ð´Ð¾Ð²Ð¶Ð¸Ñ‚Ð¸ Ñ‚Ð°Ð¹Ð¼ÐµÑ€â€',preview:'Ð”Ð°Ð»Ñ–: Ð¿Ð¾Ñ‡Ð°Ñ‚Ð¸ Ð³Ð¾Ð»Ð¾ÑÑƒÐ²Ð°Ð½Ð½Ñ',voting:'Ð”Ð°Ð»Ñ–: Ð·Ð°Ð²ÐµÑ€ÑˆÐ¸Ñ‚Ð¸ Ð³Ð¾Ð»Ð¾ÑÑƒÐ²Ð°Ð½Ð½Ñ',paused_voting:'Ð¢Ð°Ð¹Ð¼ÐµÑ€ Ð½Ð° Ð¿Ð°ÑƒÐ·Ñ–: ÑÐ¿Ð¾Ñ‡Ð°Ñ‚ÐºÑƒ Ð½Ð°Ñ‚Ð¸ÑÐ½Ð¸ â€œÐŸÑ€Ð¾Ð´Ð¾Ð²Ð¶Ð¸Ñ‚Ð¸ Ñ‚Ð°Ð¹Ð¼ÐµÑ€â€',results:'Ð”Ð°Ð»Ñ–: Ð½Ð°ÑÑ‚ÑƒÐ¿Ð½Ðµ Ð¿Ð¸Ñ‚Ð°Ð½Ð½Ñ',finished:'Ð“Ñ€Ð° Ð·Ð°Ð²ÐµÑ€ÑˆÐµÐ½Ð°'};
  if(currentGame?.phase==='results' && Number(currentGame.current_q||0) >= questions.length-1){
    $('nextHint').textContent='Ð”Ð°Ð»Ñ–: Ð¿Ð¾ÐºÐ°Ð·Ð°Ñ‚Ð¸ Ñ„Ñ–Ð½Ð°Ð»ÑŒÐ½Ð¸Ð¹ Ñ€ÐµÐ·ÑƒÐ»ÑŒÑ‚Ð°Ñ‚';
    return;
  }
  $('nextHint').textContent=map[currentGame?.phase]||'';
}

function renderRevealPanel(){
  const q=getCurrentQuestion();
  if(!q||currentGame.phase!=='results'){$('revealPanel').innerHTML='';return}
  const opts=safeJson(q.options_json), revealed=safeJson(q.revealed_json);
  const shown=opts.filter(o=>revealed.includes(o.id));
  $('revealPanel').innerHTML=`
    <h2>Ð’Ñ–Ð´ÐºÑ€Ð¸Ñ‚Ñ‚Ñ Ð²Ñ–Ð´Ð¿Ð¾Ð²Ñ–Ð´ÐµÐ¹</h2>
    <p class="muted">Ð’Ñ–Ð´ÐºÑ€Ð¸Ð²Ð°Ð¹ Ð²Ð°Ñ€Ñ–Ð°Ð½Ñ‚Ð¸ Ð¿Ð¾ Ð¾Ð´Ð½Ð¾Ð¼Ñƒ. ÐÐ¸Ð¶Ñ‡Ðµ Ð¾Ð´Ñ€Ð°Ð·Ñƒ Ð²Ð¸Ð´Ð½Ð¾, Ñ…Ñ‚Ð¾ Ð³Ð¾Ð»Ð¾ÑÑƒÐ²Ð°Ð² Ð·Ð° ÐºÐ¾Ð¶Ð½Ñƒ Ð²Ñ–Ð´ÐºÑ€Ð¸Ñ‚Ñƒ Ð²Ñ–Ð´Ð¿Ð¾Ð²Ñ–Ð´ÑŒ.</p>
    ${opts.length?opts.map((o,i)=>`<button class="option revealBtn" onclick="window.revealOption('${escapeHtml(o.id)}')">${revealed.includes(o.id)?'âœ“ ':''}${i+1}. ${escapeHtml(o.text)}</button>`).join(''):'<p class="muted">Ð’Ð°Ñ€Ñ–Ð°Ð½Ñ‚Ð¸ Ñ‰Ðµ Ð½Ðµ ÑÑ‚Ð²Ð¾Ñ€ÐµÐ½Ñ–.</p>'}
    ${shown.length?`<div class="revealedAnswers">${shown.map(revealCard).join('')}</div>`:'<p class="muted">Ð©Ðµ Ð½Ñ–Ñ‡Ð¾Ð³Ð¾ Ð½Ðµ Ð²Ñ–Ð´ÐºÑ€Ð¸Ñ‚Ð¾.</p>'}
  `;
}
window.revealOption=async(optionId)=>{const q=getCurrentQuestion();if(!q)return;const revealed=safeJson(q.revealed_json);if(!revealed.includes(optionId))revealed.push(optionId);const {error}=await adminDb.from('questions').update({revealed_json:JSON.stringify(revealed)}).eq('id',q.id);if(error)alert(error.message);await loadData()};

function revealCard(o){
  const voters=votes.filter(v=>v.option_id===o.id).map(v=>players.find(p=>Number(p.id)===Number(v.player_id))).filter(Boolean);
  let authorHtml='',label='';
  if(o.type==='correct'){authorHtml=avatarHtml({name:'ÐŸÑ€Ð°Ð²Ð¸Ð»ÑŒÐ½Ð°',avatar:'âœ“'},'big');label='ÐŸÑ€Ð°Ð²Ð¸Ð»ÑŒÐ½Ð° Ð²Ñ–Ð´Ð¿Ð¾Ð²Ñ–Ð´ÑŒ'}
  if(o.type==='fake'){authorHtml=hostAvatarHtml(currentGame,'big');label='Ð¤ÐµÐ¹Ðº Ð²ÐµÐ´ÑƒÑ‡Ð¾Ñ—'}
  if(o.type==='player'){
    const author=players.find(p=>Number(p.id)===Number(o.player_id));
    authorHtml=avatarHtml(author||{name:'Ð“Ñ€Ð°Ð²ÐµÑ†ÑŒ',avatar:'?'},'big');
    label=author?author.name:'Ð“Ñ€Ð°Ð²ÐµÑ†ÑŒ';
  }
  return `<div class="revealRow revealGrid"><div class="avatarLine authorSide">${authorHtml}<b>${escapeHtml(label)}</b></div><div><span class="tag ${o.type==='correct'?'correct':o.type==='fake'?'fake':''}">${o.type==='correct'?'ÐŸÑ€Ð°Ð²Ð¸Ð»ÑŒÐ½Ð°':o.type==='fake'?'Ð¤ÐµÐ¹Ðº':'Ð“Ñ€Ð°Ð²ÐµÑ†ÑŒ'}</span><div class="answerBig">${escapeHtml(o.text)}</div></div><div><b>Ð“Ð¾Ð»Ð¾ÑÑƒÐ²Ð°Ð»Ð¸:</b>${voters.length?voters.map(v=>`<div class="avatarLine voterMini">${avatarHtml(v,'small')}<span>${escapeHtml(v.name)}</span></div>`).join(''):'<p class="muted">ÐÑ–Ñ…Ñ‚Ð¾</p>'}</div></div>`;
}

function renderQuestionEditor(){
  const byOrder=new Map(questions.map(q=>[Number(q.q_order),q]));

  $('questionsForm').innerHTML=Array.from({length:TOTAL_QUESTIONS},(_,i)=>{
    const q=byOrder.get(i)||{}, r=roundNo(i);
    const hasPhoto=Boolean(q.photo_url);

    return `
      <div class="qedit">
        <h3>ÐŸÐ¸Ñ‚Ð°Ð½Ð½Ñ ${i+1} Â· Ð Ð°ÑƒÐ½Ð´ ${r} ${r===3?'<small>Ð¼Ð¾Ð¶Ð½Ð° Ñ„Ð¾Ñ‚Ð¾</small>':''}</h3>
        <textarea id="q_${i}" placeholder="Ð¢ÐµÐºÑÑ‚ Ð¿Ð¸Ñ‚Ð°Ð½Ð½Ñ">${escapeHtml(q.text||'')}</textarea>
        <input id="c_${i}" placeholder="ÐŸÑ€Ð°Ð²Ð¸Ð»ÑŒÐ½Ð° Ð²Ñ–Ð´Ð¿Ð¾Ð²Ñ–Ð´ÑŒ" value="${escapeHtml(q.correct_answer||'')}"/>
        <input id="f_${i}" placeholder="Ð¤ÐµÐ¹Ðº Ð²ÐµÐ´ÑƒÑ‡Ð¾Ñ—" value="${escapeHtml(q.fake_answer||'')}"/>
        <input id="url_${i}" type="hidden" value="${escapeHtml(q.photo_url||'')}"/>

        ${hasPhoto?`<img class="thumb photoPreview" id="preview_${i}" src="${escapeHtml(q.photo_url)}" alt="Ð¤Ð¾Ñ‚Ð¾">`:`<img class="thumb photoPreview hidden" id="preview_${i}" alt="Ð¤Ð¾Ñ‚Ð¾">`}

        ${r===3?`
          <label class="fileLabel">
            Ð¤Ð¾Ñ‚Ð¾ Ð´Ð¾ Ð¿Ð¸Ñ‚Ð°Ð½Ð½Ñ
            <input id="file_${i}" type="file" accept="image/*">
          </label>
        `:''}
      </div>
    `;
  }).join('');

  attachPhotoPreviews();
}

function attachPhotoPreviews(){
  for(let i=0;i<TOTAL_QUESTIONS;i++){
    const input=$(`file_${i}`);
    const preview=$(`preview_${i}`);
    if(!input||!preview)continue;

    input.onchange=()=>{
      const file=input.files?.[0];
      if(!file)return;

      const reader=new FileReader();
      reader.onload=e=>{
        preview.src=e.target.result;
        preview.classList.remove('hidden');
      };
      reader.readAsDataURL(file);
    };
  }
}

async function saveQuestions(){
  if(!confirm('Ð—Ð±ÐµÑ€ÐµÐ³Ñ‚Ð¸ Ð¿Ð¸Ñ‚Ð°Ð½Ð½Ñ? Ð’Ñ–Ð´Ð¿Ð¾Ð²Ñ–Ð´Ñ–, Ð³Ð¾Ð»Ð¾ÑÐ¸ Ð¹ Ð±Ð°Ð»Ð¸ Ñ†Ñ–Ñ”Ñ— Ð³Ñ€Ð¸ Ð±ÑƒÐ´ÑƒÑ‚ÑŒ ÑÐºÐ¸Ð½ÑƒÑ‚Ñ–.'))return;
  const rows=[];
  for(let i=0;i<TOTAL_QUESTIONS;i++){
    const text=$(`q_${i}`).value.trim(), correct=$(`c_${i}`).value.trim(), fake=$(`f_${i}`).value.trim();
    let photo_url=$(`url_${i}`)?.value.trim()||''; const file=$(`file_${i}`)?.files?.[0]||null;
    if(!text)continue;
    try{if(file)photo_url=await uploadPublicFile(file,`game-${currentGame.id}-questions`)}catch(e){alert('Ð¤Ð¾Ñ‚Ð¾ Ð½Ðµ Ð·Ð°Ð²Ð°Ð½Ñ‚Ð°Ð¶Ð¸Ð»Ð¾ÑÑŒ: '+e.message);return}
    rows.push({game_id:currentGame.id,q_order:i,round_no:roundNo(i),text,correct_answer:correct,fake_answer:fake,photo_url,options_json:'[]',revealed_json:'[]'});
  }
  await adminDb.from('votes').delete().eq('game_id',currentGame.id);
  await adminDb.from('answers').delete().eq('game_id',currentGame.id);
  await adminDb.from('points').delete().eq('game_id',currentGame.id);
  await adminDb.from('questions').delete().eq('game_id',currentGame.id);
  await adminDb.from('players').update({score:0}).eq('game_id',currentGame.id);
  if(rows.length){const {error}=await adminDb.from('questions').insert(rows);if(error){alert(error.message);return}}
  await adminDb.from('games').update({current_q:0,phase:'lobby',answer_deadline:null,vote_deadline:null,scoreboard_visible:0,status:'active',finished_at:null}).eq('id',currentGame.id);
  hide(questionEditor);await loadData();alert('ÐŸÐ¸Ñ‚Ð°Ð½Ð½Ñ Ð·Ð±ÐµÑ€ÐµÐ¶ÐµÐ½Ñ–');
}

async function saveCurrentAsSet(){
  if(!questions.length){alert('Ð¡Ð¿Ð¾Ñ‡Ð°Ñ‚ÐºÑƒ Ð´Ð¾Ð´Ð°Ð¹ Ð¿Ð¸Ñ‚Ð°Ð½Ð½Ñ');return}
  const title=prompt('ÐÐ°Ð·Ð²Ð° Ð½Ð°Ð±Ð¾Ñ€Ñƒ Ð¿Ð¸Ñ‚Ð°Ð½ÑŒ:',currentGame.title||'ÐÐ°Ð±Ñ–Ñ€ Ð¿Ð¸Ñ‚Ð°Ð½ÑŒ');
  if(!title)return;
  const clean=questions.map(q=>({q_order:q.q_order,round_no:q.round_no,text:q.text,correct_answer:q.correct_answer,fake_answer:q.fake_answer,photo_url:q.photo_url}));
  const {error}=await adminDb.from('question_sets').insert({title,questions_json:JSON.stringify(clean),created_at:new Date().toISOString()});
  if(error){alert(error.message);return}
  alert('ÐÐ°Ð±Ñ–Ñ€ Ð·Ð±ÐµÑ€ÐµÐ¶ÐµÐ½Ð¾');
}

async function nextStage(){
  if(currentGame?.phase==='finished' || currentGame?.status==='finished') return;
  const phase=currentGame?.phase||'lobby';
  if(phase==='paused_answering'||phase==='paused_voting'){alert('Ð¡Ð¿Ð¾Ñ‡Ð°Ñ‚ÐºÑƒ Ð¿Ñ€Ð¾Ð´Ð¾Ð²Ð¶ Ñ‚Ð°Ð¹Ð¼ÐµÑ€.');return}
  if(phase==='lobby')return doAction('show_question');
  if(phase==='question_preview')return doAction('start_answers');
  if(phase==='answering')return doAction('show_options');
  if(phase==='preview')return doAction('start_voting');
  if(phase==='voting')return doAction('finish_voting');
  if(phase==='results'){
    if(Number(currentGame.current_q||0) >= questions.length-1 && Date.now()>guardedNextUntil){
      guardedNextUntil=Date.now()+3500;
      $('nextStageBtn').textContent='ÐÐ°Ñ‚Ð¸ÑÐ½Ð¸ Ñ‰Ðµ Ñ€Ð°Ð·, Ñ‰Ð¾Ð± Ð·Ð°Ð²ÐµÑ€ÑˆÐ¸Ñ‚Ð¸';
      setTimeout(()=>{if(Date.now()>guardedNextUntil&&currentGame?.phase==='results'){$('nextStageBtn').textContent='ÐÐ°ÑÑ‚ÑƒÐ¿Ð½Ð¸Ð¹ ÐµÑ‚Ð°Ð¿';renderNextHint()}},3600);
      return;
    }
    return doAction('next_question');
  }
}

document.querySelectorAll('[data-action]').forEach(btn=>btn.onclick=()=>doAction(btn.dataset.action));

async function doAction(action){
  const q=getCurrentQuestion();
  if(!q&&action!=='finish_game'){alert('Ð¡Ð¿Ð¾Ñ‡Ð°Ñ‚ÐºÑƒ Ð´Ð¾Ð´Ð°Ð¹ Ð¿Ð¸Ñ‚Ð°Ð½Ð½Ñ.');return}
  if(action==='show_question')await updateGame({phase:'question_preview',answer_deadline:null,vote_deadline:null,scoreboard_visible:0});
  if(action==='start_answers')await updateGame({phase:'answering',answer_deadline:nowSec()+ANSWER_SECONDS});
  if(action==='show_options'){await buildOptions(q);await updateGame({phase:'preview',answer_deadline:null})}
  if(action==='start_voting')await updateGame({phase:'voting',vote_deadline:nowSec()+VOTE_SECONDS});
  if(action==='finish_voting'){await calculatePoints(q);await updateGame({phase:'results',vote_deadline:null})}
  if(action==='show_scoreboard')await updateGame({scoreboard_visible:1});
  if(action==='hide_scoreboard')await updateGame({scoreboard_visible:0});
  if(action==='finish_game'){if(!confirm('Ð—Ð°Ð²ÐµÑ€ÑˆÐ¸Ñ‚Ð¸ Ð³Ñ€Ñƒ Ð·Ð°Ñ€Ð°Ð·?'))return;await updateGame({phase:'finished',status:'finished',scoreboard_visible:1,finished_at:new Date().toISOString()})}
  if(action==='next_question'){const next=Number(currentGame.current_q||0)+1;if(next>=questions.length)await updateGame({phase:'finished',status:'finished',scoreboard_visible:1,finished_at:new Date().toISOString()});else await updateGame({current_q:next,phase:'question_preview',scoreboard_visible:0,answer_deadline:null,vote_deadline:null})}
  await loadData();
}
async function togglePause(){
  if(!currentGame)return;
  if(currentGame.phase==='answering'){
    await updateGame({phase:'paused_answering',answer_deadline:leftSec(currentGame.answer_deadline)});
  }else if(currentGame.phase==='voting'){
    await updateGame({phase:'paused_voting',vote_deadline:leftSec(currentGame.vote_deadline)});
  }else if(currentGame.phase==='paused_answering'){
    await updateGame({phase:'answering',answer_deadline:nowSec()+Math.max(1,Number(currentGame.answer_deadline||0))});
  }else if(currentGame.phase==='paused_voting'){
    await updateGame({phase:'voting',vote_deadline:nowSec()+Math.max(1,Number(currentGame.vote_deadline||0))});
  }
  await loadData();
}
async function updateGame(update){const {data,error}=await adminDb.from('games').update(update).eq('id',currentGame.id).select().single();if(error){alert(error.message);return}currentGame=data}
async function buildOptions(q){
  const {data:allAnswers}=await adminDb.from('answers').select('*').eq('question_id',q.id);
  const opts=[];(allAnswers||[]).forEach(a=>opts.push({id:`p_${a.player_id}`,type:'player',text:a.text,player_id:a.player_id}));
  if(q.correct_answer)opts.push({id:'correct',type:'correct',text:q.correct_answer,player_id:null});
  if(q.fake_answer)opts.push({id:'fake',type:'fake',text:q.fake_answer,player_id:null});
  const {error}=await adminDb.from('questions').update({options_json:JSON.stringify(shuffle(opts)),revealed_json:'[]'}).eq('id',q.id);if(error)alert(error.message);
}
async function calculatePoints(q){
  const {data:existing}=await adminDb.from('points').select('*').eq('question_id',q.id);if((existing||[]).length)return;
  const opts=safeJson(q.options_json), byId=new Map(opts.map(o=>[o.id,o]));
  const {data:allVotes}=await adminDb.from('votes').select('*').eq('question_id',q.id);
  const delta=new Map(players.map(p=>[Number(p.id),0]));
  (allVotes||[]).forEach(v=>{const opt=byId.get(v.option_id);if(!opt)return;if(opt.type==='correct')delta.set(Number(v.player_id),(delta.get(Number(v.player_id))||0)+2);if(opt.type==='fake')delta.set(Number(v.player_id),(delta.get(Number(v.player_id))||0)-1);if(opt.type==='player'&&Number(opt.player_id)!==Number(v.player_id))delta.set(Number(opt.player_id),(delta.get(Number(opt.player_id))||0)+1)});
  const rows=[...delta.entries()].map(([player_id,points])=>({game_id:currentGame.id,question_id:q.id,player_id,points,created_at:new Date().toISOString()}));
  if(rows.length)await adminDb.from('points').insert(rows);
  for(const [player_id,d] of delta.entries()){const p=players.find(x=>Number(x.id)===Number(player_id));if(p)await adminDb.from('players').update({score:Number(p.score||0)+Number(d||0)}).eq('id',player_id)}
}
async function deleteCurrentGame(){if(!currentGame)return;if(!confirm('Ð’Ð¸Ð´Ð°Ð»Ð¸Ñ‚Ð¸ Ð³Ñ€Ñƒ?'))return;const {error}=await adminDb.from('games').delete().eq('id',currentGame.id);if(error){alert(error.message);return}showMenu()}
function subscribe(gameId){
  if(channel)supabase.removeChannel(channel);
  channel=supabase.channel('admin-game-'+gameId)
  .on('postgres_changes',{event:'*',schema:'public',table:'players',filter:'game_id=eq.'+gameId},loadData)
  .on('postgres_changes',{event:'*',schema:'public',table:'questions',filter:'game_id=eq.'+gameId},loadData)
  .on('postgres_changes',{event:'*',schema:'public',table:'answers',filter:'game_id=eq.'+gameId},loadData)
  .on('postgres_changes',{event:'*',schema:'public',table:'votes',filter:'game_id=eq.'+gameId},loadData)
  .on('postgres_changes',{event:'*',schema:'public',table:'games',filter:'id=eq.'+gameId},p=>{currentGame=p.new;loadData()}).subscribe(s=>console.log('admin realtime',s));
}
function leftSec(deadline){if(!deadline)return 0;return Math.max(0,Number(deadline)-nowSec())}
setInterval(()=>{if(currentGame&&(currentGame.phase==='answering'||currentGame.phase==='voting'))renderAdminState()},1000);



function finalTableRowsHtml(){
  const arr=[...players].sort((a,b)=>Number(b.score||0)-Number(a.score||0));

  if(!arr.length){
    return '<p class="muted">ÐŸÐ¾ÐºÐ¸ Ð½ÐµÐ¼Ð°Ñ” Ð±Ð°Ð»Ñ–Ð².</p>';
  }

  return arr.map((p,i)=>`
    <div class="scoreCard rank${i+1}">
      <div class="avatarLine">
        ${avatarHtml(p,'big')}
        <div>
          <b>${i===0?'ðŸ¥‡':i===1?'ðŸ¥ˆ':i===2?'ðŸ¥‰':i+1+'.'} ${escapeHtml(p.name)}</b>
          <p class="muted">${i===0?'ÐŸÐµÑ€ÐµÐ¼Ð¾Ð¶ÐµÑ†ÑŒ':i===1?'Ð”Ñ€ÑƒÐ³Ðµ Ð¼Ñ–ÑÑ†Ðµ':i===2?'Ð¢Ñ€ÐµÑ‚Ñ” Ð¼Ñ–ÑÑ†Ðµ':'Ð£Ñ‡Ð°ÑÐ½Ð¸Ðº'}</p>
        </div>
      </div>
      <div class="scorePoints">${p.score||0}</div>
    </div>
  `).join('');
}

function finalWinnerHtml(){
  const arr=[...players].sort((a,b)=>Number(b.score||0)-Number(a.score||0));
  const winner=arr[0];
  const top3=arr.slice(0,3);

  if(!winner){
    return '<div class="winnerBox"><h2>Ð“Ñ€Ð° Ð·Ð°Ð²ÐµÑ€ÑˆÐµÐ½Ð°</h2><p class="muted">Ð“Ñ€Ð°Ð²Ñ†Ñ–Ð² Ð½ÐµÐ¼Ð°Ñ”.</p></div>';
  }

  return `
    <div class="winnerBox finalShow">
      <div class="confettiLayer"><span></span><span></span><span></span><span></span><span></span></div>
      <div class="winnerCup">ðŸ†</div>
      <h2>Ð“Ñ€Ð° Ð·Ð°Ð²ÐµÑ€ÑˆÐµÐ½Ð°</h2>
      <p class="muted">ÐŸÐµÑ€ÐµÐ¼Ð¾Ð¶ÐµÑ†ÑŒ Ð³Ñ€Ð¸</p>
      <div class="avatarLine winnerLine">${avatarHtml(winner,'big')}<b>${escapeHtml(winner.name)}</b></div>
      <div class="winnerPoints">${winner.score||0} Ð±Ð°Ð»Ñ–Ð²</div>
      <div class="podium">${top3.map((p,i)=>`<div class="podiumPlace place${i+1}"><div>${i===0?'ðŸ¥‡':i===1?'ðŸ¥ˆ':'ðŸ¥‰'}</div>${avatarHtml(p,'big')}<b>${escapeHtml(p.name)}</b><span>${p.score||0}</span></div>`).join('')}</div>
    </div>
    <h2>Ð¤Ñ–Ð½Ð°Ð»ÑŒÐ½Ð° Ñ‚Ð°Ð±Ð»Ð¸Ñ†Ñ</h2>
    ${finalTableRowsHtml()}
  `;
}

function renderFinishedAdminScreen(){
  $('adminState').innerHTML=finalWinnerHtml();
  $('revealPanel').innerHTML='';
  $('scoreBoard').innerHTML=finalTableRowsHtml();
  $('nextHint').textContent='Ð“Ñ€Ð° Ð·Ð°Ð²ÐµÑ€ÑˆÐµÐ½Ð°';

  const nextBtn=$('nextStageBtn');
  if(nextBtn){
    nextBtn.disabled=true;
    nextBtn.textContent='Ð“Ñ€Ð° Ð·Ð°Ð²ÐµÑ€ÑˆÐµÐ½Ð°';
  }
  const pauseBtn=$('pauseBtn');
  if(pauseBtn)pauseBtn.disabled=true;
}

