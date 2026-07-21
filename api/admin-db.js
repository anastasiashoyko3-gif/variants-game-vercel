import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

const COOKIE_NAME = 'variants_admin_session';
const ALLOWED_TABLES = new Set([
  'games',
  'questions',
  'players',
  'answers',
  'votes',
  'points',
  'question_sets',
  'word_events'
]);

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

function getSupabaseAdmin(){
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if(!url || !key){
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
  }

  return createClient(url,key,{auth:{persistSession:false}});
}

function applyFilters(query,filters=[]){
  for(const filter of filters){
    if(filter.type === 'eq') query = query.eq(filter.column,filter.value);
    if(filter.type === 'ilike') query = query.ilike(filter.column,filter.value);
  }
  return query;
}

export default async function handler(req,res){
  if(req.method !== 'POST') return res.status(405).json({error:'Method not allowed'});

  const cookies = parseCookies(req);
  if(!isValidToken(cookies[COOKIE_NAME])) return res.status(401).json({error:'Admin session required'});

  const body = readBody(req);
  const {table,operation,columns='*',values,filters=[],order,single,maybeSingle,upsertOptions} = body;

  if(!ALLOWED_TABLES.has(table)) return res.status(400).json({error:'Table is not allowed'});

  try{
    const supabase = getSupabaseAdmin();
    let query;

    if(operation === 'select') query = supabase.from(table).select(columns);
    else if(operation === 'insert') query = supabase.from(table).insert(values);
    else if(operation === 'update') query = supabase.from(table).update(values);
    else if(operation === 'delete') query = supabase.from(table).delete();
    else if(operation === 'upsert') query = supabase.from(table).upsert(values,upsertOptions || {});
    else return res.status(400).json({error:'Operation is not allowed'});

    if(operation !== 'select' && columns) query = query.select(columns);
    query = applyFilters(query,filters);
    if(order?.column) query = query.order(order.column,{ascending:order.ascending !== false});
    if(single) query = query.single();
    if(maybeSingle) query = query.maybeSingle();

    const {data,error} = await query;
    if(error) return res.status(400).json({error:error.message});
    return res.status(200).json({data});
  }catch(error){
    return res.status(500).json({error:error.message || 'Server error'});
  }
}
