import { supabase, makeCode, escapeHtml } from './supabaseClient.js';

const ADMIN_PASSWORD = 'admin123';
let currentGame = null;
let channel = null;

const loginCard = document.getElementById('loginCard');
const createCard = document.getElementById('createCard');
const gameCard = document.getElementById('gameCard');

document.getElementById('loginBtn').onclick = () => {
  const pass = document.getElementById('adminPassword').value.trim();
  if (pass !== ADMIN_PASSWORD) {
    document.getElementById('loginMsg').textContent = 'Неправильний пароль';
    return;
  }
  localStorage.setItem('admin_ok', '1');
  loginCard.classList.add('hidden');
  createCard.classList.remove('hidden');
};

if (localStorage.getItem('admin_ok') === '1') {
  loginCard.classList.add('hidden');
  createCard.classList.remove('hidden');
}

document.getElementById('createGameBtn').onclick = async () => {
  const title = document.getElementById('gameTitle').value.trim() || 'Гра Варіанти';
  const password = document.getElementById('gamePassword').value.trim() || 'game123';
  const invite_code = makeCode();

  const { data, error } = await supabase
    .from('games')
    .insert({
      invite_code,
      title,
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

  localStorage.setItem('game_password_' + data.id, password);
  openGame(data);
};

function openGame(game) {
  currentGame = game;
  createCard.classList.add('hidden');
  gameCard.classList.remove('hidden');
  document.getElementById('gameName').textContent = game.title;
  document.getElementById('inviteLink').textContent = `${location.origin}/game.html?code=${game.invite_code}`;
  subscribe(game.id);
  renderPlayers();
}

async function renderPlayers() {
  if (!currentGame) return;

  const { data: players, error } = await supabase
    .from('players')
    .select('*')
    .eq('game_id', currentGame.id)
    .order('score', { ascending: false });

  if (error) {
    console.error(error);
    return;
  }

  document.getElementById('playersList').innerHTML = players.length
    ? players.map(p => `
        <div class="playerRow">
          <div class="avatarLine">
            <span class="avatar">${escapeHtml(p.avatar || p.name[0])}</span>
            <b>${escapeHtml(p.name)}</b>
          </div>
          <b>${p.score || 0}</b>
        </div>
      `).join('')
    : '<p class="muted">Гравців ще немає.</p>';
}

document.querySelectorAll('[data-phase]').forEach(btn => {
  btn.onclick = async () => {
    if (!currentGame) return;
    const phase = btn.dataset.phase;
    const update = { phase };

    if (phase === 'answering') update.answer_deadline = Math.floor(Date.now() / 1000) + 60;
    if (phase === 'voting') update.vote_deadline = Math.floor(Date.now() / 1000) + 45;

    const { error } = await supabase.from('games').update(update).eq('id', currentGame.id);
    if (error) alert(error.message);
  };
});

function subscribe(gameId) {
  if (channel) supabase.removeChannel(channel);

  channel = supabase
    .channel('admin-game-' + gameId)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'players', filter: 'game_id=eq.' + gameId }, renderPlayers)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'games', filter: 'id=eq.' + gameId }, payload => {
      currentGame = payload.new;
    })
    .subscribe(status => console.log('admin realtime', status));
}
