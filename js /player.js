import { supabase, escapeHtml } from './supabaseClient.js';

let game = null;
let player = null;
let channel = null;
let timerInterval = null;

const joinCard = document.getElementById('joinCard');
const playCard = document.getElementById('playCard');
const stateBox = document.getElementById('gameState');

const urlCode = new URLSearchParams(location.search).get('code');
if (urlCode) document.getElementById('inviteCode').value = urlCode;

document.getElementById('joinBtn').onclick = joinGame;

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

  const { data: foundGame, error: gameErr } = await supabase
    .from('games')
    .select('*')
    .eq('invite_code', code)
    .single();

  if (gameErr || !foundGame) {
    document.getElementById('joinMsg').textContent = 'Гру не знайдено';
    return;
  }

  if (password !== 'game123') {
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

  render();
  subscribe();
}

function subscribe() {
  if (channel) supabase.removeChannel(channel);

  channel = supabase
    .channel('player-game-' + game.id)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'games', filter: 'id=eq.' + game.id }, payload => {
      game = payload.new;
      render();
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'players', filter: 'game_id=eq.' + game.id }, render)
    .subscribe(status => console.log('player realtime', status));
}

function render() {
  if (!game) return;
  clearInterval(timerInterval);

  let html = '';

  if (game.phase === 'lobby' || game.phase === 'setup') html = '<p>Чекаємо старт гри.</p>';
  if (game.phase === 'question_preview') html = '<h2>Питання скоро буде тут</h2><p class="muted">Поки що це тестова Vercel/Supabase версія.</p>';
  if (game.phase === 'answering') html = `<h2>Етап відповідей</h2><div class="timer" id="timerBox"></div><textarea placeholder="Твоя відповідь"></textarea><button>Відправити</button>`;
  if (game.phase === 'voting') html = `<h2>Голосування</h2><div class="timer" id="timerBox"></div><p class="muted">Варіанти додамо наступним кроком.</p>`;
  if (game.phase === 'results') html = '<h2>Результати</h2><p class="muted">Розкриття відповідей додамо наступним кроком.</p>';
  if (game.phase === 'finished') html = '<h2>Гра завершена</h2>';

  stateBox.innerHTML = html;
  startTimer();
}

function startTimer() {
  const box = document.getElementById('timerBox');
  if (!box) return;

  const getDeadline = () => {
    if (game.phase === 'answering') return game.answer_deadline;
    if (game.phase === 'voting') return game.vote_deadline;
    return null;
  };

  const tick = () => {
    const deadline = getDeadline();
    if (!deadline) {
      box.textContent = '';
      return;
    }
    const left = Math.max(0, Number(deadline) - Math.floor(Date.now() / 1000));
    box.textContent = left + ' сек';
  };

  tick();
  timerInterval = setInterval(tick, 1000);
}
