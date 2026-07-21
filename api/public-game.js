import { createClient } from '@supabase/supabase-js';

function normalizeInviteCode(value){
  return String(value || '').trim().replace(/[^a-z0-9]/gi,'').toUpperCase();
}

function getSupabaseAdmin(){
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if(!url || !key){
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
  }

  return createClient(url,key,{auth:{persistSession:false}});
}

export default async function handler(req,res){
  if(req.method !== 'GET') return res.status(405).json({error:'Method not allowed'});

  const code = normalizeInviteCode(req.query?.code);
  if(!code) return res.status(400).json({error:'Game code is required'});

  try{
    const supabase = getSupabaseAdmin();
    const {data,error} = await supabase
      .from('games')
      .select('*')
      .eq('invite_code',code)
      .maybeSingle();

    if(error) return res.status(400).json({error:error.message});
    if(!data) return res.status(404).json({error:'Game not found'});

    return res.status(200).json({data});
  }catch(error){
    return res.status(500).json({error:error.message || 'Server error'});
  }
}
