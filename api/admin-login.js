import crypto from 'crypto';

const COOKIE_NAME = 'variants_admin_session';
const SESSION_TTL_SECONDS = 60 * 60 * 8;

function getSecret(){
  return process.env.ADMIN_SESSION_SECRET || process.env.ADMIN_PASSWORD || '';
}

function sign(value){
  return crypto.createHmac('sha256', getSecret()).update(value).digest('base64url');
}

function makeToken(){
  const payload = Buffer.from(JSON.stringify({
    role: 'admin',
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS
  })).toString('base64url');

  return `${payload}.${sign(payload)}`;
}

function readBody(req){
  if(req.body && typeof req.body === 'object') return req.body;
  if(typeof req.body === 'string'){
    try{return JSON.parse(req.body)}catch{return {}}
  }
  return {};
}

export default function handler(req,res){
  if(req.method !== 'POST'){
    return res.status(405).json({ok:false});
  }

  const adminPassword = process.env.ADMIN_PASSWORD;
  if(!adminPassword){
    return res.status(500).json({ok:false,message:'ADMIN_PASSWORD is not configured'});
  }

  const {password} = readBody(req);
  if(password !== adminPassword){
    return res.status(401).json({ok:false});
  }

  const token = makeToken();
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${SESSION_TTL_SECONDS}`);
  return res.status(200).json({ok:true});
}
