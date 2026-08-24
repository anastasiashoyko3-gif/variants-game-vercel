import {
  supabase, makeCode, escapeHtml, avatarHtml, hostAvatarHtml,
  TOTAL_QUESTIONS, ANSWER_SECONDS, VOTE_SECONDS, roundNo, nowSec,
  shuffle, safeJson, uploadPublicFile
} from './supabaseClient.js';
import { adminDb } from './adminDb.js';

let currentGame=null, games=[], sets=[], questions=[], players=[], answers=[], votes=[], wordEvents=[], channel=null, loading=false;
let guardedNextUntil=0;
let lastRenderedData='';

const $=id=>document.getElementById(id);
const loginCard=$('loginCard'), menuCard=$('menuCard'), createPanel=$('createPanel'), gameCard=$('gameCard');
const questionEditor=$('questionEditor'), settingsPanel=$('settingsPanel');

function show(el){el.hidden=false;el.classList.remove('hidden')}
function hide(el){el.hidden=true;el.classList.add('hidden')}

$('loginBtn').onclick=loginAdmin;
$('logoutBtn').onclick=logoutAdmin;
$('showCreateBtn').onclick=()=>show(createPanel);
$('cancelCreateBtn').onclick=()=>hide(createPanel);
$('gameMode').onchange=()=>toggleLettersSetup();
$('refreshBtn').onclick=showMenu;
$('backBtn').onclick=showMenu;
$('editQuestionsBtn').onclick=()=>{isLettersGame()?renderWordEditor():renderQuestionEditor();show(questionEditor)};
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
    $(buttonId).textContent='✓ Скопійовано';
    setTimeout(()=>$(buttonId).textContent='📋 Копіювати',1200);
  }catch{
    alert('Не вдалося скопіювати. Скопіюй посилання вручну.');
  }
}


checkAdminSession();
toggleLettersSetup();

function toggleLettersSetup(){
  if(!$('gameMode')||!$('lettersSetup'))return;
  $('lettersSetup').classList.toggle('hidden',$('gameMode').value!=='letters');
}

function defaultWordConfig(){
  const categories=Array.from({length:5},(_,i)=>$(`letterCat${i}`)?.value.trim()).filter(Boolean);
  const drawWords=Array.from({length:6},(_,i)=>$(`drawWord${i}`)?.value.trim()).filter(Boolean);
  return JSON.stringify({
    round:1,
    round1Stage:1,
    letter:'',
    letters9:[],
    categories,
    drawWords,
    drawOrder:[],
    usedDrawIndexes:[],
    drawTurn:0,
    activePlayerId:null,
    teams:[]
  });
}

function wordConfig(){
  return safeJson(currentGame?.word_config_json,{round:1,round1Stage:1,categories:[],drawWords:[],drawOrder:[],usedDrawIndexes:[],drawTurn:0,teams:[],letters9:[]});
}

async function saveWordConfig(config,extra={}){
  await updateGame({word_config_json:JSON.stringify(config),...extra});
}

function isLettersGame(){
  return currentGame?.mode==='letters';
}

function uaLetter(){
  const letters='АБВГҐДЕЄЖЗИІЇЙКЛМНОПРСТУФХЦЧШЩЮЯ'.split('');
  return letters[Math.floor(Math.random()*letters.length)];
}

function nineLetters(){
  const vowels='АОУЕИІЯЮЄ'.split('');
  const consonants='БВГДЖЗКЛМНПРСТФХЦЧШ'.split('');
  const all=[...vowels.sort(()=>Math.random()-.5).slice(0,3),...consonants.sort(()=>Math.random()-.5).slice(0,6)];
  return shuffle(all);
}

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
      $('loginMsg').textContent='Неправильний пароль';
      return;
    }

    localStorage.setItem('admin_ok','1');
    await showMenu();
  }catch{
    $('loginMsg').textContent='Не вдалося перевірити пароль. Спробуй ще раз.';
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
  if(error){$('setsList').innerHTML='<p class="muted">Щоб працювали набори питань, створи таблицю question_sets. SQL дам нижче.</p>';return}
  sets=data||[];renderSets();
}

function renderGames(){
  $('gamesList').innerHTML=games.length?games.map(g=>`
    <div class="gameItem">
      <div><h3>${escapeHtml(g.title||'Гра')}</h3><p class="muted">Код: <b>${escapeHtml(g.invite_code)}</b> · ${escapeHtml(g.phase||'lobby')} · ${escapeHtml(g.status||'active')}</p></div>
      <div class="actions"><button onclick="window.openGameById(${g.id})">Відкрити</button><button class="secondary" onclick="window.duplicateGameById(${g.id})">Дублювати</button><button class="danger" onclick="window.deleteGameById(${g.id})">Видалити</button></div>
    </div>`).join(''):'<p class="muted">Збережених ігор поки немає.</p>';
}

function renderSets(){
  $('setsList').innerHTML=sets.length?sets.map(s=>`
    <div class="gameItem">
      <div><h3>${escapeHtml(s.title||'Набір питань')}</h3><p class="muted">Питань: ${safeJson(s.questions_json).length}</p></div>
      <div class="actions"><button onclick="window.createGameFromSet(${s.id})">Створити гру</button><button class="danger" onclick="window.deleteSet(${s.id})">Видалити</button></div>
    </div>`).join(''):'<p class="muted">Наборів питань поки немає.</p>';
}

$('createGameBtn').onclick=async()=>{
  const title=$('gameTitle').value.trim()||'Гра Варіанти';
  const game_password=$('gamePassword').value.trim()||'game123';
  let host_avatar=$('hostAvatar').value.trim()||'👑';
  const mode=$('gameMode')?.value||'variants';
  const wordConfig=mode==='letters'?defaultWordConfig():'{}';
  const file=$('hostAvatarFile')?.files?.[0];
  try{if(file)host_avatar=await uploadPublicFile(file,'host-avatars')}catch(e){alert('Фото ведучої не завантажилось: '+e.message);return}
  const {data,error}=await adminDb.from('games').insert({invite_code:makeCode(),title,game_password,host_avatar,mode,word_config_json:wordConfig,status:'active',phase:mode==='letters'?'word_lobby':'lobby',current_q:0,scoreboard_visible:0,created_at:new Date().toISOString()}).select().single();
  if(error){alert(error.message);return}
  openGame(data);
};

window.openGameById=async(id)=>{const {data,error}=await adminDb.from('games').select('*').eq('id',id).single();if(error){alert(error.message);return}openGame(data)};
window.deleteGameById=async(id)=>{if(!confirm('Видалити гру?'))return;const {error}=await adminDb.from('games').delete().eq('id',id);if(error)alert(error.message);await loadGames()};
window.duplicateGameById=async(id)=>{
  const source=games.find(g=>Number(g.id)===Number(id)); if(!source)return;
  const {data:qs}=await adminDb.from('questions').select('*').eq('game_id',id).order('q_order',{ascending:true});
  const mode=source.mode||'variants';
  const {data:newGame,error}=await adminDb.from('games').insert({invite_code:makeCode(),title:(source.title||'Гра')+' копія',game_password:source.game_password||'game123',host_avatar:source.host_avatar||'👑',mode,word_config_json:source.word_config_json||'{}',status:'active',phase:mode==='letters'?'word_lobby':'lobby',current_q:0,scoreboard_visible:0,created_at:new Date().toISOString()}).select().single();
  if(error){alert(error.message);return}
  await insertQuestions(newGame.id,qs||[]); await loadGames();
};
window.createGameFromSet=async(id)=>{
  const set=sets.find(s=>Number(s.id)===Number(id));if(!set)return;
  const title=prompt('Назва гри:',set.title||'Гра Варіанти')||'Гра Варіанти';
  const game_password=prompt('Пароль для гравців:','game123')||'game123';
  const {data:newGame,error}=await adminDb.from('games').insert({invite_code:makeCode(),title,game_password,host_avatar:'👑',status:'active',phase:'lobby',current_q:0,scoreboard_visible:0,created_at:new Date().toISOString()}).select().single();
  if(error){alert(error.message);return}
  await insertQuestions(newGame.id,safeJson(set.questions_json)); openGame(newGame);
};
window.deleteSet=async(id)=>{if(!confirm('Видалити набір?'))return;const {error}=await adminDb.from('question_sets').delete().eq('id',id);if(error)alert(error.message);await loadSets()};

async function insertQuestions(gameId,source){
  const rows=(source||[]).map((q,i)=>({game_id:gameId,q_order:Number(q.q_order??i),round_no:Number(q.round_no??roundNo(i)),text:q.text,correct_answer:q.correct_answer,fake_answer:q.fake_answer,photo_url:q.photo_url,options_json:'[]',revealed_json:'[]'}));
  if(rows.length)await adminDb.from('questions').insert(rows);
}

async function duplicateCurrentGame(){if(!currentGame)return;await window.duplicateGameById(currentGame.id);alert('Гру продубльовано')}

async function openGame(game){
  currentGame=game; lastRenderedData=''; localStorage.setItem('current_game_id',game.id);
  hide(loginCard);hide(menuCard);show(gameCard);
  $('gameName').textContent=game.title;
  $('inviteLink').textContent=`${location.origin}/game.html?code=${game.invite_code}`;
  $('viewerInviteLink').textContent=`${location.origin}/viewer.html?code=${game.invite_code}`;
  $('editQuestionsBtn').classList.remove('hidden');
  $('editQuestionsBtn').textContent=game.mode==='letters'?'Слова':'Питання';
  $('saveSetBtn').classList.toggle('hidden',game.mode==='letters');
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
  let host_avatar=$('editHostAvatar').value.trim()||'👑';
  const file=$('editHostAvatarFile')?.files?.[0];
  try{if(file)host_avatar=await uploadPublicFile(file,'host-avatars')}catch(e){alert('Фото не завантажилось: '+e.message);return}
  const update={title:$('editTitle').value.trim()||'Гра Варіанти',game_password:$('editPassword').value.trim()||'game123',host_avatar};
  const {data,error}=await adminDb.from('games').update(update).eq('id',currentGame.id).select().single();
  if(error){alert(error.message);return}
  currentGame=data;$('gameName').textContent=data.title;hide(settingsPanel);await loadData();alert('Збережено');
}

async function loadData(){
  if(!currentGame||loading)return;loading=true;
  try{
    const [gRes,qRes,pRes,eRes]=await Promise.all([
      adminDb.from('games').select('*').eq('id',currentGame.id).single(),
      adminDb.from('questions').select('*').eq('game_id',currentGame.id).order('q_order',{ascending:true}),
      adminDb.from('players').select('*').eq('game_id',currentGame.id).order('score',{ascending:false}),
      adminDb.from('word_events').select('*').eq('game_id',currentGame.id).order('id',{ascending:false})
    ]);
    if(!gRes.error&&gRes.data)currentGame=gRes.data;
    questions=qRes.data||[]; players=pRes.data||[];
    wordEvents=eRes.data||[];
    const q=getCurrentQuestion();
    if(q){
      const [aRes,vRes]=await Promise.all([adminDb.from('answers').select('*').eq('question_id',q.id),adminDb.from('votes').select('*').eq('question_id',q.id)]);
      answers=aRes.data||[];votes=vRes.data||[];
    }else{answers=[];votes=[]}
    const nextRenderedData=JSON.stringify({currentGame,questions,players,answers,votes,wordEvents});
    if(nextRenderedData!==lastRenderedData){
      lastRenderedData=nextRenderedData;
      renderAll();
    }
  }finally{loading=false}
}

function getCurrentQuestion(){return questions[Number(currentGame?.current_q||0)]||null}
function renderAll(){
  if(isLettersGame()){
    renderLettersAll();
    return;
  }

  renderPlayers();
  renderScore();

  if(currentGame?.phase === 'finished' || currentGame?.status === 'finished'){
    renderFinishedAdminScreen();
    return;
  }

  const nextBtn = $('nextStageBtn');
  if(nextBtn){
    nextBtn.disabled=false;
    nextBtn.textContent='Наступний етап';
  }

  renderAdminState();
  renderRevealPanel();
  renderNextHint();
  renderPauseButton();
}

function renderLettersAll(){
  renderLettersPlayers();
  renderLettersScore();
  $('revealPanel').innerHTML='';
  renderLettersAdminState();
  renderLettersHint();
  renderPauseButton();
}

function renderPauseButton(){
  const btn=$('pauseBtn');
  if(!btn)return;
  const phase=currentGame?.phase;
  const canPause=['answering','voting','paused_answering','paused_voting','word_round1_timer','word_draw_timer','word_words_timer','paused_word_round1','paused_word_draw','paused_word_words'].includes(phase);
  btn.disabled=!canPause;
  btn.textContent=['paused_answering','paused_voting','paused_word_round1','paused_word_draw','paused_word_words'].includes(phase)?'Продовжити таймер':'Пауза таймера';
}

function renderPlayers(){
  $('playersList').innerHTML=players.length?players.map(p=>`<div class="playerRow"><div class="avatarLine">${avatarHtml(p)}<b>${escapeHtml(p.name)}</b></div><div class="scoreControls"><button class="secondary smallBtn" onclick="window.adjustScore(${p.id},-1)">-1</button><b>${p.score||0}</b><button class="secondary smallBtn" onclick="window.adjustScore(${p.id},1)">+1</button></div></div>`).join(''):'<p class="muted">Гравців ще немає.</p>';
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
      <div class="avatarLine">${avatarHtml(p,'big')}<div><b>${i===0?'🥇':i===1?'🥈':i===2?'🥉':i+1+'.'} ${escapeHtml(p.name)}</b><p class="muted">${i===0?'Лідер гри':i===1?'Друге місце':i===2?'Третє місце':'Учасник'}</p></div></div>
      <div class="scorePoints">${p.score||0}</div>
    </div>`).join(''):'<p class="muted">Поки немає балів.</p>';
}

function adminWinnerHtml(){
  const arr=[...players].sort((a,b)=>Number(b.score||0)-Number(a.score||0));
  const winner=arr[0];

  if(!winner){
    return '<div class="winnerBox"><h2>Гра завершена</h2><p class="muted">Гравців немає.</p></div>';
  }

  return `
    <div class="winnerBox">
      <div class="winnerCup">🏆</div>
      <h2>Гра завершена</h2>
      <p class="muted">Переможець гри</p>
      <div class="avatarLine winnerLine">${avatarHtml(winner,'big')}<b>${escapeHtml(winner.name)}</b></div>
      <div class="winnerPoints">${winner.score||0} балів</div>
    </div>
    <h2>Фінальна таблиця</h2>
    ${arr.map((p,i)=>`
      <div class="scoreCard rank${i+1}">
        <div class="avatarLine">${avatarHtml(p,'big')}<div><b>${i===0?'🥇':i===1?'🥈':i===2?'🥉':i+1+'.'} ${escapeHtml(p.name)}</b><p class="muted">${i===0?'Переможець':i===1?'Друге місце':i===2?'Третє місце':'Учасник'}</p></div></div>
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
  if(!q){$('adminState').innerHTML='<p class="muted">Питання ще не додані. Натисни “Питання”.</p>';return}
  const opts=safeJson(q.options_json);
  const paused=currentGame.phase==='paused_answering'||currentGame.phase==='paused_voting';
  const left=currentGame.phase==='answering'?leftSec(currentGame.answer_deadline):currentGame.phase==='voting'?leftSec(currentGame.vote_deadline):currentGame.phase==='paused_answering'?Number(currentGame.answer_deadline||0):currentGame.phase==='paused_voting'?Number(currentGame.vote_deadline||0):null;
  $('adminState').innerHTML=`
    <div class="pill">Фаза: ${escapeHtml(currentGame.phase)}</div>
    <div class="pill">Питання ${Number(currentGame.current_q)+1} / ${questions.length}</div>
    ${left!==null?`<div class="timer smallTimer">${paused?'Пауза · ':''}${left} сек</div>`:''}
    <div class="question">${escapeHtml(q.text)}</div>
    ${q.photo_url?`<img class="photo clickablePhoto" src="${escapeHtml(q.photo_url)}" alt="Фото" onclick="window.openPhoto('${escapeHtml(q.photo_url)}')">`:''}

    <div class="statsGrid">
      <div class="statCard"><b>${answers.length}</b><span>відповідей з ${players.length}</span></div>
      <div class="statCard"><b>${votes.length}</b><span>голосів з ${players.length}</span></div>
    </div>

    ${paused?'<div class="finalNote">Таймер на паузі. Гравці бачать паузу і не можуть продовжити дію, доки ти не натиснеш “Продовжити таймер”.</div>':''}
    <h3>Відповіді наживо</h3>
    ${answers.length?answers.map(a=>{const p=players.find(x=>Number(x.id)===Number(a.player_id));return `<div class="liveRow"><span class="avatarLine">${avatarHtml(p||{})}<b>${escapeHtml(p?.name||'Гравець')}</b></span><span>${escapeHtml(a.text)}</span></div>`}).join(''):'<p class="muted">Ще немає відповідей.</p>'}
    ${opts.length?`<h3>Варіанти</h3>${opts.map((o,i)=>`<div class="optionPreview">${i+1}. ${escapeHtml(o.text)}</div>`).join('')}`:''}`;
}

function renderNextHint(){
  const map={lobby:'Далі: показати питання',question_preview:'Далі: почати відповіді',answering:'Далі: показати варіанти',paused_answering:'Таймер на паузі: спочатку натисни “Продовжити таймер”',preview:'Далі: почати голосування',voting:'Далі: завершити голосування',paused_voting:'Таймер на паузі: спочатку натисни “Продовжити таймер”',results:'Далі: наступне питання',finished:'Гра завершена'};
  if(currentGame?.phase==='results' && Number(currentGame.current_q||0) >= questions.length-1){
    $('nextHint').textContent='Далі: показати фінальний результат';
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
    <h2>Відкриття відповідей</h2>
    <p class="muted">Відкривай варіанти по одному. Нижче одразу видно, хто голосував за кожну відкриту відповідь.</p>
    ${opts.length?opts.map((o,i)=>`<button class="option revealBtn" onclick="window.revealOption('${escapeHtml(o.id)}')">${revealed.includes(o.id)?'✓ ':''}${i+1}. ${escapeHtml(o.text)}</button>`).join(''):'<p class="muted">Варіанти ще не створені.</p>'}
    ${shown.length?`<div class="revealedAnswers">${shown.map(revealCard).join('')}</div>`:'<p class="muted">Ще нічого не відкрито.</p>'}
  `;
}
window.revealOption=async(optionId)=>{const q=getCurrentQuestion();if(!q)return;const revealed=safeJson(q.revealed_json);if(!revealed.includes(optionId))revealed.push(optionId);const {error}=await adminDb.from('questions').update({revealed_json:JSON.stringify(revealed)}).eq('id',q.id);if(error)alert(error.message);await loadData()};

function revealCard(o){
  const voters=votes.filter(v=>v.option_id===o.id).map(v=>players.find(p=>Number(p.id)===Number(v.player_id))).filter(Boolean);
  let authorHtml='',label='';
  if(o.type==='correct'){authorHtml=avatarHtml({name:'Правильна',avatar:'✓'},'big');label='Правильна відповідь'}
  if(o.type==='fake'){authorHtml=hostAvatarHtml(currentGame,'big');label='Фейк ведучої'}
  if(o.type==='player'){
    const author=players.find(p=>Number(p.id)===Number(o.player_id));
    authorHtml=avatarHtml(author||{name:'Гравець',avatar:'?'},'big');
    label=author?author.name:'Гравець';
  }
  return `<div class="revealRow revealGrid"><div class="avatarLine authorSide">${authorHtml}<b>${escapeHtml(label)}</b></div><div><span class="tag ${o.type==='correct'?'correct':o.type==='fake'?'fake':''}">${o.type==='correct'?'Правильна':o.type==='fake'?'Фейк':'Гравець'}</span><div class="answerBig">${escapeHtml(o.text)}</div></div><div><b>Голосували:</b>${voters.length?voters.map(v=>`<div class="avatarLine voterMini">${avatarHtml(v,'small')}<span>${escapeHtml(v.name)}</span></div>`).join(''):'<p class="muted">Ніхто</p>'}</div></div>`;
}

function renderQuestionEditor(){
  if(isLettersGame()){
    renderWordEditor();
    return;
  }
  questionEditor.querySelector('h2').textContent='Питання';
  $('saveQuestionsBtn').textContent='Зберегти питання';
  const byOrder=new Map(questions.map(q=>[Number(q.q_order),q]));

  $('questionsForm').innerHTML=Array.from({length:TOTAL_QUESTIONS},(_,i)=>{
    const q=byOrder.get(i)||{}, r=roundNo(i);
    const hasPhoto=Boolean(q.photo_url);

    return `
      <div class="qedit">
        <h3>Питання ${i+1} · Раунд ${r} ${r===3?'<small>можна фото</small>':''}</h3>
        <textarea id="q_${i}" placeholder="Текст питання">${escapeHtml(q.text||'')}</textarea>
        <input id="c_${i}" placeholder="Правильна відповідь" value="${escapeHtml(q.correct_answer||'')}"/>
        <input id="f_${i}" placeholder="Фейк ведучої" value="${escapeHtml(q.fake_answer||'')}"/>
        <input id="url_${i}" type="hidden" value="${escapeHtml(q.photo_url||'')}"/>

        ${hasPhoto?`<img class="thumb photoPreview" id="preview_${i}" src="${escapeHtml(q.photo_url)}" alt="Фото">`:`<img class="thumb photoPreview hidden" id="preview_${i}" alt="Фото">`}

        ${r===3?`
          <label class="fileLabel">
            Фото до питання
            <input id="file_${i}" type="file" accept="image/*">
          </label>
        `:''}
      </div>
    `;
  }).join('');

  attachPhotoPreviews();
}

function renderWordEditor(){
  const cfg=wordConfig();
  const categories=[...(cfg.categories||[])];
  const drawWords=[...(cfg.drawWords||[])];
  questionEditor.querySelector('h2').textContent='Категорії та слова';
  $('saveQuestionsBtn').textContent='Зберегти слова';
  $('questionsForm').innerHTML=`
    <div class="qedit">
      <h3>Раунд 1: категорії</h3>
      <p class="muted">Після збереження гра повернеться в лобі, а бали команд скинуться.</p>
      <div class="miniGrid">
        ${Array.from({length:5},(_,i)=>`<input id="editLetterCat${i}" placeholder="Категорія ${i+1}" value="${escapeHtml(categories[i]||'')}"/>`).join('')}
      </div>
    </div>
    <div class="qedit">
      <h3>Раунд 2: слова для малювання</h3>
      <div class="miniGrid">
        ${Array.from({length:6},(_,i)=>`<input id="editDrawWord${i}" placeholder="Слово ${i+1}" value="${escapeHtml(drawWords[i]||'')}"/>`).join('')}
      </div>
    </div>
  `;
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
  if(isLettersGame()){
    await saveWordEditor();
    return;
  }
  if(!confirm('Зберегти питання? Відповіді, голоси й бали цієї гри будуть скинуті.'))return;
  const rows=[];
  for(let i=0;i<TOTAL_QUESTIONS;i++){
    const text=$(`q_${i}`).value.trim(), correct=$(`c_${i}`).value.trim(), fake=$(`f_${i}`).value.trim();
    let photo_url=$(`url_${i}`)?.value.trim()||''; const file=$(`file_${i}`)?.files?.[0]||null;
    if(!text)continue;
    try{if(file)photo_url=await uploadPublicFile(file,`game-${currentGame.id}-questions`)}catch(e){alert('Фото не завантажилось: '+e.message);return}
    rows.push({game_id:currentGame.id,q_order:i,round_no:roundNo(i),text,correct_answer:correct,fake_answer:fake,photo_url,options_json:'[]',revealed_json:'[]'});
  }
  await adminDb.from('votes').delete().eq('game_id',currentGame.id);
  await adminDb.from('answers').delete().eq('game_id',currentGame.id);
  await adminDb.from('points').delete().eq('game_id',currentGame.id);
  await adminDb.from('questions').delete().eq('game_id',currentGame.id);
  await adminDb.from('players').update({score:0}).eq('game_id',currentGame.id);
  if(rows.length){const {error}=await adminDb.from('questions').insert(rows);if(error){alert(error.message);return}}
  await adminDb.from('games').update({current_q:0,phase:'lobby',answer_deadline:null,vote_deadline:null,scoreboard_visible:0,status:'active',finished_at:null}).eq('id',currentGame.id);
  hide(questionEditor);await loadData();alert('Питання збережені');
}

async function saveWordEditor(){
  if(!confirm('Зберегти категорії/слова? Раунд, відкриті папірчики й бали цієї гри будуть скинуті.'))return;
  const cfg=wordConfig();
  const categories=Array.from({length:5},(_,i)=>$(`editLetterCat${i}`)?.value.trim()).filter(Boolean);
  const drawWords=Array.from({length:6},(_,i)=>$(`editDrawWord${i}`)?.value.trim()).filter(Boolean);
  if(!categories.length){alert('Додай хоча б одну категорію.');return}
  if(!drawWords.length){alert('Додай хоча б одне слово для папірчиків.');return}

  const resetTeams=(cfg.teams||[]).map(team=>({...team,score:0}));
  const nextCfg={
    ...cfg,
    round:1,
    round1Stage:1,
    letter:'',
    letters9:[],
    categories,
    drawWords,
    drawOrder:[],
    usedDrawIndexes:[],
    drawTurn:0,
    activePlayerId:null,
    teams:resetTeams
  };

  await adminDb.from('word_events').delete().eq('game_id',currentGame.id);
  await adminDb.from('players').update({score:0}).eq('game_id',currentGame.id);
  await saveWordConfig(nextCfg,{phase:'word_lobby',answer_deadline:null,vote_deadline:null,scoreboard_visible:0,status:'active',finished_at:null});
  hide(questionEditor);
  await loadData();
  alert('Слова збережені, бали скинуті');
}

async function saveCurrentAsSet(){
  if(!questions.length){alert('Спочатку додай питання');return}
  const title=prompt('Назва набору питань:',currentGame.title||'Набір питань');
  if(!title)return;
  const clean=questions.map(q=>({q_order:q.q_order,round_no:q.round_no,text:q.text,correct_answer:q.correct_answer,fake_answer:q.fake_answer,photo_url:q.photo_url}));
  const {error}=await adminDb.from('question_sets').insert({title,questions_json:JSON.stringify(clean),created_at:new Date().toISOString()});
  if(error){alert(error.message);return}
  alert('Набір збережено');
}

async function nextStage(){
  if(isLettersGame())return nextLettersStage();
  if(currentGame?.phase==='finished' || currentGame?.status==='finished') return;
  const phase=currentGame?.phase||'lobby';
  if(phase==='paused_answering'||phase==='paused_voting'){alert('Спочатку продовж таймер.');return}
  if(phase==='lobby')return doAction('show_question');
  if(phase==='question_preview')return doAction('start_answers');
  if(phase==='answering')return doAction('show_options');
  if(phase==='preview')return doAction('start_voting');
  if(phase==='voting')return doAction('finish_voting');
  if(phase==='results'){
    if(Number(currentGame.current_q||0) >= questions.length-1 && Date.now()>guardedNextUntil){
      guardedNextUntil=Date.now()+3500;
      $('nextStageBtn').textContent='Натисни ще раз, щоб завершити';
      setTimeout(()=>{if(Date.now()>guardedNextUntil&&currentGame?.phase==='results'){$('nextStageBtn').textContent='Наступний етап';renderNextHint()}},3600);
      return;
    }
    return doAction('next_question');
  }
}

document.querySelectorAll('[data-action]').forEach(btn=>btn.onclick=()=>doAction(btn.dataset.action));

async function doAction(action){
  if(isLettersGame()&&action==='finish_game'){
    if(!confirm('Завершити гру зараз?'))return;
    await updateGame({phase:'finished',status:'finished',finished_at:new Date().toISOString()});
    await loadData();
    return;
  }
  if(isLettersGame()&&(action==='show_scoreboard'||action==='hide_scoreboard')){
    await updateGame({scoreboard_visible:action==='show_scoreboard'?1:0});
    await loadData();
    return;
  }
  const q=getCurrentQuestion();
  if(!q&&action!=='finish_game'){alert('Спочатку додай питання.');return}
  if(action==='show_question')await updateGame({phase:'question_preview',answer_deadline:null,vote_deadline:null,scoreboard_visible:0});
  if(action==='start_answers')await updateGame({phase:'answering',answer_deadline:nowSec()+ANSWER_SECONDS});
  if(action==='show_options'){await buildOptions(q);await updateGame({phase:'preview',answer_deadline:null})}
  if(action==='start_voting')await updateGame({phase:'voting',vote_deadline:nowSec()+VOTE_SECONDS});
  if(action==='finish_voting'){await calculatePoints(q);await updateGame({phase:'results',vote_deadline:null})}
  if(action==='show_scoreboard')await updateGame({scoreboard_visible:1});
  if(action==='hide_scoreboard')await updateGame({scoreboard_visible:0});
  if(action==='finish_game'){if(!confirm('Завершити гру зараз?'))return;await updateGame({phase:'finished',status:'finished',scoreboard_visible:1,finished_at:new Date().toISOString()})}
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
  }else if(currentGame.phase==='word_round1_timer'){
    await updateGame({phase:'paused_word_round1',answer_deadline:leftSec(currentGame.answer_deadline)});
  }else if(currentGame.phase==='word_draw_timer'){
    await updateGame({phase:'paused_word_draw',answer_deadline:leftSec(currentGame.answer_deadline)});
  }else if(currentGame.phase==='word_words_timer'){
    await updateGame({phase:'paused_word_words',answer_deadline:leftSec(currentGame.answer_deadline)});
  }else if(currentGame.phase==='paused_word_round1'){
    await updateGame({phase:'word_round1_timer',answer_deadline:nowSec()+Math.max(1,Number(currentGame.answer_deadline||0))});
  }else if(currentGame.phase==='paused_word_draw'){
    await updateGame({phase:'word_draw_timer',answer_deadline:nowSec()+Math.max(1,Number(currentGame.answer_deadline||0))});
  }else if(currentGame.phase==='paused_word_words'){
    await updateGame({phase:'word_words_timer',answer_deadline:nowSec()+Math.max(1,Number(currentGame.answer_deadline||0))});
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
async function deleteCurrentGame(){if(!currentGame)return;if(!confirm('Видалити гру?'))return;const {error}=await adminDb.from('games').delete().eq('id',currentGame.id);if(error){alert(error.message);return}showMenu()}
function subscribe(gameId){
  if(channel)supabase.removeChannel(channel);
  channel=supabase.channel('admin-game-'+gameId)
  .on('postgres_changes',{event:'*',schema:'public',table:'players',filter:'game_id=eq.'+gameId},loadData)
  .on('postgres_changes',{event:'*',schema:'public',table:'questions',filter:'game_id=eq.'+gameId},loadData)
  .on('postgres_changes',{event:'*',schema:'public',table:'answers',filter:'game_id=eq.'+gameId},loadData)
  .on('postgres_changes',{event:'*',schema:'public',table:'votes',filter:'game_id=eq.'+gameId},loadData)
  .on('postgres_changes',{event:'*',schema:'public',table:'word_events',filter:'game_id=eq.'+gameId},loadData)
  .on('postgres_changes',{event:'*',schema:'public',table:'games',filter:'id=eq.'+gameId},p=>{currentGame=p.new;loadData()}).subscribe(s=>console.log('admin realtime',s));
}
function leftSec(deadline){if(!deadline)return 0;return Math.max(0,Number(deadline)-nowSec())}
setInterval(()=>{
  if(currentGame&&!loading)loadData();
},1500);
setInterval(()=>{
  if(!currentGame)return;
  const timedPhases=['answering','voting','word_round1_timer','word_draw_timer','word_words_timer'];
  if(!timedPhases.includes(currentGame.phase))return;
  if(isLettersGame())renderLettersAdminState();
  else{
    const timer=$('adminState')?.querySelector('.smallTimer');
    const deadline=currentGame.phase==='voting'?currentGame.vote_deadline:currentGame.answer_deadline;
    if(timer)timer.textContent=`${leftSec(deadline)} сек`;
  }
},1000);

function teamNames(){
  const cfg=wordConfig();
  const fromConfig=(cfg.teams||[]).map(t=>t.name).filter(Boolean);
  const fromPlayers=players.map(p=>p.team_name).filter(Boolean);
  return [...new Set([...fromConfig,...fromPlayers])];
}

function teams(){
  const cfg=wordConfig();
  const names=teamNames();
  return names.map(name=>({
    name,
    score:Number((cfg.teams||[]).find(t=>t.name===name)?.score||0),
    players:players.filter(p=>p.team_name===name)
  }));
}

function latestDrawEvent(){
  return wordEvents.find(e=>e.event_type==='draw_open');
}

function usedDrawIndexes(cfg){
  const fromConfig=cfg.usedDrawIndexes||[];
  const fromEvents=wordEvents.filter(e=>e.event_type==='draw_open').map(e=>safeJson(e.payload_json,{}).index).filter(i=>Number.isInteger(Number(i))).map(Number);
  return [...new Set([...fromConfig,...fromEvents])];
}

function drawOrder(cfg){
  const total=(cfg.drawWords||[]).length;
  const saved=(cfg.drawOrder||[]).map(Number).filter(i=>i>=0&&i<total);
  const missing=Array.from({length:total},(_,i)=>i).filter(i=>!saved.includes(i));
  return [...saved,...missing];
}

function renderLettersPlayers(){
  const names=teamNames();
  $('playersList').innerHTML=players.length?players.map(p=>`
    <div class="playerRow">
      <div class="avatarLine">${avatarHtml(p)}<b>${escapeHtml(p.name)}</b></div>
      <select class="teamSelect" onchange="window.setPlayerTeam(${p.id},this.value)">
        <option value="">Без команди</option>
        ${names.map(n=>`<option value="${escapeHtml(n)}" ${p.team_name===n?'selected':''}>${escapeHtml(n)}</option>`).join('')}
      </select>
    </div>
  `).join(''):'<p class="muted">Гравців ще немає.</p>';
}

function renderLettersScore(){
  const list=teams();
  $('scoreBoard').innerHTML=`
    <div class="wordTeamsBox">
      <div class="actions">
        <input id="newTeamName" placeholder="Назва команди"/>
        <button class="secondary" onclick="window.addTeam()">Додати команду</button>
      </div>
      ${list.length?list.map(t=>`
        <div class="teamScore">
          <div><b>${escapeHtml(t.name)}</b><p class="muted">${t.players.map(p=>p.name).join(', ')||'поки без гравців'}</p></div>
          <div class="scoreControls">
            <button class="secondary smallBtn" onclick="window.adjustTeam('${escapeHtml(t.name)}',-1)">-1</button>
            <input class="scoreInput" value="${t.score}" onchange="window.setTeamScore('${escapeHtml(t.name)}',this.value)"/>
            <button class="secondary smallBtn" onclick="window.adjustTeam('${escapeHtml(t.name)}',1)">+1</button>
          </div>
        </div>
      `).join(''):'<p class="muted">Створи команди й признач гравців.</p>'}
    </div>
  `;
}

function roundTitle(round){
  if(round===1){
    const stage=Number(wordConfig().round1Stage||1);
    return `Раунд 1: Категорії на літеру · Етап ${stage}`;
  }
  if(round===2)return 'Раунд 2: Намалюй за 5 секунд';
  return 'Раунд 3: Словотворці';
}

function renderLettersAdminState(){
  if(currentGame?.phase==='finished'||currentGame?.status==='finished'){
    $('adminState').innerHTML=lettersFinalHtml();
    return;
  }
  const cfg=wordConfig();
  const phase=currentGame.phase;
  const paused=['paused_word_round1','paused_word_draw','paused_word_words'].includes(phase);
  const left=['word_round1_timer','word_draw_timer','word_words_timer'].includes(phase)?leftSec(currentGame.answer_deadline):paused?Number(currentGame.answer_deadline||0):null;
  $('adminState').innerHTML=`
    <div class="pill">Словесна гра</div>
    <div class="pill">${roundTitle(Number(cfg.round||1))}</div>
    ${left!==null?`<div class="timer smallTimer">${paused?'Пауза · ':''}${left} сек</div>`:''}
    ${paused?'<div class="finalNote">Таймер на паузі. Натисни “Продовжити таймер”, щоб продовжити раунд.</div>':''}
    ${lettersRoundHtml(cfg)}
  `;
}

function lettersRoundHtml(cfg){
  const round=Number(cfg.round||1);
  if(currentGame.phase==='word_lobby')return `
    <div class="question">Лобі словесної гри</div>
    <p class="muted">Створи команди, признач гравців і запускай перший раунд.</p>
  `;
  if(round===1)return `
    <div class="letterHero">${escapeHtml(cfg.letter||'Букву ще не обрано')}</div>
    <div class="pill">Етап ${Number(cfg.round1Stage||1)}</div>
    <div class="actions">
      <button onclick="window.pickLetter()">Обрати букву</button>
      <button class="secondary" onclick="window.pickLetter()">Поміняти букву</button>
      <button class="secondary" onclick="window.startWordTimer(60)">Почати 60 секунд</button>
      <button class="secondary" onclick="window.addTime(10)">Додати 10 секунд</button>
      ${currentGame.phase==='word_round1_review'&&Number(cfg.round1Stage||1)<2?'<button class="secondary" onclick="window.startRound1SecondStage()">Другий етап раунду</button>':''}
    </div>
    <h3>Категорії</h3>
    <div class="categoryGrid">${(cfg.categories||[]).map(c=>`<div class="noteCard">${escapeHtml(c)}</div>`).join('')}</div>
  `;
  if(round===2){
    const active=players.find(p=>Number(p.id)===Number(cfg.activePlayerId));
    const latest=latestDrawEvent();
    const payload=safeJson(latest?.payload_json,{});
    return `
      <div class="question">Папірчики зі словами</div>
      <p class="muted">Признач гравця, він відкриє один папірчик. Слово бачите тільки ти і він.</p>
      <h3>Хто зараз ходить</h3>
      <div class="turnBox">${active?`${avatarHtml(active)} <b>${escapeHtml(active.name)}</b>`:'Хід ще не призначено'}</div>
      <div class="paperGrid">${drawOrder(cfg).map(i=>paperHtml(cfg,i,(cfg.drawWords||[])[i],false)).join('')}</div>
      ${latest?`<div class="finalNote"><b>${escapeHtml(players.find(p=>Number(p.id)===Number(latest.player_id))?.name||'Гравець')}</b> відкрив/відкрила слово: <b>${escapeHtml(payload.word||'')}</b></div>`:''}
      <div class="actions">
        <button class="secondary" onclick="window.startWordTimer(5)">Старт 5 секунд</button>
        <button class="secondary" onclick="window.addTime(10)">Додати 10 секунд</button>
      </div>
      <h3>Призначити хід</h3>
      <div class="actions">${players.map(p=>`<button class="secondary" onclick="window.assignDrawPlayer(${p.id})">${escapeHtml(p.name)}</button>`).join('')}</div>
    `;
  }
  return `
    <div class="question">Складіть неіснуюче слово</div>
    <div class="letterTiles">${(cfg.letters9||[]).map(l=>`<span>${escapeHtml(l)}</span>`).join('')}</div>
    <div class="actions">
      <button onclick="window.pickNineLetters()">Згенерувати 9 літер</button>
      <button class="secondary" onclick="window.pickNineLetters()">Поміняти літери</button>
      <button class="secondary" onclick="window.startWordTimer(60)">Почати 60 секунд</button>
      <button class="secondary" onclick="window.addTime(10)">Додати 10 секунд</button>
    </div>
    <p class="muted">Команди зачитують слово наживо й пояснюють, що воно означає. Бали ставиш вручну.</p>
  `;
}

function paperHtml(cfg,i,word,forPlayer){
  const used=usedDrawIndexes(cfg).includes(i);
  const cls=['paperBall',`paper${i%6}`,used?'used':''].join(' ');
  return `<button class="${cls}" ${used||forPlayer?'disabled':''} aria-label="${used?'Взятий папірчик':'Закритий папірчик'}" title="${used?'Взято':'Закритий папірчик'}"></button>`;
}

function renderLettersHint(){
  const phase=currentGame?.phase;
  const map={word_lobby:'Далі: запустити раунд 1',word_round1:'Обери букву й запускай таймер',word_round1_timer:'Гравці пишуть відповіді у блокноті',paused_word_round1:'Таймер на паузі',word_round1_review:'Команди зачитують, ти ставиш бали',word_draw:'Признач гравця для папірчика',word_draw_pick:'Гравець відкриває слово',word_draw_timer:'5 секунд на малюнок',paused_word_draw:'Таймер на паузі',word_draw_review:'Команда вгадує, суперники можуть перехопити',word_words:'Згенеруй 9 літер',word_words_timer:'60 секунд на вигадане слово',paused_word_words:'Таймер на паузі',word_words_review:'Команди пояснюють слова, ти ставиш бали'};
  $('nextHint').textContent=map[phase]||'';
  $('nextStageBtn').textContent=phase==='word_words_review'?'Завершити гру':'Наступний етап';
}

async function nextLettersStage(){
  const cfg=wordConfig();
  const phase=currentGame.phase;
  if(['paused_word_round1','paused_word_draw','paused_word_words'].includes(phase)){alert('Спочатку продовж таймер.');return}
  if(phase==='word_lobby')await saveWordConfig({...cfg,round:1,round1Stage:1},{phase:'word_round1'});
  if(phase==='word_round1')await saveWordConfig(cfg,{phase:'word_round1_timer',answer_deadline:nowSec()+60});
  if(phase==='word_round1_timer')await saveWordConfig(cfg,{phase:'word_round1_review',answer_deadline:null});
  if(phase==='word_round1_review')await saveWordConfig({...cfg,round:2,drawOrder:shuffle(Array.from({length:(cfg.drawWords||[]).length},(_,i)=>i)),drawTurn:0,activePlayerId:null},{phase:'word_draw'});
  if(phase==='word_draw')await saveWordConfig(cfg,{phase:'word_draw_pick'});
  if(phase==='word_draw_pick')await saveWordConfig(cfg,{phase:'word_draw_timer',answer_deadline:nowSec()+5});
  if(phase==='word_draw_timer')await saveWordConfig(cfg,{phase:'word_draw_review',answer_deadline:null});
  if(phase==='word_draw_review')await saveWordConfig({...cfg,round:3,activePlayerId:null},{phase:'word_words'});
  if(phase==='word_words')await saveWordConfig({...cfg,letters9:cfg.letters9?.length?cfg.letters9:nineLetters()},{phase:'word_words_timer',answer_deadline:nowSec()+60});
  if(phase==='word_words_timer')await saveWordConfig(cfg,{phase:'word_words_review',answer_deadline:null});
  if(phase==='word_words_review')await updateGame({phase:'finished',status:'finished',finished_at:new Date().toISOString()});
  await loadData();
}

window.pickLetter=async()=>{const cfg=wordConfig();cfg.letter=uaLetter();await saveWordConfig(cfg,{phase:'word_round1'});await loadData()};
window.startRound1SecondStage=async()=>{const cfg=wordConfig();await saveWordConfig({...cfg,round:1,round1Stage:2,letter:''},{phase:'word_round1',answer_deadline:null});await loadData()};
window.pickNineLetters=async()=>{const cfg=wordConfig();cfg.letters9=nineLetters();await saveWordConfig(cfg,{phase:'word_words'});await loadData()};
window.startWordTimer=async(sec)=>{await updateGame({answer_deadline:nowSec()+Number(sec||60),phase:Number(wordConfig().round)===2?'word_draw_timer':Number(wordConfig().round)===3?'word_words_timer':'word_round1_timer'});await loadData()};
window.addTime=async(sec)=>{await updateGame({answer_deadline:Math.max(nowSec(),Number(currentGame.answer_deadline||nowSec()))+Number(sec||10)});await loadData()};
window.assignDrawPlayer=async(playerId)=>{const cfg=wordConfig();cfg.activePlayerId=Number(playerId);cfg.drawTurn=Number(cfg.drawTurn||0)+1;await saveWordConfig(cfg,{phase:'word_draw_pick'});await loadData()};
window.addTeam=async()=>{const name=$('newTeamName')?.value.trim();if(!name)return;const cfg=wordConfig();cfg.teams=cfg.teams||[];if(!cfg.teams.some(t=>t.name===name))cfg.teams.push({name,score:0});await saveWordConfig(cfg);await loadData()};
window.setPlayerTeam=async(playerId,team)=>{const {error}=await adminDb.from('players').update({team_name:team||null}).eq('id',playerId);if(error)alert(error.message);await loadData()};
window.adjustTeam=async(name,delta)=>{const cfg=wordConfig();cfg.teams=cfg.teams||[];const t=cfg.teams.find(x=>x.name===name)||{name,score:0};if(!cfg.teams.includes(t))cfg.teams.push(t);t.score=Number(t.score||0)+Number(delta||0);await saveWordConfig(cfg);await loadData()};
window.setTeamScore=async(name,value)=>{const cfg=wordConfig();cfg.teams=cfg.teams||[];const t=cfg.teams.find(x=>x.name===name)||{name,score:0};if(!cfg.teams.includes(t))cfg.teams.push(t);t.score=Number(value||0);await saveWordConfig(cfg);await loadData()};

function lettersFinalHtml(){
  const list=[...teams()].sort((a,b)=>b.score-a.score);
  const winner=list[0];
  if(!winner)return '<div class="winnerBox"><h2>Гра завершена</h2><p class="muted">Команд не було.</p></div>';
  return `<div class="winnerBox finalShow"><div class="winnerCup">🏆</div><h2>Перемогла команда</h2><div class="winnerPoints">${escapeHtml(winner.name)} · ${winner.score} балів</div></div>`;
}



function finalTableRowsHtml(){
  const arr=[...players].sort((a,b)=>Number(b.score||0)-Number(a.score||0));

  if(!arr.length){
    return '<p class="muted">Поки немає балів.</p>';
  }

  return arr.map((p,i)=>`
    <div class="scoreCard rank${i+1}">
      <div class="avatarLine">
        ${avatarHtml(p,'big')}
        <div>
          <b>${i===0?'🥇':i===1?'🥈':i===2?'🥉':i+1+'.'} ${escapeHtml(p.name)}</b>
          <p class="muted">${i===0?'Переможець':i===1?'Друге місце':i===2?'Третє місце':'Учасник'}</p>
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
    <h2>Фінальна таблиця</h2>
    ${finalTableRowsHtml()}
  `;
}

function renderFinishedAdminScreen(){
  $('adminState').innerHTML=finalWinnerHtml();
  $('revealPanel').innerHTML='';
  $('scoreBoard').innerHTML=finalTableRowsHtml();
  $('nextHint').textContent='Гра завершена';

  const nextBtn=$('nextStageBtn');
  if(nextBtn){
    nextBtn.disabled=true;
    nextBtn.textContent='Гра завершена';
  }
  const pauseBtn=$('pauseBtn');
  if(pauseBtn)pauseBtn.disabled=true;
}


