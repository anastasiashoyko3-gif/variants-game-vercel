import handler from './team-game-admin.js';
export default function restart(req,res){
 if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
 let body;try{body=typeof req.body==='object'?req.body:JSON.parse(req.body||'{}')}catch{return res.status(400).json({error:'Невірні дані'})}
 req.body={...body,action:'restart'};
 return handler(req,res);
}
