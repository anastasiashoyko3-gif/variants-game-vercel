import crypto from 'crypto';
const COOKIE='variants_admin_session';
export function isTeamAdmin(req){
  const secret=process.env.ADMIN_SESSION_SECRET || process.env.ADMIN_PASSWORD;
  if(!secret)return false;
  const cookies=String(req.headers.cookie||'').split(';').map(s=>s.trim());
  const raw=cookies.find(s=>s.startsWith(COOKIE+'='));
  if(!raw)return false;
  const [payload,signature]=raw.slice(COOKIE.length+1).split('.');
  if(!payload||!signature)return false;
  const expected=crypto.createHmac('sha256',secret).update(payload).digest('base64url');
  const a=Buffer.from(signature),b=Buffer.from(expected);
  if(a.length!==b.length||!crypto.timingSafeEqual(a,b))return false;
  try{
    const data=JSON.parse(Buffer.from(payload,'base64url').toString('utf8'));
    return data.role==='admin' && Number(data.exp)>Date.now()/1000;
  }catch{return false}
}
