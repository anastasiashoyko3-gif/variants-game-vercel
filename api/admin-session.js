import crypto from 'crypto';

const COOKIE_NAME = 'variants_admin_session';

function getSecret(){
  return process.env.ADMIN_SESSION_SECRET || process.env.ADMIN_PASSWORD || '';
}

function sign(value){
  return crypto.createHmac('sha256', getSecret()).update(value).digest('base64url');
}

function parseCookies(req){
  return Object.fromEntries(String(req.headers.cookie || '').split(';').map(part=>{
    const [key,...rest] = part.trim().split('=');
    return [key, rest.join('=')];
  }).filter(([key])=>key));
}

function isValidToken(token){
  if(!token || !getSecret()) return false;
  const [payload,signature] = token.split('.');
  if(!payload || !signature) return false;
  if(sign(payload) !== signature) return false;

  try{
    const data = JSON.parse(Buffer.from(payload,'base64url').toString('utf8'));
    return data.role === 'admin' && Number(data.exp || 0) > Math.floor(Date.now() / 1000);
  }catch{
    return false;
  }
}

export default function handler(req,res){
  const cookies = parseCookies(req);
  return res.status(200).json({ok:isValidToken(cookies[COOKIE_NAME])});
}
