import { NextRequest } from 'next/server';
import { config } from '@/lib/config';
import { json,sessionRequest,upstream } from '@/lib/http';
export async function GET(req:NextRequest,ctx:{params:Promise<{id:string}>}){
  const {id}=await ctx.params;if(!/^[a-f0-9-]{36}$/i.test(id))return json({message:'Vidéo introuvable.'},404);
  if(req.cookies.get('tala_session')){
    const response=await sessionRequest(req,async session=>{const result=await upstream(session,'api',`/videos/${id}/playback`);return json(result.data,result.status);});
    if(response.status!==401)return response;
  }
  try{const response=await fetch(config().api+`/api/v1/videos/${id}/playback`,{cache:'no-store',redirect:'error',signal:AbortSignal.timeout(10000)});return json(await response.json(),response.status);}
  catch{return json({message:'Lecture temporairement indisponible.'},503);}
}
