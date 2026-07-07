const COOKIE_NAME = 'variants_admin_session';

export default function handler(req,res){
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`);
  return res.status(200).json({ok:true});
}
