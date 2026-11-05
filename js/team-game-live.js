import { teamScreenState } from './team-screen-state.js';
const $=id=>document.getElementById(id),params=new URLSearchParams(location.search),gameId=params.get('gameId'),code=params.get('code'),roleToken=params.get('roleToken');
let deadline=0,offset=0,freeze=0;
function show(id,on){$(id).classList.toggle('hidden',!on)}
function total(team){return Number(team.round1_score)+Number(team.round2_score)+Number(team.round3_score)}
function renderScores(teams,completedRounds){
 const head=document.createElement('tr');
 for(const label of ['Команда',...Array.from({length:completedRounds},(_,i)=>'Раунд '+(i+1)),'Разом']){
  const th=document.createElement('th');th.scope='col';th.textContent=label;head.append(th);
 }
 $('scoreHead').replaceChildren(head);
 $('scoreBody').replaceChildren();
 for(const team of teams){
  const row=document.createElement('tr'),name=document.createElement('th');name.scope='row';name.textContent=team.name;row.append(name);
  for(const score of [...Array.from({length:completedRounds},(_,i)=>Number(team['round'+(i+1)+'_score'])),total(team)]){
   const cell=document.createElement('td');cell.textContent=score;row.append(cell);
  }
  $('scoreBody').append(row);
 }
}
async function refresh(){
 if(!gameId||!code){$('error').textContent='Відкрий посилання, яке надала ведуча';return}
 try{
  const res=await fetch('/api/team-live?'+new URLSearchParams({gameId,code,...(roleToken?{roleToken}:{})}),{cache:'no-store'});
  const d=await res.json();if(!res.ok)throw Error(d.error||'Помилка');
  const g=d.game,t=d.teams,state=teamScreenState(g,!!roleToken,!!d.activeWord);
  offset=d.serverTime-Date.now();deadline=g.round_deadline?new Date(g.round_deadline).getTime():0;freeze=g.round_paused_seconds??0;
  $('stage').dataset.mode=state.mode;
  show('screenHeader',state.mode==='standard');
  show('roundContent',!state.results);
  show('results',state.results);
  $('title').textContent=g.title;
  $('round').textContent=g.current_round===1?'Раунд 1 · Асоціації':g.current_round===2?'Раунд 2 · Кодові імена':'Раунд 3';
  const active=t.find(x=>String(x.id)===String(g.active_team_id));
  $('status').textContent=g.status==='setup'?'Очікуємо початку гри':g.phase==='round3_wait_next'?'Правильно! Очікуємо наступний опис':active?'Зараз грає: '+active.name:'';
  show('status',state.mode==='standard');
  show('timer',state.timer);
  show('word',state.word);
  $('word').textContent=state.word?(g.current_round===1?d.activeWord:(d.prompt?.description||'')):'';
  $('focusNotice').textContent=state.notice;show('focusNotice',!!state.notice);
  show('board',state.board);
  $('board').replaceChildren();
  if(state.board)for(const card of d.cards){
   const cell=document.createElement('div');cell.className='boardCell';cell.textContent=card.word;
   cell.style.background=({blue:'#9cc7ff',red:'#ffacbd',neutral:'#e5e1d9',black:'#43404b'}[card.card_color]||'#f3e8ff');
   if(card.card_color==='black')cell.style.color='white';
   $('board').append(cell);
  }
  if(state.results){
   $('resultsTitle').textContent=g.status==='finished'?'Підсумки гри':'Раунд '+g.current_round+' завершено';
   renderScores(t,g.status==='finished'?3:g.current_round);
  }
  const a=total(t[0]),b=total(t[1]);
  $('winner').textContent=g.status==='finished'?(a===b?'Нічия!':'Перемогла '+(a>b?t[0].name:t[1].name)+'!'):'';
  tick();$('error').textContent='';
 }catch(e){$('error').textContent=e.message}
}
function tick(){const s=deadline?Math.max(0,Math.ceil((deadline-Date.now()-offset)/1000)):freeze;$('timer').textContent=String(Math.floor(s/60)).padStart(2,'0')+':'+String(s%60).padStart(2,'0')}
setInterval(tick,250);setInterval(refresh,1500);refresh();
