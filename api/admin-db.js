import crypto from 'crypto';
import { runQuery } from './_db.js';

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
  if(!payload || !signature || sign(payload) !== signature) return false;

  try{
    const data = JSON.parse(Buffer.from(payload,'base64url').toString('utf8'));
    return data.role === 'admin' && Number(data.exp || 0) > Math.floor(Date.now() / 1000);
  }catch{
    return false;
  }
}

function readBody(req){
  if(req.body && typeof req.body === 'object') return req.body;
  if(typeof req.body === 'string'){
    try{return JSON.parse(req.body)}catch{return {}}
  }
  return {};
}

export default async function handler(req,res){
  if(req.method !== 'POST') return res.status(405).json({error:'Method not allowed'});

  const cookies = parseCookies(req);
  if(!isValidToken(cookies[COOKIE_NAME])) return res.status(401).json({error:'Admin session required'});

  const body = readBody(req);
  try{
    return res.status(200).json({data:await runQuery(body)});
  }catch(error){
    return res.status(500).json({error:error.message || 'Server error'});
  }
}
