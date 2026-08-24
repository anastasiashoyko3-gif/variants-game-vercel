import { runQuery } from './_db.js';

const READ_TABLES=new Set(['games','questions','players','answers','votes','points','word_events']);
const WRITE_TABLES=new Set(['players','answers','votes','word_events']);

function readBody(req){
  if(req.body && typeof req.body === 'object') return req.body;
  try{return JSON.parse(req.body || '{}')}catch{return {}}
}

export default async function handler(req,res){
  if(req.method !== 'POST') return res.status(405).json({error:'Method not allowed'});
  const payload=readBody(req);
  const allowed=payload.operation === 'select' ? READ_TABLES : WRITE_TABLES;
  if(!allowed.has(payload.table)) return res.status(403).json({error:'Operation is not allowed'});
  try{return res.status(200).json({data:await runQuery(payload)})}
  catch(error){return res.status(400).json({error:error.message || 'Database error'})}
}
