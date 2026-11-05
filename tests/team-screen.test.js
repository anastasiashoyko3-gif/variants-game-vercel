import test from 'node:test';
import assert from 'node:assert/strict';
import { teamScreenState } from '../js/team-screen-state.js';

test('results are shown only after a full round, never after an individual turn or answer',()=>{
 for(const [round,phase] of [[1,'round1_ready'],[1,'round1_play'],[1,'round1_team_done'],[2,'round2_play'],[3,'round3_play'],[3,'round3_wait_next']]){
  assert.equal(teamScreenState({status:'playing',current_round:round,phase},false,false).results,false,phase);
 }
 for(const [round,phase,status] of [[1,'round1_done','playing'],[2,'round2_done','playing'],[3,'round3_done','finished'],[3,'finished','finished']]){
  const state=teamScreenState({status,current_round:round,phase},true,true);
  assert.equal(state.mode,'results');assert.equal(state.word,false);assert.equal(state.board,false);assert.equal(state.timer,false);
 }
 assert.equal(teamScreenState({status:'setup',current_round:1,phase:'setup'},false,false).results,false);
});

test('round one isolates the word for the active team and timer for spectators',()=>{
 const game={status:'playing',current_round:1,phase:'round1_play'};
 const active=teamScreenState(game,true,true),spectator=teamScreenState(game,false,true),waiting=teamScreenState(game,true,false);
 assert.equal(active.mode,'focus');assert.equal(active.word,true);assert.equal(active.timer,false);
 assert.equal(spectator.mode,'focus');assert.equal(spectator.word,false);assert.equal(spectator.timer,true);
 assert.equal(waiting.word,false);assert.equal(waiting.notice,'Очікуємо ходу');
 const done=teamScreenState({...game,phase:'round1_team_done'},true,true);
 assert.equal(done.word,false);assert.equal(done.notice,'Хід завершено');assert.equal(done.results,false);
});

test('round results show only that round; totals and winner require the final reveal phase', async()=>{
 const {teamResult}=await import('../js/team-screen-state.js');
 const teams=[{name:'A',round1_score:7,round2_score:4,round3_score:-3},{name:'B',round1_score:2,round2_score:8,round3_score:3}];
 for(const [round,scores] of [[1,[7,2]],[2,[4,8]],[3,[-3,3]]]){
  const result=teamResult({current_round:round,status:round===3?'finished':'playing',phase:round===3?'round3_done':'round'+round+'_done'},teams);
  assert.deepEqual(result.scores,scores);assert.equal(result.winner,'');assert.equal(result.final,false);assert.equal(result.title,'Підсумок раунду '+round);
 }
 const result=teamResult({current_round:3,status:'finished',phase:'finished'},teams);
 assert.deepEqual(result.scores,[8,13]);assert.equal(result.winner,'Перемогли: B!');assert.equal(result.title,'Загальний рахунок');
});

test('round three uses a dedicated large-association screen without timer or scores',()=>{
 const state=teamScreenState({status:'playing',current_round:3,phase:'round3_play'},false,false);
 assert.equal(state.mode,'associations');assert.equal(state.word,true);assert.equal(state.timer,false);assert.equal(state.results,false);
});
