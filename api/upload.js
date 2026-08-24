import { v2 as cloudinary } from 'cloudinary';

function readBody(req){
  if(req.body && typeof req.body === 'object') return req.body;
  try{return JSON.parse(req.body || '{}')}catch{return {}}
}

export default async function handler(req,res){
  if(req.method !== 'POST') return res.status(405).json({error:'Method not allowed'});
  if(!process.env.CLOUDINARY_URL) return res.status(500).json({error:'CLOUDINARY_URL is required'});
  const {file,folder='uploads'}=readBody(req);
  if(!String(file || '').startsWith('data:image/')) return res.status(400).json({error:'Image is required'});
  if(String(file).length > 8_000_000) return res.status(413).json({error:'Image is too large'});
  try{
    const result=await cloudinary.uploader.upload(file,{folder:`variants-game/${String(folder).replace(/[^a-z0-9_-]/gi,'-')}`,resource_type:'image'});
    return res.status(200).json({url:result.secure_url});
  }catch(error){return res.status(400).json({error:error.message || 'Upload failed'})}
}
