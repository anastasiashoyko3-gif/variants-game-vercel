import { getDb } from './_db.js';

function normalizeInviteCode(value){
  return String(value || '').trim().replace(/[^a-z0-9]/gi,'').toUpperCase();
}

export default async function handler(req,res){
  if(req.method !== 'GET') return res.status(405).json({error:'Method not allowed'});

  const code = normalizeInviteCode(req.query?.code);
  if(!code) return res.status(400).json({error:'Game code is required'});

  try{
    const db=getDb();
    const exact=await db`SELECT * FROM games WHERE invite_code ILIKE ${code} ORDER BY id DESC LIMIT 1`;
    if(exact[0]) return res.status(200).json({data:exact[0]});
    const all=await db`SELECT * FROM games ORDER BY id DESC`;
    const match = all.find(game=>normalizeInviteCode(game.invite_code) === code);
    if(match) return res.status(200).json({data:match});

    return res.status(404).json({
      error:'Game not found',
      code,
      visibleGames:all.length,
      latestCodes:all.slice(0,5).map(game=>normalizeInviteCode(game.invite_code))
    });
  }catch(error){
    return res.status(500).json({error:error.message || 'Server error'});
  }
}
