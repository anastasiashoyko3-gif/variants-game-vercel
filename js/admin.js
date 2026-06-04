import {
  supabase,
  makeCode,
  escapeHtml,
  avatarHtml,
  hostAvatarHtml,
  TOTAL_QUESTIONS,
  ANSWER_SECONDS,
  VOTE_SECONDS,
  PHOTO_BUCKET,
  roundNo,
  nowSec,
  shuffle,
  safeJson
} from './supabaseClient.js';

const ADMIN_PASSWORD = 'admin123';

let currentGame = null;
let games = [];
let questions = [];
let players = [];
let answers = [];
let votes = [];
let channel = null;
let loading = false;

const loginCard = document.getElementById('loginCard');
const menuCard = document.getElementById('menuCard');
const createPanel = document.getElementById('createPanel');
const gameCard = document.getElementById('gameCard');
const questionEditor = document.getElementById('questionEditor');

function show(el) { el.hidden = false; el.classList.remove('hidden'); }
function hide(el) { el.hidden = true; el.classList.add('hidden'); }

document.getElementById('loginBtn').onclick = () => {
  const pass = document.getElementById('adminPassword').value.trim();
  if (pass !== ADMIN_PASSWORD) {
    document.getElementById('loginMsg').textContent = 'Неправильний пароль';
    return;
  }
  localStorage.setItem('admin_ok', '1');
  showMenu();
};

document.getElementById('logoutBtn').onclick = () => {
  localStorage.removeItem('admin_ok');
  localStorage.removeItem('current_game_id');
  location.reload();
};

document.getElementById('showCreateBtn').onclick = () => show(createPanel);
document.getElementById('cancelCreateBtn').onclick = () => hide(createPanel);
document.getElementById('refreshGamesBtn').onclick = loadGames;
document.getElementById('backToMenuBtn').onclick = showMenu;
document.getElementById('editQuestionsBtn').onclick = () => { renderQuestionEditor(); show(questionEditor); };
document.getElementById('closeEditorBtn').onclick = () => hide(questionEditor);
document.getElementById('saveQuestionsBtn').onclick = saveQuestions;
document.getElementById('deleteGameBtn').onclick = deleteCurrentGame;
document.getElementById('duplicateGameBtn').onclick = duplicateCurrentGame;

if (localStorage.getItem('admin_ok') === '1') {
  showMenu();
} else {
  show(loginCard); hide(menuCard); hide(gameCard);
}

function showMenu() {
  currentGame = null;
  if (channel) supabase.removeChannel(channel);
  hide(loginCard);
  hide(gameCard);
  show(menuCard);
  hide(createPanel);
  loadGames();
}

async function loadGames() {
  const { data, error } = await supabase
    .from('games')
    .select('*')
    .order('id', { ascending: false });

  if (error) {
    alert(error.message);
    return;
  }

  games = data || [];
  renderGamesList();
}

function renderGamesList() {
  const box = document.getElementById('gamesList');

  if (!games.length) {
    box.innerHTML = '<p class="muted">Збережених ігор поки немає.</p>';
    return;
  }

  box.innerHTML = games.map(g => `
    <div class="gameItem">
      <div>
        <h3>${escapeHtml(g.title || 'Гра')}</h3>
        <p class="muted">Код: <b>${escapeHtml(g.invite_code)}</b> · Фаза: ${escapeHtml(g.phase || 'lobby')} · Статус: ${escapeHtml(g.status || 'active')}</p>
      </div>
      <div class="actions">
        <button onclick="window.openGameById(${g.id})">Відкрити</button>
        <button class="secondary" onclick="window.duplicateGameById(${g.id})">Дублювати</button>
        <button class="danger" onclick="window.deleteGameById(${g.id})">Видалити</button>
      </div>
    </div>
  `).join('');
}

document.getElementById('createGameBtn').onclick = async () => {
  const title = document.getElementById('gameTitle').value.trim() || 'Гра Варіанти';
  const password = document.getElementById('gamePassword').value.trim() || 'game123';
  const hostAvatar = document.getElementById('hostAvatar').value.trim() || '👑';
  const invite_code = makeCode();

  const { data, error } = await supabase
    .from('games')
    .insert({
      invite_code,
      title,
      game_password: password,
      host_avatar: hostAvatar,
      status: 'active',
      phase: 'lobby',
      current_q: 0,
      answer_deadline: null,
      vote_deadline: null,
      scoreboard_visible: 0,
      created_at: new Date().toISOString(),
      finished_at: null
    })
    .select()
    .single();

  if (error) {
    alert(error.message);
    return;
  }

  localStorage.setItem('current_game_id', data.id);
  openGame(data);
};

window.openGameById = async (id) => {
  const { data, error } = await supabase.from('games').select('*').eq('id', id).single();
  if (error || !data) {
    alert(error?.message || 'Гру не знайдено');
    return;
  }
  openGame(data);
};

window.deleteGameById = async (id) => {
  const ok = confirm('Точно видалити гру?');
  if (!ok) return;

  const { error } = await supabase.from('games').delete().eq('id', id);
  if (error) alert(error.message);
  await loadGames();
};

window.duplicateGameById = async (id) => {
  const source = games.find(g => Number(g.id) === Number(id));
  if (!source) return;

  const { data: qs } = await supabase
    .from('questions')
    .select('*')
    .eq('game_id', id)
    .order('q_order', { ascending: true });

  const { data: newGame, error } = await supabase
    .from('games')
    .insert({
      invite_code: makeCode(),
      title: (source.title || 'Гра') + ' копія',
      game_password: source.game_password || 'game123',
      host_avatar: source.host_avatar || '👑',
      status: 'active',
      phase: 'lobby',
      current_q: 0,
      answer_deadline: null,
      vote_deadline: null,
      scoreboard_visible: 0,
      created_at: new Date().toISOString()
    })
    .select()
    .single();

  if (error) {
    alert(error.message);
    return;
  }

  const rows = (qs || []).map(q => ({
    game_id: newGame.id,
    q_order: q.q_order,
    round_no: q.round_no,
    text: q.text,
    correct_answer: q.correct_answer,
    fake_answer: q.fake_answer,
    photo_url: q.photo_url,
    options_json: '[]',
    revealed_json: '[]'
  }));

  if (rows.length) await supabase.from('questions').insert(rows);
  await loadGames();
};

async function duplicateCurrentGame() {
  if (!currentGame) return;
  await window.duplicateGameById(currentGame.id);
  alert('Гру продубльовано. Вона зʼявилась у меню.');
}

async function openGame(game) {
  currentGame = game;
  localStorage.setItem('current_game_id', game.id);

  hide(loginCard); hide(menuCard); show(gameCard);

  document.getElementById('gameName').textContent = game.title;
  document.getElementById('inviteLink').textContent = `${location.origin}/game.html?code=${game.invite_code}`;

  subscribe(game.id);
  await loadData();
  renderQuestionEditor();
}

async function loadData() {
  if (!currentGame || loading) return;
  loading = true;

  try {
    const [gRes, qRes, pRes] = await Promise.all([
      supabase.from('games').select('*').eq('id', currentGame.id).single(),
      supabase.from('questions').select('*').eq('game_id', currentGame.id).order('q_order', { ascending: true }),
      supabase.from('players').select('*').eq('game_id', currentGame.id).order('score', { ascending: false })
    ]);

    if (!gRes.error && gRes.data) currentGame = gRes.data;
    questions = qRes.data || [];
    players = pRes.data || [];

    const q = getCurrentQuestion();
    if (q) {
      const [aRes, vRes] = await Promise.all([
        supabase.from('answers').select('*').eq('question_id', q.id),
        supabase.from('votes').select('*').eq('question_id', q.id)
      ]);
      answers = aRes.data || [];
      votes = vRes.data || [];
    } else {
      answers = [];
      votes = [];
    }

    renderAll();
  } finally {
    loading = false;
  }
}

function getCurrentQuestion() {
  return questions[Number(currentGame?.current_q || 0)] || null;
}

function renderAll() {
  renderPlayers();
  renderScore();
  renderAdminState();
  renderRevealPanel();
}

function renderPlayers() {
  const box = document.getElementById('playersList');
  box.innerHTML = players.length ? players.map(p => `
    <div class="playerRow">
      <div class="avatarLine">${avatarHtml(p)}<b>${escapeHtml(p.name)}</b></div>
      <b>${p.score || 0}</b>
    </div>
  `).join('') : '<p class="muted">Гравців ще немає.</p>';
}

function renderScore() {
  const box = document.getElementById('scoreBoard');
  const arr = [...players].sort((a, b) => Number(b.score || 0) - Number(a.score || 0));
  box.innerHTML = arr.length ? arr.map((p, i) => `
    <div class="playerRow rank${i + 1}">
      <div class="avatarLine">${avatarHtml(p)}<b>${i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1 + '.'} ${escapeHtml(p.name)}</b></div>
      <b>${p.score || 0}</b>
    </div>
  `).join('') : '<p class="muted">Поки немає балів.</p>';
}

function renderAdminState() {
  const box = document.getElementById('adminState');
  const q = getCurrentQuestion();

  if (!q) {
    box.innerHTML = '<p class="muted">Питання ще не додані. Натисни “Редагувати питання”.</p>';
    return;
  }

  const opts = safeJson(q.options_json);
  const left = currentGame.phase === 'answering' ? leftSec(currentGame.answer_deadline) :
               currentGame.phase === 'voting' ? leftSec(currentGame.vote_deadline) : null;

  box.innerHTML = `
    <div class="pill">Фаза: ${escapeHtml(currentGame.phase)}</div>
    <div class="pill">Питання ${Number(currentGame.current_q) + 1} / ${questions.length}</div>
    ${left !== null ? `<div class="timer smallTimer">${left} сек</div>` : ''}
    <div class="question">${escapeHtml(q.text)}</div>
    ${q.photo_url ? `<img class="photo" src="${escapeHtml(q.photo_url)}" alt="Фото">` : ''}

    <h3>Відповіді наживо</h3>
    ${answers.length ? answers.map(a => {
      const p = players.find(x => Number(x.id) === Number(a.player_id));
      return `<div class="liveRow"><span class="avatarLine">${avatarHtml(p || {})}<b>${escapeHtml(p?.name || 'Гравець')}</b></span><span>${escapeHtml(a.text)}</span></div>`;
    }).join('') : '<p class="muted">Ще немає відповідей.</p>'}

    ${opts.length ? `<h3>Варіанти</h3><div class="optionList">${opts.map((o, i) => `<div class="optionPreview">${i + 1}. ${escapeHtml(o.text)}</div>`).join('')}</div>` : ''}
  `;
}

function renderRevealPanel() {
  const box = document.getElementById('revealPanel');
  const q = getCurrentQuestion();

  if (!q || currentGame.phase !== 'results') {
    box.innerHTML = '';
    return;
  }

  const opts = safeJson(q.options_json);
  const revealed = safeJson(q.revealed_json);

  box.innerHTML = `
    <h2>Відкриття відповідей</h2>
    <p class="muted">Натискай варіант, щоб відкрити його гравцям.</p>
    ${opts.length ? opts.map((o, i) => `
      <button class="option revealBtn" onclick="window.revealOption('${escapeHtml(o.id)}')">
        ${revealed.includes(o.id) ? '✓ ' : ''}${i + 1}. ${escapeHtml(o.text)}
      </button>
    `).join('') : '<p class="muted">Варіанти ще не створені.</p>'}
  `;
}

window.revealOption = async (optionId) => {
  const q = getCurrentQuestion();
  if (!q) return;

  const revealed = safeJson(q.revealed_json);
  if (!revealed.includes(optionId)) revealed.push(optionId);

  const { error } = await supabase.from('questions').update({ revealed_json: JSON.stringify(revealed) }).eq('id', q.id);
  if (error) alert(error.message);
  await loadData();
};

function renderQuestionEditor() {
  const box = document.getElementById('questionsForm');
  const byOrder = new Map(questions.map(q => [Number(q.q_order), q]));

  box.innerHTML = Array.from({ length: TOTAL_QUESTIONS }, (_, i) => {
    const q = byOrder.get(i) || {};
    const r = roundNo(i);

    return `
      <div class="qedit">
        <h3>Питання ${i + 1} · Раунд ${r} ${r === 3 ? '<small>можна фото</small>' : ''}</h3>
        <textarea id="q_${i}" placeholder="Текст питання">${escapeHtml(q.text || '')}</textarea>
        <input id="c_${i}" placeholder="Правильна відповідь" value="${escapeHtml(q.correct_answer || '')}" />
        <input id="f_${i}" placeholder="Фейк ведучої" value="${escapeHtml(q.fake_answer || '')}" />
        <input id="url_${i}" type="hidden" value="${escapeHtml(q.photo_url || '')}" />
        ${q.photo_url ? `<img class="thumb" src="${escapeHtml(q.photo_url)}" alt="Фото">` : ''}
        ${r === 3 ? `<label class="fileLabel">Фото до питання<input id="file_${i}" type="file" accept="image/*"></label>` : ''}
      </div>
    `;
  }).join('');
}

async function uploadQuestionPhoto(file, gameId, order) {
  if (!file) return '';

  const ext = file.name.split('.').pop() || 'jpg';
  const filePath = `game-${gameId}/q-${order}-${Date.now()}.${ext}`;

  const { error } = await supabase.storage
    .from(PHOTO_BUCKET)
    .upload(filePath, file, { cacheControl: '3600', upsert: true });

  if (error) {
    alert('Не вдалося завантажити фото: ' + error.message);
    return '';
  }

  const { data } = supabase.storage.from(PHOTO_BUCKET).getPublicUrl(filePath);
  return data.publicUrl;
}

async function saveQuestions() {
  if (!currentGame) return;

  const ok = confirm('Зберегти питання? Старі питання, відповіді, голоси й бали цієї гри будуть скинуті.');
  if (!ok) return;

  const rows = [];

  for (let i = 0; i < TOTAL_QUESTIONS; i++) {
    const text = document.getElementById(`q_${i}`).value.trim();
    const correct = document.getElementById(`c_${i}`).value.trim();
    const fake = document.getElementById(`f_${i}`).value.trim();
    const oldUrl = document.getElementById(`url_${i}`)?.value.trim() || '';
    const file = document.getElementById(`file_${i}`)?.files?.[0] || null;

    if (!text) continue;

    let photoUrl = oldUrl;
    if (file) {
      const uploaded = await uploadQuestionPhoto(file, currentGame.id, i);
      if (uploaded) photoUrl = uploaded;
    }

    rows.push({
      game_id: currentGame.id,
      q_order: i,
      round_no: roundNo(i),
      text,
      correct_answer: correct,
      fake_answer: fake,
      photo_url: photoUrl,
      options_json: '[]',
      revealed_json: '[]'
    });
  }

  await supabase.from('votes').delete().eq('game_id', currentGame.id);
  await supabase.from('answers').delete().eq('game_id', currentGame.id);
  await supabase.from('points').delete().eq('game_id', currentGame.id);
  await supabase.from('questions').delete().eq('game_id', currentGame.id);
  await supabase.from('players').update({ score: 0 }).eq('game_id', currentGame.id);

  if (rows.length) {
    const { error } = await supabase.from('questions').insert(rows);
    if (error) {
      alert(error.message);
      return;
    }
  }

  const { error: gError } = await supabase
    .from('games')
    .update({
      current_q: 0,
      phase: 'lobby',
      answer_deadline: null,
      vote_deadline: null,
      scoreboard_visible: 0,
      status: 'active',
      finished_at: null
    })
    .eq('id', currentGame.id);

  if (gError) alert(gError.message);

  hide(questionEditor);
  await loadData();
  alert('Питання збережені');
}

document.querySelectorAll('[data-action]').forEach(btn => {
  btn.onclick = async () => {
    if (!currentGame) return;
    await doAction(btn.dataset.action);
  };
});

async function doAction(action) {
  const q = getCurrentQuestion();

  if (!q && action !== 'finish_game') {
    alert('Спочатку додай питання.');
    return;
  }

  if (action === 'show_question') await updateGame({ phase: 'question_preview', answer_deadline: null, vote_deadline: null, scoreboard_visible: 0 });
  if (action === 'start_answers') await updateGame({ phase: 'answering', answer_deadline: nowSec() + ANSWER_SECONDS });
  if (action === 'show_options') { await buildOptions(q); await updateGame({ phase: 'preview', answer_deadline: null }); }
  if (action === 'start_voting') await updateGame({ phase: 'voting', vote_deadline: nowSec() + VOTE_SECONDS });
  if (action === 'finish_voting') { await calculatePoints(q); await updateGame({ phase: 'results', vote_deadline: null }); }
  if (action === 'show_scoreboard') await updateGame({ scoreboard_visible: 1 });
  if (action === 'hide_scoreboard') await updateGame({ scoreboard_visible: 0 });
  if (action === 'finish_game') await updateGame({ phase: 'finished', status: 'finished', finished_at: new Date().toISOString() });

  if (action === 'next_question') {
    const next = Number(currentGame.current_q || 0) + 1;
    if (next >= questions.length) {
      await updateGame({ phase: 'finished', status: 'finished', finished_at: new Date().toISOString() });
    } else {
      await updateGame({ current_q: next, phase: 'question_preview', scoreboard_visible: 0, answer_deadline: null, vote_deadline: null });
    }
  }

  await loadData();
}

async function updateGame(update) {
  const { data, error } = await supabase.from('games').update(update).eq('id', currentGame.id).select().single();
  if (error) { alert(error.message); return; }
  currentGame = data;
}

async function buildOptions(q) {
  const { data: allAnswers } = await supabase.from('answers').select('*').eq('question_id', q.id);
  const opts = [];

  (allAnswers || []).forEach(a => {
    opts.push({ id: `p_${a.player_id}`, type: 'player', text: a.text, player_id: a.player_id });
  });

  if (q.correct_answer) opts.push({ id: 'correct', type: 'correct', text: q.correct_answer, player_id: null });
  if (q.fake_answer) opts.push({ id: 'fake', type: 'fake', text: q.fake_answer, player_id: null });

  const { error } = await supabase.from('questions').update({ options_json: JSON.stringify(shuffle(opts)), revealed_json: '[]' }).eq('id', q.id);
  if (error) alert(error.message);
}

async function calculatePoints(q) {
  const { data: existingPoints } = await supabase.from('points').select('*').eq('question_id', q.id);
  if ((existingPoints || []).length) return;

  const opts = safeJson(q.options_json);
  const byId = new Map(opts.map(o => [o.id, o]));
  const { data: allVotes } = await supabase.from('votes').select('*').eq('question_id', q.id);

  const scoreDelta = new Map(players.map(p => [Number(p.id), 0]));

  (allVotes || []).forEach(v => {
    const opt = byId.get(v.option_id);
    if (!opt) return;

    if (opt.type === 'correct') scoreDelta.set(Number(v.player_id), (scoreDelta.get(Number(v.player_id)) || 0) + 2);
    if (opt.type === 'fake') scoreDelta.set(Number(v.player_id), (scoreDelta.get(Number(v.player_id)) || 0) - 1);
    if (opt.type === 'player' && Number(opt.player_id) !== Number(v.player_id)) {
      scoreDelta.set(Number(opt.player_id), (scoreDelta.get(Number(opt.player_id)) || 0) + 1);
    }
  });

  const pointRows = [...scoreDelta.entries()].map(([player_id, points]) => ({
    game_id: currentGame.id,
    question_id: q.id,
    player_id,
    points,
    created_at: new Date().toISOString()
  }));

  if (pointRows.length) await supabase.from('points').insert(pointRows);

  for (const [player_id, delta] of scoreDelta.entries()) {
    const p = players.find(x => Number(x.id) === Number(player_id));
    if (!p) continue;
    await supabase.from('players').update({ score: Number(p.score || 0) + Number(delta || 0) }).eq('id', player_id);
  }
}

async function deleteCurrentGame() {
  if (!currentGame) return;
  const ok = confirm('Точно видалити цю гру?');
  if (!ok) return;

  const { error } = await supabase.from('games').delete().eq('id', currentGame.id);
  if (error) { alert(error.message); return; }

  currentGame = null;
  localStorage.removeItem('current_game_id');
  showMenu();
}

function subscribe(gameId) {
  if (channel) supabase.removeChannel(channel);

  channel = supabase
    .channel('admin-game-' + gameId)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'players', filter: 'game_id=eq.' + gameId }, loadData)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'questions', filter: 'game_id=eq.' + gameId }, loadData)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'answers', filter: 'game_id=eq.' + gameId }, loadData)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'votes', filter: 'game_id=eq.' + gameId }, loadData)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'games', filter: 'id=eq.' + gameId }, payload => {
      currentGame = payload.new;
      loadData();
    })
    .subscribe(status => console.log('admin realtime', status));
}

function leftSec(deadline) {
  if (!deadline) return 0;
  return Math.max(0, Number(deadline) - nowSec());
}

setInterval(() => {
  if (currentGame && (currentGame.phase === 'answering' || currentGame.phase === 'voting')) {
    renderAdminState();
  }
}, 1000);
