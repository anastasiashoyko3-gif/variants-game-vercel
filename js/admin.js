import {
  supabase, makeCode, escapeHtml, avatarHtml, hostAvatarHtml,
  TOTAL_QUESTIONS, ANSWER_SECONDS, VOTE_SECONDS, roundNo, nowSec,
  shuffle, safeJson, uploadPublicFile
} from './supabaseClient.js';

const ADMIN_PASSWORD = 'admin123';

let currentGame=null, games=[], sets=[], questions=[], players=[], answers=[], votes=[], channel=null, loading=false;

const $=id=>document.getElementById(id);
const loginCard=$('loginCard'), menuCard=$('menuCard'), createPanel=$('createPanel'), gameCard=$('gameCard');
const questionEditor=$('questionEditor'), settingsPanel=$('settingsPanel');

function show(el){el.hidden=false;el.classList.remove('hidden')}
function hide(el){el.hidden=true;el.classList.add('hidden')}

$('loginBtn').onclick=()=>{if($('adminPassword').value.trim()!==ADMIN_PASSWORD){$('loginMsg').textContent='Неправильний пароль';return}localStorage.setItem('admin_ok','1');showMenu()};
$('logoutBtn').onclick=()=>{localStorage.removeItem('admin_ok');localStorage.removeItem('current_game_id');location.reload()};
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

$('copyInviteBtn').onclick=async()=>{
  const text=$('inviteLink').textContent.trim();
  if(!text)return;
  try{
    await navigator.clipboard.writeText(text);
    $('copyInviteBtn').textContent='✓ Скопійовано';
    setTimeout(()=>$('copyInviteBtn').textContent='📋 Копіювати',1200);
  }catch{
    alert('Не вдалося скопіювати. Скопіюй посилання вручну.');
  }
};


if(localStorage.getItem('admin_ok')==='1')showMenu();else{show(loginCard);hide(menuCard);hide(gameCard)}

async function showMenu(){
  currentGame=null;
  if(channel) supabase.removeChannel(channel);
  hide(loginCard);hide(gameCard);show(menuCard);hide(createPanel);
  await Promise.all([loadGames(),loadSets()]);
}

async function loadGames(){
  const {data,error}=await supabase.from('games').select('*').order('id',{ascending:false});
  if(error){alert(error.message);return}
  games=data||[];renderGames();
}

async function loadSets(){
  const {data,error}=await supabase.from('question_sets').select('*').order('id',{ascending:false});
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
  const file=$('hostAvatarFile')?.files?.[0];
  try{if(file)host_avatar=await uploadPublicFile(file,'host-avatars')}catch(e){alert('Фото ведучої не завантажилось: '+e.message);return}
  const {data,error}=await supabase.from('games').insert({invite_code:makeCode(),title,game_password,host_avatar,status:'active',phase:'lobby',current_q:0,scoreboard_visible:0,created_at:new Date().toISOString()}).select().single();
  if(error){alert(error.message);return}
  openGame(data);
};

window.openGameById=async(id)=>{const {data,error}=await supabase.from('games').select('*').eq('id',id).single();if(error){alert(error.message);return}openGame(data)};
window.deleteGameById=async(id)=>{if(!confirm('Видалити гру?'))return;const {error}=await supabase.from('games').delete().eq('id',id);if(error)alert(error.message);await loadGames()};
window.duplicateGameById=async(id)=>{
  const source=games.find(g=>Number(g.id)===Number(id)); if(!source)return;
  const {data:qs}=await supabase.from('questions').select('*').eq('game_id',id).order('q_order',{ascending:true});
  const {data:newGame,error}=await supabase.from('games').insert({invite_code:makeCode(),title:(source.title||'Гра')+' копія',game_password:source.game_password||'game123',host_avatar:source.host_avatar||'👑',status:'active',phase:'lobby',current_q:0,scoreboard_visible:0,created_at:new Date().toISOString()}).select().single();
  if(error){alert(error.message);return}
  await insertQuestions(newGame.id,qs||[]); await loadGames();
};
window.createGameFromSet=async(id)=>{
  const set=sets.find(s=>Number(s.id)===Number(id));if(!set)return;
  const title=prompt('Назва гри:',set.title||'Гра Варіанти')||'Гра Варіанти';
  const game_password=prompt('Пароль для гравців:','game123')||'game123';
  const {data:newGame,error}=await supabase.from('games').insert({invite_code:makeCode(),title,game_password,host_avatar:'👑',status:'active',phase:'lobby',current_q:0,scoreboard_visible:0,created_at:new Date().toISOString()}).select().single();
  if(error){alert(error.message);return}
  await insertQuestions(newGame.id,safeJson(set.questions_json)); openGame(newGame);
};
window.deleteSet=async(id)=>{if(!confirm('Видалити набір?'))return;const {error}=await supabase.from('question_sets').delete().eq('id',id);if(error)alert(error.message);await loadSets()};

async function insertQuestions(gameId,source){
  const rows=(source||[]).map((q,i)=>({game_id:gameId,q_order:Number(q.q_order??i),round_no:Number(q.round_no??roundNo(i)),text:q.text,correct_answer:q.correct_answer,fake_answer:q.fake_answer,photo_url:q.photo_url,options_json:'[]',revealed_json:'[]'}));
  if(rows.length)await supabase.from('questions').insert(rows);
}

async function duplicateCurrentGame(){if(!currentGame)return;await window.duplicateGameById(currentGame.id);alert('Гру продубльовано')}

async function openGame(game){
  currentGame=game; localStorage.setItem('current_game_id',game.id);
  hide(loginCard);hide(menuCard);show(gameCard);
  $('gameName').textContent=game.title;
  $('inviteLink').textContent=`${location.origin}/game.html?code=${game.invite_code}`;
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
  const {data,error}=await supabase.from('games').update(update).eq('id',currentGame.id).select().single();
  if(error){alert(error.message);return}
  currentGame=data;$('gameName').textContent=data.title;hide(settingsPanel);await loadData();alert('Збережено');
}

async function loadData(){
  if(!currentGame||loading)return;loading=true;
  try{
    const [gRes,qRes,pRes]=await Promise.all([
      supabase.from('games').select('*').eq('id',currentGame.id).single(),
      supabase.from('questions').select('*').eq('game_id',currentGame.id).order('q_order',{ascending:true}),
      supabase.from('players').select('*').eq('game_id',currentGame.id).order('score',{ascending:false})
    ]);
    if(!gRes.error&&gRes.data)currentGame=gRes.data;
    questions=qRes.data||[]; players=pRes.data||[];
    const q=getCurrentQuestion();
    if(q){
      const [aRes,vRes]=await Promise.all([supabase.from('answers').select('*').eq('question_id',q.id),supabase.from('votes').select('*').eq('question_id',q.id)]);
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
    nextBtn.textContent='Наступний етап';
  }

  renderAdminState();
  renderRevealPanel();
  renderNextHint();
}

function renderPlayers(){
  $('playersList').innerHTML=players.length?players.map(p=>`<div class="playerRow"><div class="avatarLine">${avatarHtml(p)}<b>${escapeHtml(p.name)}</b></div><b>${p.score||0}</b></div>`).join(''):'<p class="muted">Гравців ще немає.</p>';
}
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
  const left=currentGame.phase==='answering'?leftSec(currentGame.answer_deadline):currentGame.phase==='voting'?leftSec(currentGame.vote_deadline):null;
  $('adminState').innerHTML=`
    <div class="pill">Фаза: ${escapeHtml(currentGame.phase)}</div>
    <div class="pill">Питання ${Number(currentGame.current_q)+1} / ${questions.length}</div>
    ${left!==null?`<div class="timer smallTimer">${left} сек</div>`:''}
    <div class="question">${escapeHtml(q.text)}</div>
    ${q.photo_url?`<img class="photo clickablePhoto" src="${escapeHtml(q.photo_url)}" alt="Фото" onclick="window.openPhoto('${escapeHtml(q.photo_url)}')">`:''}

    <div class="statsGrid">
      <div class="statCard"><b>${answers.length}</b><span>відповідей з ${players.length}</span></div>
      <div class="statCard"><b>${votes.length}</b><span>голосів з ${players.length}</span></div>
    </div>

    <h3>Відповіді наживо</h3>
    ${answers.length?answers.map(a=>{const p=players.find(x=>Number(x.id)===Number(a.player_id));return `<div class="liveRow"><span class="avatarLine">${avatarHtml(p||{})}<b>${escapeHtml(p?.name||'Гравець')}</b></span><span>${escapeHtml(a.text)}</span></div>`}).join(''):'<p class="muted">Ще немає відповідей.</p>'}
    ${opts.length?`<h3>Варіанти</h3>${opts.map((o,i)=>`<div class="optionPreview">${i+1}. ${escapeHtml(o.text)}</div>`).join('')}`:''}`;
}

function renderNextHint(){
  const map={lobby:'Далі: показати питання',question_preview:'Далі: почати відповіді',answering:'Далі: показати варіанти',preview:'Далі: почати голосування',voting:'Далі: завершити голосування',results:'Далі: наступне питання',finished:'Гра завершена'};
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
  $('revealPanel').innerHTML=`<h2>Відкриття відповідей</h2><p class="muted">Відкривай варіанти по одному.</p>${opts.length?opts.map((o,i)=>`<button class="option revealBtn" onclick="window.revealOption('${escapeHtml(o.id)}')">${revealed.includes(o.id)?'✓ ':''}${i+1}. ${escapeHtml(o.text)}</button>`).join(''):'<p class="muted">Варіанти ще не створені.</p>'}`;
}
window.revealOption=async(optionId)=>{const q=getCurrentQuestion();if(!q)return;const revealed=safeJson(q.revealed_json);if(!revealed.includes(optionId))revealed.push(optionId);const {error}=await supabase.from('questions').update({revealed_json:JSON.stringify(revealed)}).eq('id',q.id);if(error)alert(error.message);await loadData()};

function renderQuestionEditor(){
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
  if(!confirm('Зберегти питання? Відповіді, голоси й бали цієї гри будуть скинуті.'))return;
  const rows=[];
  for(let i=0;i<TOTAL_QUESTIONS;i++){
    const text=$(`q_${i}`).value.trim(), correct=$(`c_${i}`).value.trim(), fake=$(`f_${i}`).value.trim();
    let photo_url=$(`url_${i}`)?.value.trim()||''; const file=$(`file_${i}`)?.files?.[0]||null;
    if(!text)continue;
    try{if(file)photo_url=await uploadPublicFile(file,`game-${currentGame.id}-questions`)}catch(e){alert('Фото не завантажилось: '+e.message);return}
    rows.push({game_id:currentGame.id,q_order:i,round_no:roundNo(i),text,correct_answer:correct,fake_answer:fake,photo_url,options_json:'[]',revealed_json:'[]'});
  }
  await supabase.from('votes').delete().eq('game_id',currentGame.id);
  await supabase.from('answers').delete().eq('game_id',currentGame.id);
  await supabase.from('points').delete().eq('game_id',currentGame.id);
  await supabase.from('questions').delete().eq('game_id',currentGame.id);
  await supabase.from('players').update({score:0}).eq('game_id',currentGame.id);
  if(rows.length){const {error}=await supabase.from('questions').insert(rows);if(error){alert(error.message);return}}
  await supabase.from('games').update({current_q:0,phase:'lobby',answer_deadline:null,vote_deadline:null,scoreboard_visible:0,status:'active',finished_at:null}).eq('id',currentGame.id);
  hide(questionEditor);await loadData();alert('Питання збережені');
}

async function saveCurrentAsSet(){
  if(!questions.length){alert('Спочатку додай питання');return}
  const title=prompt('Назва набору питань:',currentGame.title||'Набір питань');
  if(!title)return;
  const clean=questions.map(q=>({q_order:q.q_order,round_no:q.round_no,text:q.text,correct_answer:q.correct_answer,fake_answer:q.fake_answer,photo_url:q.photo_url}));
  const {error}=await supabase.from('question_sets').insert({title,questions_json:JSON.stringify(clean),created_at:new Date().toISOString()});
  if(error){alert(error.message);return}
  alert('Набір збережено');
}

async function nextStage(){
  if(currentGame?.phase==='finished' || currentGame?.status==='finished') return;
  const phase=currentGame?.phase||'lobby';
  if(phase==='lobby')return doAction('show_question');
  if(phase==='question_preview')return doAction('start_answers');
  if(phase==='answering')return doAction('show_options');
  if(phase==='preview')return doAction('start_voting');
  if(phase==='voting')return doAction('finish_voting');
  if(phase==='results')return doAction('next_question');
}

document.querySelectorAll('[data-action]').forEach(btn=>btn.onclick=()=>doAction(btn.dataset.action));

async function doAction(action){
  const q=getCurrentQuestion();
  if(!q&&action!=='finish_game'){alert('Спочатку додай питання.');return}
  if(action==='show_question')await updateGame({phase:'question_preview',answer_deadline:null,vote_deadline:null,scoreboard_visible:0});
  if(action==='start_answers')await updateGame({phase:'answering',answer_deadline:nowSec()+ANSWER_SECONDS});
  if(action==='show_options'){await buildOptions(q);await updateGame({phase:'preview',answer_deadline:null})}
  if(action==='start_voting')await updateGame({phase:'voting',vote_deadline:nowSec()+VOTE_SECONDS});
  if(action==='finish_voting'){await calculatePoints(q);await updateGame({phase:'results',vote_deadline:null})}
  if(action==='show_scoreboard')await updateGame({scoreboard_visible:1});
  if(action==='hide_scoreboard')await updateGame({scoreboard_visible:0});
  if(action==='finish_game')await updateGame({phase:'finished',status:'finished',scoreboard_visible:1,finished_at:new Date().toISOString()});
  if(action==='next_question'){const next=Number(currentGame.current_q||0)+1;if(next>=questions.length)await updateGame({phase:'finished',status:'finished',scoreboard_visible:1,finished_at:new Date().toISOString()});else await updateGame({current_q:next,phase:'question_preview',scoreboard_visible:0,answer_deadline:null,vote_deadline:null})}
  await loadData();
}
async function updateGame(update){const {data,error}=await supabase.from('games').update(update).eq('id',currentGame.id).select().single();if(error){alert(error.message);return}currentGame=data}
async function buildOptions(q){
  const {data:allAnswers}=await supabase.from('answers').select('*').eq('question_id',q.id);
  const opts=[];(allAnswers||[]).forEach(a=>opts.push({id:`p_${a.player_id}`,type:'player',text:a.text,player_id:a.player_id}));
  if(q.correct_answer)opts.push({id:'correct',type:'correct',text:q.correct_answer,player_id:null});
  if(q.fake_answer)opts.push({id:'fake',type:'fake',text:q.fake_answer,player_id:null});
  const {error}=await supabase.from('questions').update({options_json:JSON.stringify(shuffle(opts)),revealed_json:'[]'}).eq('id',q.id);if(error)alert(error.message);
}
async function calculatePoints(q){
  const {data:existing}=await supabase.from('points').select('*').eq('question_id',q.id);if((existing||[]).length)return;
  const opts=safeJson(q.options_json), byId=new Map(opts.map(o=>[o.id,o]));
  const {data:allVotes}=await supabase.from('votes').select('*').eq('question_id',q.id);
  const delta=new Map(players.map(p=>[Number(p.id),0]));
  (allVotes||[]).forEach(v=>{const opt=byId.get(v.option_id);if(!opt)return;if(opt.type==='correct')delta.set(Number(v.player_id),(delta.get(Number(v.player_id))||0)+2);if(opt.type==='fake')delta.set(Number(v.player_id),(delta.get(Number(v.player_id))||0)-1);if(opt.type==='player'&&Number(opt.player_id)!==Number(v.player_id))delta.set(Number(opt.player_id),(delta.get(Number(opt.player_id))||0)+1)});
  const rows=[...delta.entries()].map(([player_id,points])=>({game_id:currentGame.id,question_id:q.id,player_id,points,created_at:new Date().toISOString()}));
  if(rows.length)await supabase.from('points').insert(rows);
  for(const [player_id,d] of delta.entries()){const p=players.find(x=>Number(x.id)===Number(player_id));if(p)await supabase.from('players').update({score:Number(p.score||0)+Number(d||0)}).eq('id',player_id)}
}
async function deleteCurrentGame(){if(!currentGame)return;if(!confirm('Видалити гру?'))return;const {error}=await supabase.from('games').delete().eq('id',currentGame.id);if(error){alert(error.message);return}showMenu()}
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



function buildFinalTableHtml(){
  const arr=[...players].sort((a,b)=>Number(b.score||0)-Number(a.score||0));
  const winner=arr[0];

  if(!arr.length){
    return `
      <div class="winnerBox">
        <div class="winnerCup">🏆</div>
        <h2>Гра завершена</h2>
        <p class="muted">Гравців немає.</p>
      </div>
    `;
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
        <div class="avatarLine">
          ${avatarHtml(p,'big')}
          <div>
            <b>${i===0?'🥇':i===1?'🥈':i===2?'🥉':i+1+'.'} ${escapeHtml(p.name)}</b>
            <p class="muted">${i===0?'Переможець':i===1?'Друге місце':i===2?'Третє місце':'Учасник'}</p>
          </div>
        </div>
        <div class="scorePoints">${p.score||0}</div>
      </div>
    `).join('')}
  `;
}

function renderFinishedAdminScreen(){
  $('adminState').innerHTML=buildFinalTableHtml();
  $('revealPanel').innerHTML='';
  $('nextHint').textContent='Гра завершена';
  $('nextStageBtn').disabled=true;
  $('nextStageBtn').textContent='Гра завершена';
  $('scoreBoard').innerHTML=players.length
    ? [...players].sort((a,b)=>Number(b.score||0)-Number(a.score||0)).map((p,i)=>`
      <div class="scoreCard rank${i+1}">
        <div class="avatarLine">${avatarHtml(p,'big')}<div><b>${i===0?'🥇':i===1?'🥈':i===2?'🥉':i+1+'.'} ${escapeHtml(p.name)}</b><p class="muted">${i===0?'Переможець':i===1?'Друге місце':i===2?'Третє місце':'Учасник'}</p></div></div>
        <div class="scorePoints">${p.score||0}</div>
      </div>
    `).join('')
    : '<p class="muted">Поки немає балів.</p>';
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
}

// fixed renderAll
