export function teamScreenState(game, isTeamScreen, hasActiveWord) {
  const results = game.status === 'finished' ||
    (game.status === 'playing' && ['round1_done', 'round2_done'].includes(game.phase));
  const round1 = game.status === 'playing' && game.current_round === 1 && !results;
  const takingTurn = ['round1_ready', 'round1_play'].includes(game.phase);
  return {
    mode: results ? 'results' : round1 ? 'focus' : 'standard',
    results,
    timer: round1 && takingTurn && !isTeamScreen,
    word: !results && game.status === 'playing' &&
      ((round1 && takingTurn && isTeamScreen && hasActiveWord) || game.current_round === 3),
    board: !results && game.status === 'playing' && game.current_round === 2,
    notice: round1 && game.phase === 'round1_team_done' ? 'Хід завершено' :
      round1 && isTeamScreen && !hasActiveWord ? 'Очікуємо ходу' : ''
  };
}

export function teamResult(game, teams) {
  const final = game.status === 'finished' && game.phase === 'finished';
  const scores = teams.map(team => final
    ? Number(team.round1_score) + Number(team.round2_score) + Number(team.round3_score)
    : Number(team['round' + game.current_round + '_score']));
  return {
    final,
    title: final ? 'Загальний рахунок' : 'Підсумок раунду ' + game.current_round,
    scores,
    winner: final ? (scores[0] === scores[1] ? 'Нічия!' : 'Перемогли: ' + teams[scores[0] > scores[1] ? 0 : 1].name + '!') : ''
  };
}
