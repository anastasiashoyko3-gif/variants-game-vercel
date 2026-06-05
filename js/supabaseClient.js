import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) alert('Не знайдено VITE_SUPABASE_URL або VITE_SUPABASE_KEY у Vercel Environment Variables');

export const supabase = createClient(supabaseUrl, supabaseKey);
export const TOTAL_QUESTIONS = 17;
export const ANSWER_SECONDS = 60;
export const VOTE_SECONDS = 45;
export const PHOTO_BUCKET = 'game-photos';

export function makeCode(){const chars='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';let out='';for(let i=0;i<8;i++)out+=chars[Math.floor(Math.random()*chars.length)];return out;}
export function roundNo(i){if(i<6)return 1;if(i<12)return 2;return 3;}
export function nowSec(){return Math.floor(Date.now()/1000);}
export function shuffle(arr){return [...arr].sort(()=>Math.random()-0.5);}
export function safeJson(value,fallback=[]){if(!value)return fallback;if(Array.isArray(value))return value;try{return JSON.parse(value)}catch{return fallback}}
export function escapeHtml(text){return String(text??'').replace(/[&<>'"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','"':'&quot;'}[m]));}
export function avatarHtml(person,size=''){const avatar=(person&&person.avatar)||'';const cls=`avatar ${size}`.trim();if(avatar.startsWith('http'))return `<span class="${cls}" style="background-image:url('${escapeHtml(avatar)}')"></span>`;return `<span class="${cls}">${escapeHtml(avatar||((person&&person.name)||'?')[0])}</span>`;}
export function hostAvatarHtml(game,size=''){return avatarHtml({name:'Ведуча',avatar:(game&&game.host_avatar)||'👑'},size);}
export async function uploadPublicFile(file,folder='uploads'){if(!file)return '';const ext=(file.name.split('.').pop()||'jpg').replace(/[^a-z0-9]/gi,'');const filePath=`${folder}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;const {error}=await supabase.storage.from(PHOTO_BUCKET).upload(filePath,file,{cacheControl:'3600',upsert:true});if(error)throw error;const {data}=supabase.storage.from(PHOTO_BUCKET).getPublicUrl(filePath);return data.publicUrl;}
