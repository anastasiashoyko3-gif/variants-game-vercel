import {
  supabase,
  escapeHtml,
  avatarHtml,
  hostAvatarHtml,
  nowSec,
  safeJson
} from './supabaseClient.js';

let game = null;
let player = null;
let questions = [];
let currentQuestion = null;
let players = [];
let answers = [];
let votes = [];
let channel = null;
let timerInterval = null;
let pollInterval = null;
let loading = false;

const joinCard = document.getElementById('joinCard');
const playCard = document.getElementById('playCard');
const stateBox = document.getElementById('gameState');

const urlCode = new URLSearchParams(location.search).get('code');
if (urlCode) document.getElementById('inviteCode').value = urlCode;

document.getElementById('joinBtn').onclick = joinGame;
document.getElementById('leaveBtn').onclick = () => {
  localStorage.removeItem('player_game_id');
  localStorage.removeItem('player_id');
  location.reload();
};

restorePlayerSession();

async function restorePlayerSession() {
  const gameId = localStorage.getItem('player_game_id');
  const playerId = localStorage.getItem('player_id');
  if (!gameId || !playerId) return;

  const [gRes, pRes] = await Promise.all([
    supabase.from('games').select('*').eq('id', gameId).single(),
    supabase.from('players').select('*').eq('id', playerId).single()
  ]);

  if (gRes.error || pRes.error || !gRes.data || !pRes.data) return;

  game = gRes.data;
  player = pRes.data;

  joinCard.classList.add('hidden');
  playCard.classList.remove('hidden');
  document.getElementById('meName').textContent = player.name;

  await refreshState();
  subscribe();
}

async function joinGame() {
  const code = document.getElementById('inviteCode').value.trim();
  const name = document.getElementById('playerName').value.trim();
  const pin = document.getElementById('playerPin').value.trim();
  const avatar = document.getElementById('playerAvatar').value.trim();
  const password = document.getElementById('gamePassword').value.trim();

  if (!code || !name || !pin || !password) {
    document.getElementById('joinMsg').textContent = 'Заповни код, імʼя, PIN і пароль';
    return;
  }

  const { data: foundGame, error: gameErr } = await supabase.from('games').select('*').eq('invite_code', code).single();

  if (gameErr || !foundGame) {
    document.getElementById('joinMsg').textContent = 'Гру не знайдено';
    return;
  }

  if (password !== (foundGame.game_password || 'game123')) {
    document.getElementById('joinMsg').textContent = 'Неправильний пароль гри';
    return;
  }

  game = foundGame;

  const { data: existing } = await supabase
    .from('players')
    .select('*')
    .eq('game_id', game.id)
    .ilike('name', name)
    .eq('pin', pin)
    .maybeSingle();

  if (existing) {
    player = existing;
  } else {
    const { data: newPlayer, error: playerErr } = await supabase
      .from('players')
      .insert({
        game_id: game.id,
        name,
        pin,
        avatar: avatar || '',
        score: 0,
        created_at: new Date().toISOString()
      })
      .select()
      .single();

    if (playerErr) {
      document.getElementById('joinMsg').textContent = playerErr.message;
      return;
    }

    player = newPlayer;
  }

  localStorage.setItem('player_game_id', game.id);
  localStorage.setItem('player_id', player.id);

  joinCard.classList.add('hidden');
  playCard.classList.remove('hidden');
  document.getElementById('meName').textContent = player.name;

  await refreshState();
  subscribe();
}

async function refreshState() {
  if (!game || loading) return;
  loading = true;

  try {
    const [gRes, qRes, pRes] = await Promise.all([
      supabase.from('games').select('*').eq('id', game.id).single(),
      supabase.from('questions').select('*').eq('game_id', game.id).order('q_order', { ascending: true }),
      supabase.from('players').select('*').eq('game_id', game.id)
    ]);

    if (!gRes.error && gRes.data) game = gRes.data;
    questions = qRes.data || [];
    players = pRes.data || [];
    currentQuestion = questions[Number(game.current_q || 0)] || null;

    if (currentQuestion) {
      const [aRes, vRes] = await Promise.all([
        supabase.from('answers').select('*').eq('question_id', currentQuestion.id),
        supabase.from('votes').select('*').eq('question_id', currentQuestion.id)
      ]);
      answers = aRes.data || [];
      votes = vRes.data || [];
    } else {
      answers = [];
      votes = [];
    }

    render();
  } finally {
    loading = false;
  }
}

function subscribe() {
  if (channel) supabase.removeChannel(channel);
  if (pollInterval) clearInterval(pollInterval);

  channel = supabase
    .channel('player-game-' + game.id)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'games', filter: 'id=eq.' + game.id }, payload => {
      game = payload.new;
      refreshState();
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'questions', filter: 'game_id=eq.' + game.id }, refreshState)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'answers', filter: 'game_id=eq.' + game.id }, refreshState)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'votes', filter: 'game_id=eq.' + game.id }, refreshState)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'players', filter: 'game_id=eq.' + game.id }, refreshState)
    .subscribe(status => console.log('player realtime', status));

  pollInterval = setInterval(refreshState, 2500);
}

async function sendAnswer() {
  const answer = document.getElementById('answerText')?.value.trim();
  const msg = document.getElementById('answerMsg');

  if (!answer) {
    if (msg) msg.textContent = 'Спочатку напиши відповідь.';
    return;
  }

  if (!currentQuestion || game.phase !== 'answering') return;

  if (game.answer_deadline && nowSec() >= Number(game.answer_deadline)) {
    if (msg) msg.textContent = 'Час вийшов.';
    return;
  }

  const { error } = await supabase
    .from('answers')
    .upsert(
      {
        game_id: game.id,
        question_id: currentQuestion.id,
        player_id: player.id,
        text: answer,
        created_at: new Date().toISOString()
      },
      { onConflict: 'question_id,player_id' }
    );

  if (msg) msg.textContent = error ? error.message : 'Відповідь збережено 💜';
  await refreshState();
}

async function vote(optionId) {
  if (!currentQuestion || game.phase !== 'voting') return;

  if (game.vote_deadline && nowSec() >= Number(game.vote_deadline)) {
    alert('Час голосування вийшов.');
    return;
  }

  const opts = safeJson(currentQuestion.options_json);
  const chosen = opts.find(o => o.id === optionId);

  if (chosen?.type === 'player' && Number(chosen.player_id) === Number(player.id)) {
    alert('Не можна голосувати за свою відповідь.');
    return;
  }

  const { error } = await supabase
    .from('votes')
    .upsert(
      {
        game_id: game.id,
        question_id: currentQuestion.id,
        player_id: player.id,
        option_id: optionId,
        created_at: new Date().toISOString()
      },
      { onConflict: 'question_id,player_id' }
    );

  if (error) alert(error.message);
  await refreshState();
}

window.sendAnswer = sendAnswer;
window.vote = vote;

function render() {
  clearInterval(timerInterval);

  if (!game) return;

  let html = '';

  if (game.phase === 'lobby' || game.phase === 'setup') {
    html = '<p>Чекаємо старт гри.</p>';
  }

  if (!currentQuestion && game.phase !== 'finished' && game.phase !== 'lobby') {
    html = '<p class="muted">Питання ще не додані.</p>';
  }

  if (currentQuestion && game.phase === 'question_preview') {
    html = questionHtml() + `<p class="muted">Подивіться питання, подумайте, відповіді ще не відкриті.</p>`;
  }

  if (currentQuestion && game.phase === 'answering') {
    const left = deadlineLeft(game.answer_deadline);
    const myAnswer = answers.find(a => Number(a.player_id) === Number(player.id));

    html = questionHtml() + timerHtml(left);

    if (left <= 0) {
      html += '<p class="muted">Час на відповідь вийшов.</p>';
    } else {
      html += `
        <textarea id="answerText" placeholder="Твій варіант відповіді">${escapeHtml(myAnswer?.text || '')}</textarea>
        <button onclick="sendAnswer()">Відправити</button>
        <p id="answerMsg" class="muted">${myAnswer ? 'Твоя відповідь вже збережена 💜' : ''}</p>
      `;
    }
  }

  if (currentQuestion && game.phase === 'preview') {
    const opts = safeJson(currentQuestion.options_json);
    html = questionHtml() + `
      <h2>Варіанти</h2>
      <p class="muted">Поки тільки читаємо. Голосування ще не почалось.</p>
      ${opts.map((o, i) => `<button class="option" disabled>${i + 1}. ${escapeHtml(o.text)}</button>`).join('')}
    `;
  }

  if (currentQuestion && game.phase === 'voting') {
    const left = deadlineLeft(game.vote_deadline);
    const opts = safeJson(currentQuestion.options_json);
    const myVote = votes.find(v => Number(v.player_id) === Number(player.id));

    html = questionHtml() + timerHtml(left) + '<h2>Голосування</h2>';

    html += opts.map((o, i) => {
      const isOwn = o.type === 'player' && Number(o.player_id) === Number(player.id);
      const selected = myVote && myVote.option_id === o.id ? ' ✓' : '';

      if (left <= 0) return `<button class="option" disabled>${i + 1}. ${escapeHtml(o.text)}${selected}</button>`;
      if (isOwn) return `<button class="option ownOption" disabled>${i + 1}. ${escapeHtml(o.text)} — твоя відповідь</button>`;

      return `<button class="option" onclick="vote('${escapeHtml(o.id)}')">${i + 1}. ${escapeHtml(o.text)}${selected}</button>`;
    }).join('');

    if (left <= 0) html += '<p class="muted">Час голосування вийшов.</p>';
  }

  if (currentQuestion && game.phase === 'results') {
    html = questionHtml() + renderResults();
    if (game.scoreboard_visible) html += scoreHtml();
  }

  if (game.phase === 'finished') {
    html = '<h2>Гра завершена</h2>' + scoreHtml();
  }

  stateBox.innerHTML = html;
  startTimer();
}

function questionHtml() {
  if (!currentQuestion) return '';

  return `
    <div class="pill">Раунд ${currentQuestion.round_no} · питання ${Number(game.current_q) + 1}</div>
    <div class="question">${escapeHtml(currentQuestion.text)}</div>
    ${currentQuestion.photo_url ? `<img class="photo" src="${escapeHtml(currentQuestion.photo_url)}" alt="Фото до питання">` : ''}
  `;
}

function renderResults() {
  const opts = safeJson(currentQuestion.options_json);
  const revealed = safeJson(currentQuestion.revealed_json);

  if (!revealed.length) {
    return '<h2>Відкриття відповідей</h2><p class="muted">Ведуча відкриває відповіді по черзі.</p>';
  }

  const shown = opts.filter(o => revealed.includes(o.id));
  return `<h2>Відкриття відповідей</h2>${shown.map(o => revealCard(o)).join('')}`;
}

function revealCard(o) {
  const voters = votes
    .filter(v => v.option_id === o.id)
    .map(v => players.find(p => Number(p.id) === Number(v.player_id)))
    .filter(Boolean);

  let authorHtml = '';
  let label = '';

  if (o.type === 'correct') {
    authorHtml = avatarHtml({ name: 'Правильна', avatar: '✓' }, 'big');
    label = 'Правильна відповідь';
  }

  if (o.type === 'fake') {
    authorHtml = hostAvatarHtml(game, 'big');
    label = 'Фейк ведучої';
  }

  if (o.type === 'player') {
    const author = players.find(p => Number(p.id) === Number(o.player_id));
    authorHtml = avatarHtml(author || { name: 'Гравець', avatar: '?' }, 'big');
    label = author ? author.name : 'Гравець';
  }

  return `
    <div class="revealRow revealGrid">
      <div class="avatarLine authorSide">${authorHtml}<b>${escapeHtml(label)}</b></div>
      <div>
        <span class="tag ${o.type === 'correct' ? 'correct' : o.type === 'fake' ? 'fake' : ''}">
          ${o.type === 'correct' ? 'Правильна' : o.type === 'fake' ? 'Фейк' : 'Гравець'}
        </span>
        <div class="answerBig">${escapeHtml(o.text)}</div>
      </div>
      <div>
        <b>Голосували:</b>
        ${voters.length ? voters.map(v => `<div class="avatarLine voterMini">${avatarHtml(v, 'small')}<span>${escapeHtml(v.name)}</span></div>`).join('') : '<p class="muted">Ніхто</p>'}
      </div>
    </div>
  `;
}

function scoreHtml() {
  const arr = [...players].sort((a, b) => Number(b.score || 0) - Number(a.score || 0));
  return `<h2>Таблиця гравців</h2>${arr.map((p, i) => `
    <div class="playerRow rank${i + 1}">
      <div class="avatarLine">${avatarHtml(p)}<b>${i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1 + '.'} ${escapeHtml(p.name)}</b></div>
      <b>${p.score || 0}</b>
    </div>
  `).join('')}`;
}

function timerHtml(left) {
  return `<div class="timer" id="timerBox">${Math.max(0, left)} сек</div>`;
}

function deadlineLeft(deadline) {
  if (!deadline) return 0;
  return Math.max(0, Number(deadline) - nowSec());
}

function startTimer() {
  const box = document.getElementById('timerBox');
  if (!box) return;

  const tick = () => {
    const deadline = game.phase === 'answering' ? game.answer_deadline : game.vote_deadline;
    const left = deadlineLeft(deadline);
    box.textContent = `${left} сек`;

    if (left <= 0) setTimeout(refreshState, 250);
  };

  tick();
  timerInterval = setInterval(tick, 1000);
}
