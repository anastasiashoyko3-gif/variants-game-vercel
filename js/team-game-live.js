import { teamScreenState, teamResult } from './team-screen-state.js';
const $=id=>document.getElementById(id),params=new URLSearchParams(location.search),gameId=params.get('gameId'),code=params.get('code'),roleToken=params.get('roleToken');
let deadline=0,offset=0,freeze=0;
function show(id,on){$(id).classList.toggle('hidden',!on)}
function renderScores(game,teams){
 const result=teamResult(game,teams);
 $('resultsTitle').textContent=result.title;
 $('results').setAttribute('aria-label',result.title);
 for(let i=0;i<2;i++){
  $('resultTeam'+(i+1)).textContent=teams[i].name;
  $('resultScore'+(i+1)).textContent=result.scores[i];
 }
 $('scoreLine').setAttribute('aria-label',teams[0].name+' '+result.scores[0]+' : '+result.scores[1]+' '+teams[1].name);
 $('winner').textContent=result.winner;
}
async function refresh(){
 if(!gameId||!code){$('error').textContent='Відкрий посилання, яке надала ведуча';return}
 try{
  const res=await fetch('/api/team-live?'+new URLSearchParams({gameId,code,...(roleToken?{roleToken}:{})}),{cache:'no-store'});
  const d=await res.json();if(!res.ok)throw Error(d.error||'Помилка');
  const g=d.game,t=d.teams,state=teamScreenState(g,!!roleToken,!!d.activeWord);
  offset=d.serverTime-Date.now();deadline=g.round_deadline?new Date(g.round_deadline).getTime():0;freeze=g.round_paused_seconds??0;
  $('stage').dataset.mode=state.mode;
  show('screenHeader',state.mode==='standard'||state.mode==='associations');
  show('title',state.mode==='standard');
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
  if(state.results)renderScores(g,t);
  tick();$('error').textContent='';
 }catch(e){$('error').textContent=e.message}
}
function tick(){const s=deadline?Math.max(0,Math.ceil((deadline-Date.now()-offset)/1000)):freeze;$('timer').textContent=String(Math.floor(s/60)).padStart(2,'0')+':'+String(s%60).padStart(2,'0')}
setInterval(tick,250);setInterval(refresh,1500);refresh();
