import test from 'node:test';
import assert from 'node:assert/strict';
import { createHarness } from './harness.js';

for (const blueTeam of [1, 2]) test(`three-round lifecycle with team ${blueTeam} chosen blue`, async () => {
  const h = await createHarness();
  const call = async (api, body, options) => {
    const result = await h.call(api, body, options);
    assert.equal(result.status, 200, JSON.stringify(result.data));
    return result.data;
  };
  try {
    assert.equal((await h.call('team-game-admin', { action: 'create', teams: [] }, { public: true })).status, 401);
    assert.equal((await h.call('team-game-admin', { action: 'create', teams: [{ name: '' }, { name: 'B' }] })).status, 400);
    const { game } = await call('team-game-admin', { action: 'create', title: 'Перевірка', teams: [{ name: 'Альфа' }, { name: 'Бета' }] });
    const gameId = game.id;
    const admin = (action, extra = {}) => call('team-game-admin', { action, gameId, ...extra });
    const round1 = action => call('team-round1', { action, gameId });
    const play = (action, extra = {}) => call('team-play', { action, gameId, ...extra });
    await admin('saveContent', { wordLists: [['сонце'], ['кіт']], prompts: [{ description: 'Опис один', answer: 'Телефон' }, { description: 'Опис два', answer: 'Стіл' }] });
    assert.equal((await h.call('team-game-admin', { action: 'generateBoard', gameId, blueTeam })).status, 409);
    assert.equal((await admin('details')).cards.length, 0);
    assert.equal((await h.call('team-play', { action: 'round2Start', gameId, blueTeam })).status, 409);
    assert.equal((await h.call('team-play', { action: 'showFinalScore', gameId })).status, 409);
    await round1('start');
    let live = await call('team-live', null, { query: { gameId } });
    assert.equal(live.game.phase, 'round1_ready');
    assert.equal(live.game.round_deadline, null);
    assert.equal(live.game.round_paused_seconds, 90);
    assert.equal((await h.call('team-game-admin', { action: 'saveContent', gameId, wordLists: [[], []], prompts: [] })).status, 409);
    await round1('startTimer');
    assert.equal((await h.call('team-round1', { action: 'startTimer', gameId })).status, 409);
    assert.equal((await h.call('team-play', { action: 'round2Start', gameId, blueTeam })).status, 409);
    live = await call('team-live', null, { query: { gameId } });
    const publicLive = await call('team-live', null, { public: true, query: { gameId, code: game.invite_code } });
    assert.equal(publicLive.activeWord, undefined);
    const activeRole = live.roleLinks.find(r => String(r.teamId) === String(live.game.active_team_id));
    assert.equal((await call('team-live', null, { public: true, query: { gameId, code: game.invite_code, roleToken: activeRole.token } })).activeWord, 'сонце');
    await call('team-round1', { action: 'score', result: 'correct', gameId });
    await round1('nextTeam');
    await round1('startTimer');
    await call('team-round1', { action: 'score', result: 'skipped', gameId });
    await round1('finishRound');
    // No score-based assignment, even when the chosen blue team has more points.
    assert.equal((await admin('details')).cards.length, 0);
    for (const bad of [undefined, 0, 3]) assert.equal((await h.call('team-play', { action: 'round2Start', gameId, blueTeam: bad })).status, 400);
    await play('round2Start', { blueTeam });
    const details = await admin('details');
    assert.equal(details.cards.length, 25);
    assert.deepEqual(Object.fromEntries(['blue', 'red', 'neutral', 'black'].map(c => [c, details.cards.filter(x => x.card_color === c).length])), { blue: 9, red: 8, neutral: 7, black: 1 });
    live = await call('team-live', null, { query: { gameId } });
    assert.equal(String(live.game.active_team_id), String(details.teams[blueTeam - 1].id));
    assert.equal(details.roles.find(r => r.color === 'blue').team_id, details.teams[blueTeam - 1].id);
    assert.equal((await h.call('team-play', { action: 'round2Start', gameId, blueTeam })).status, 409);
    const spectator = await call('team-live', null, { public: true, query: { gameId, code: game.invite_code } });
    assert.ok(spectator.cards.every(c => c.card_color === undefined));
    await play('reveal', { position: details.cards.find(c => c.card_color === 'blue').position });
    await play('switchTeam');
    await play('endRound2');
    await play('round3Start');
    live = await call('team-live', null, { query: { gameId } });
    assert.equal(live.prompt.answer, 'Телефон');
    assert.equal((await call('team-live', null, { public: true, query: { gameId, code: game.invite_code } })).prompt.answer, undefined);
    await play('guess', { teamId: details.teams[0].id, correct: false });
    await play('guess', { teamId: details.teams[1].id, correct: true });
    await play('nextPrompt');
    live = await call('team-live', null, { query: { gameId } });
    assert.equal(live.prompt.answer, 'Стіл');
    assert.equal(live.isLastPrompt, true);
    await play('guess', { teamId: details.teams[0].id, correct: true });
    await play('finishGame');
    const round3Done = await call('team-live', null, { query: { gameId } });
    assert.equal(round3Done.game.status, 'finished');
    assert.equal(round3Done.game.phase, 'round3_done');
    assert.equal((await h.call('team-play', { action: 'showFinalScore', gameId }, { public: true })).status, 401);
    await play('showFinalScore');
    assert.equal((await call('team-live', null, { public: true, query: { gameId, code: game.invite_code } })).game.phase, 'finished');
    assert.equal((await h.call('team-play', { action: 'showFinalScore', gameId })).status, 409);
    await call('team-restart', { gameId });
    const reset = await admin('details');
    assert.equal(reset.game.status, 'setup');
    assert.equal(reset.cards.length, 0);
    assert.equal(reset.roles.length, 0);
    assert.equal(reset.words.length, 2);
    assert.equal(reset.prompts.length, 2);
    assert.ok(reset.teams.every(t => t.round1_score + t.round2_score + t.round3_score === 0));
  } finally { await h.db.close(); }
});

test('board transaction rolls back on failure and insufficient bank leaves round 1 intact', async () => {
  const h = await createHarness();
  try {
    const { game } = (await h.call('team-game-admin', { action: 'create', teams: [{ name: 'A' }, { name: 'B' }] })).data;
    await h.db.query("UPDATE team_games SET status='playing',phase='round1_done' WHERE id=$1", [game.id]);
    await h.db.exec("CREATE FUNCTION reject_card() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test failure'; END $$; CREATE TRIGGER reject_card BEFORE INSERT ON team_codenames_cards FOR EACH ROW EXECUTE FUNCTION reject_card()");
    assert.equal((await h.call('team-play', { action: 'round2Start', gameId: game.id, blueTeam: 2 })).status, 500);
    assert.equal((await h.db.query('SELECT * FROM team_codenames_roles')).rows.length, 0);
    assert.equal((await h.db.query("SELECT * FROM team_codenames_bank WHERE used_at IS NOT NULL")).rows.length, 0);
    assert.equal((await h.db.query('SELECT phase FROM team_games')).rows[0].phase, 'round1_done');
    await h.db.exec('DROP TRIGGER reject_card ON team_codenames_cards; DELETE FROM team_codenames_bank WHERE id>24');
    const result = await h.call('team-play', { action: 'round2Start', gameId: game.id, blueTeam: 1 });
    assert.match(result.data.error, /замало/);
    assert.equal((await h.db.query('SELECT phase FROM team_games')).rows[0].phase, 'round1_done');
  } finally { await h.db.close(); }
});

test('existing variants and letters mode CRUD keeps questions and word config', async () => {
  const h = await createHarness();
  try {
    for (const mode of ['variants', 'letters']) {
      const config = JSON.stringify({ categories: ['Їжа'], drawWords: ['кіт'], teams: [] });
      const created = await h.call('admin-db', { table: 'games', operation: 'insert', values: { title: mode, invite_code: mode, mode, word_config_json: config, phase: mode === 'letters' ? 'word_lobby' : 'lobby' }, single: true });
      assert.equal(created.status, 200);
      assert.equal(created.data.data.mode, mode);
      assert.equal(created.data.data.word_config_json, config);
      const id = created.data.data.id;
      const q = await h.call('admin-db', { table: 'questions', operation: 'insert', values: { game_id: id, text: 'Питання', correct_answer: 'Відповідь' } });
      assert.equal(q.status, 200);
      const fetched = await h.call('admin-db', { table: 'questions', operation: 'select', filters: [{ type: 'eq', column: 'game_id', value: id }] });
      assert.equal(fetched.data.data[0].text, 'Питання');
      assert.equal((await h.call('admin-db', { table: 'games', operation: 'update', values: { title: 'Оновлено' }, filters: [{ type: 'eq', column: 'id', value: id }] })).status, 200);
    }
    assert.equal((await h.call('team-restart')).status, 405);
  } finally { await h.db.close(); }
});
