const $=id=>document.getElementById(id),params=new URLSearchParams(location.search),gameId=params.get('gameId'),code=params.get('code'),roleToken=params.get('roleToken');let deadline=0,offset=0,freeze=0;
function show(id,on){$(id).style.display=on?(id==='board'?'grid':''):'none'}
async function refresh(){
 if(!gameId||!code){$('error').textContent='Відкрий посилання, яке надав ведучий';return}
 try{
  const res=await fetch('/api/team-live?'+new URLSearchParams({gameId,code,...(roleToken?{roleToken}:{})}),{cache:'no-store'});
  const d=await res.json();if(!res.ok)throw Error(d.error||'Помилка');
  const g=d.game,t=d.teams;
  offset=d.serverTime-Date.now();deadline=g.round_deadline?new Date(g.round_deadline).getTime():0;freeze=g.round_paused_seconds??0;
  $('title').textContent=g.title;
  $('score').textContent=t[0].name+'  '+(Number(t[0].round1_score)+Number(t[0].round2_score)+Number(t[0].round3_score))+' : '+(Number(t[1].round1_score)+Number(t[1].round2_score)+Number(t[1].round3_score))+'  '+t[1].name;
  $('round').textContent=g.status==='finished'?'Фінал':g.current_round===1?'Раунд 1 · Асоціації':g.current_round===2?'Раунд 2 · Кодові імена':'Раунд 3 · Смішні описи';
  const active=t.find(x=>String(x.id)===String(g.active_team_id));
  $('status').textContent=g.status==='setup'?'Очікуємо початку гри':g.phase==='round1_done'?'Перший раунд завершено':g.phase==='round2_done'?'Другий раунд завершено':g.phase==='round3_wait_next'?'Правильно! Очікуємо наступний опис':g.status==='finished'?'Гру завершено':active?'Зараз грає: '+active.name:'';
  show('timer',g.current_round===1&&g.status==='playing'&&!roleToken);
  show('word',g.status==='playing'&&((g.current_round===1&&!!roleToken)||(g.current_round===3)));
  $('word').textContent=g.current_round===1?(d.activeWord||''):g.current_round===3?(d.prompt?.description||''):'';
  show('board',g.current_round===2&&g.status==='playing');
  $('board').replaceChildren();
  if(g.current_round===2)for(const card of d.cards){
   const cell=document.createElement('div');cell.textContent=card.word;
   const colors={blue:'#9cc7ff',red:'#ffacbd',neutral:'#e5e1d9',black:'#43404b'};
   cell.style.cssText='padding:14px 3px;border-radius:12px;text-align:center;overflow-wrap:anywhere;font-weight:700;font-size:clamp(10px,1.6vw,18px);background:'+(card.card_color?colors[card.card_color]:'#f3e8ff')+';color:'+(card.card_color==='black'?'white':'#251b33');
   $('board').append(cell);
  }
  const a=Number(t[0].round1_score)+Number(t[0].round2_score)+Number(t[0].round3_score),b=Number(t[1].round1_score)+Number(t[1].round2_score)+Number(t[1].round3_score);
  $('winner').textContent=g.status==='finished'?(a===b?'Нічия!':'Перемогла '+(a>b?t[0].name:t[1].name)+'!'):'';
  $('error').textContent='';
 }catch(e){$('error').textContent=e.message}
}
function tick(){const s=deadline?Math.max(0,Math.ceil((deadline-Date.now()-offset)/1000)):freeze;$('timer').textContent=String(Math.floor(s/60)).padStart(2,'0')+':'+String(s%60).padStart(2,'0')}
setInterval(tick,250);setInterval(refresh,1500);refresh();
