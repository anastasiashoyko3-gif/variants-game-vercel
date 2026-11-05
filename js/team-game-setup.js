const $=id=>document.getElementById(id);
function message(text){$('message').textContent=text}
async function request(url,body){
 const res=await fetch(url,{method:body?'POST':'GET',headers:{'Content-Type':'application/json'},credentials:'same-origin',...(body?{body:JSON.stringify(body)}:{})});
 const data=await res.json().catch(()=>({}));
 if(!res.ok)throw new Error(data.error||data.message||'Помилка запиту');
 return data;
}
async function refresh(){
 const data=await request('/api/team-game-admin');
 $('login').classList.add('hidden');$('setup').classList.remove('hidden');
 $('games').replaceChildren();
 for(const game of data.games){
  const el=document.createElement('div');el.className='gameItem';
  el.textContent=game.title+' · код: '+game.invite_code+' · '+game.status;
  $('games').append(el);
 }
 if(!data.games.length)$('games').textContent='Ігор поки немає';
}
$('loginBtn').onclick=async()=>{
 try{
  const res=await fetch('/api/admin-login',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',body:JSON.stringify({password:$('password').value})});
  if(!res.ok)throw new Error('Неправильний пароль або помилка входу');
  $('password').value='';await refresh();message('Вхід успішний');
 }catch(e){message(e.message)}
};
$('create').onclick=async()=>{
 $('create').disabled=true;
 try{
  const teams=[1,2].map(i=>({name:$('team'+i).value.trim(),color:$('color'+i).value}));
  const data=await request('/api/team-game-admin',{action:'create',title:$('title').value,teams});
  message('Гру створено! Код: '+data.game.invite_code);
  await refresh();
 }catch(e){message(e.message)}finally{$('create').disabled=false}
};
$('refresh').onclick=()=>refresh().catch(e=>message(e.message));
refresh().catch(()=>{});
