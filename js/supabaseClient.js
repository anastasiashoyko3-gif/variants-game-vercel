class GameQuery {
  constructor(table){this.payload={table,filters:[],columns:'*'}}
  select(columns='*'){this.payload.operation=this.payload.operation||'select';this.payload.columns=columns;return this}
  insert(values){this.payload.operation='insert';this.payload.values=values;return this}
  update(values){this.payload.operation='update';this.payload.values=values;return this}
  upsert(values,options={}){this.payload.operation='upsert';this.payload.values=values;this.payload.upsertOptions=options;return this}
  eq(column,value){this.payload.filters.push({type:'eq',column,value});return this}
  ilike(column,value){this.payload.filters.push({type:'ilike',column,value});return this}
  order(column,options={}){this.payload.order={column,ascending:options.ascending!==false};return this}
  single(){this.payload.single=true;return this.execute()}
  maybeSingle(){this.payload.maybeSingle=true;return this.execute()}
  async execute(){
    try{
      const res=await fetch('/api/game-db',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(this.payload)});
      const json=await res.json().catch(()=>({}));
      return res.ok?{data:json.data,error:null}:{data:null,error:{message:json.error||'Database error'}};
    }catch(error){return {data:null,error:{message:error.message||'Network error'}}}
  }
  then(resolve,reject){return this.execute().then(resolve,reject)}
}

const emptyChannel={on(){return this},subscribe(callback){callback?.('POLLING');return this}};
export const supabase={
  from(table){return new GameQuery(table)},
  channel(){return Object.create(emptyChannel)},
  removeChannel(){}
};
export const TOTAL_QUESTIONS = 17;
export const ANSWER_SECONDS = 60;
export const VOTE_SECONDS = 45;

export function makeCode(){const chars='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';let out='';for(let i=0;i<8;i++)out+=chars[Math.floor(Math.random()*chars.length)];return out;}
export function roundNo(i){if(i<6)return 1;if(i<12)return 2;return 3;}
export function nowSec(){return Math.floor(Date.now()/1000);}
export function shuffle(arr){return [...arr].sort(()=>Math.random()-0.5);}
export function safeJson(value,fallback=[]){if(!value)return fallback;if(Array.isArray(value))return value;try{return JSON.parse(value)}catch{return fallback}}
export function escapeHtml(text){return String(text??'').replace(/[&<>'"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','"':'&quot;'}[m]));}
export function avatarHtml(person,size=''){const avatar=(person&&person.avatar)||'';const cls=`avatar ${size}`.trim();if(avatar.startsWith('http'))return `<span class="${cls}" style="background-image:url('${escapeHtml(avatar)}')"></span>`;return `<span class="${cls}">${escapeHtml(avatar||((person&&person.name)||'?')[0])}</span>`;}
export function hostAvatarHtml(game,size=''){return avatarHtml({name:'Ведуча',avatar:(game&&game.host_avatar)||'👑'},size);}
export async function uploadPublicFile(file,folder='uploads'){
  if(!file)return '';
  const dataUrl=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(new Error('Не вдалося прочитати файл'));reader.readAsDataURL(file)});
  const res=await fetch('/api/upload',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({file:dataUrl,folder})});
  const json=await res.json().catch(()=>({}));
  if(!res.ok)throw new Error(json.error||'Не вдалося завантажити фото');
  return json.url;
}
