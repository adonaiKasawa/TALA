import 'dotenv/config';
import { before, beforeEach, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { generateKeyPair, exportJWK, SignJWT } from 'jose';
const require = createRequire(import.meta.url);
const { createApiApp } = require('../dist/app.factory.js');
const { Database } = require('../dist/database/database.service.js');
if (process.env.NODE_ENV === 'production' || !['localhost','127.0.0.1'].includes(new URL(process.env.DATABASE_URL).hostname)) throw new Error('Tests réservés à PostgreSQL local.');
const fixture = 'feed_' + randomBytes(5).toString('hex');
let app, db, server, base, issuer, a, b, c, pa, pb, pc, first, second;
const keys = ['read','write','watch'].map(k=>createHash('sha256').update(`test:${k}:127.0.0.1`).digest('hex'));
async function api(path, method='GET', body, token=b) {
  return fetch(base+path,{method,headers:{...(token?{authorization:'Bearer '+token}:{}),...(body!==undefined?{'content-type':'application/json'}:{})},body:body===undefined?undefined:JSON.stringify(body)});
}
before(async()=>{
  process.env.NODE_ENV='test';process.env.MEDIA_ENABLED='true';process.env.MEDIA_DRIVER='local';process.env.MEDIA_QUEUE_DRIVER='postgres';
  const pair=await generateKeyPair('RS256');const jwk={...await exportJWK(pair.publicKey),kid:fixture,alg:'RS256',use:'sig'};
  server=createServer((req,res)=>{res.setHeader('content-type','application/json');res.end(JSON.stringify({keys:[jwk]}));});await new Promise(r=>server.listen(0,'127.0.0.1',r));
  issuer=process.env.OIDC_ISSUER=`http://127.0.0.1:${server.address().port}`;
  const token=s=>new SignJWT({client_id:fixture,scope:'tala.api',sid:fixture,gid:fixture}).setProtectedHeader({alg:'RS256',typ:'at+jwt',kid:fixture}).setIssuer(issuer).setSubject(s).setAudience('urn:tala:api').setIssuedAt().setExpirationTime('20m').sign(pair.privateKey);
  [a,b,c]=await Promise.all([token('a'),token('b'),token('c')]);
  app=await createApiApp();await app.listen(0,'127.0.0.1');base=await app.getUrl()+'/api/v1';db=app.get(Database);
  [pa,pb,pc]=await Promise.all(['a','b','c'].map(s=>db.profile.create({data:{issuer,subject:s,username:fixture+s,displayName:'Créateur '+s}})));
  const video=(title,publishedAt,extra={})=>db.video.create({data:{issuer,subject:'a',profileId:pa.id,title,description:'#Kinshasa',hashtags:['kinshasa'],kind:'short',driver:'local',status:'published',visibility:'public',expectedBytes:100,duration:20,publishedAt,expiresAt:new Date(Date.now()+86400000),...extra}});
  first=await video('Premier',new Date('2026-01-02'));
  second=await video('Second',new Date('2026-01-01'));
  await video('Privé',new Date(),{visibility:'private'});await video('Non répertorié',new Date(),{visibility:'unlisted'});await video('Brouillon',new Date(),{status:'draft'});
});
beforeEach(async()=>{await db.rateBucket.deleteMany({where:{key:{in:keys}}});});
after(async()=>{if(db){await db.video.deleteMany({where:{issuer}});await db.profile.deleteMany({where:{issuer}});await db.rateBucket.deleteMany({where:{key:{in:keys}}});}await app?.close();if(server){server.closeAllConnections();await new Promise(r=>server.close(r));}});
test('Feed : droits, curseur stable, filtres et absence de données privées',async()=>{
  const query=`/feed?creator=${pa.username}&limit=1&tag=kinshasa`;
  let r=await api(query,'GET',undefined,null);assert.equal(r.status,200);let page=await r.json();assert.equal(page.items[0].id,first.id);assert.ok(page.nextCursor);assert.equal(page.items[0].creator.subject,undefined);
  r=await api(query+'&cursor='+encodeURIComponent(page.nextCursor));page=await r.json();assert.equal(page.items[0].id,second.id);assert.equal(page.nextCursor,null);
  assert.equal((await api('/feed?cursor=bad')).status,400);
  assert.equal((await api('/feed?mode=following','GET',undefined,null)).status,401);
  await db.profile.update({where:{id:pa.id},data:{isPrivate:true}});assert.equal((await (await api(query)).json()).items.length,0);await db.profile.update({where:{id:pa.id},data:{isPrivate:false}});
});
test('Likes, favoris et Pas intéressé sont idempotents et personnels',async()=>{
  for(let i=0;i<2;i++)assert.equal((await api(`/videos/${first.id}/reactions/like`,'PUT')).status,200);
  let s=await (await api(`/videos/${first.id}/social`)).json();assert.equal(s.likes,1);assert.equal(s.liked,true);
  assert.equal((await api(`/videos/${first.id}/reactions/save`,'PUT')).status,200);
  assert.equal((await (await api('/feed?mode=saved')).json()).items.some(v=>v.id===first.id),true);
  assert.equal((await (await api('/feed?mode=saved','GET',undefined,c)).json()).items.length,0);
  await api(`/videos/${first.id}/reactions/not_interested`,'PUT');assert.equal((await (await api(`/feed?creator=${pa.username}`)).json()).items.some(v=>v.id===first.id),false);
  await api(`/videos/${first.id}/reactions/not_interested`,'DELETE');await api(`/videos/${first.id}/reactions/like`,'DELETE');
  assert.equal((await (await api(`/videos/${first.id}/social`)).json()).likes,0);
});
test('Abonnements, sourdine, blocage réciproque et restauration',async()=>{
  const path=`/creators/${pa.username}/relations/`;
  await api(path+'follow','PUT');assert.equal((await (await api('/feed?mode=following')).json()).items.length,2);
  await api(path+'mute','PUT');assert.equal((await (await api('/feed?mode=following')).json()).items.length,0);await api(path+'mute','DELETE');
  await api(path+'block','PUT');assert.equal((await api(`/videos/${first.id}/playback`)).status,404);assert.equal((await api(`/videos/${first.id}/social`)).status,404);
  assert.equal(await db.creatorRelation.count({where:{fromId:pb.id,toId:pa.id,kind:'follow'}}),0);
  assert.equal((await api(`/creators/${pb.username}/relations/follow`,'PUT',undefined,a)).status,404);
  await api(path+'block','DELETE');assert.equal((await api(`/videos/${first.id}/social`)).status,200);
});
test('Commentaires, réponses, droits de suppression et restriction',async()=>{
  let r=await api(`/videos/${first.id}/comments`,'POST',{text:'Bonjour <script>texte</script>'});assert.equal(r.status,201);const parent=(await r.json()).id;
  r=await api(`/videos/${first.id}/comments`,'POST',{text:'Une réponse',parentId:parent},c);const reply=(await r.json()).id;
  assert.equal((await api(`/videos/${second.id}/comments`,'POST',{text:'Mauvaise vidéo',parentId:parent})).status,400);
  assert.equal((await api(`/videos/${first.id}/comments`,'POST',{text:'Trop profond',parentId:reply})).status,400);
  assert.equal((await api(`/videos/${first.id}/comments/${parent}`,'DELETE',undefined,c)).status,404);
  await api(`/creators/${pb.username}/relations/restrict`,'PUT',undefined,a);
  assert.equal((await (await api(`/videos/${first.id}/comments`,'GET',undefined,c)).json()).items.some(x=>x.id===parent),false);
  assert.equal((await (await api(`/videos/${first.id}/comments`)).json()).items.some(x=>x.id===parent),true);
  await api(`/creators/${pb.username}/relations/restrict`,'DELETE',undefined,a);
  assert.equal((await api(`/videos/${first.id}/comments/${parent}`,'DELETE',undefined,a)).status,200);assert.equal(await db.videoComment.count({where:{id:reply}}),0);
});
test('Visionnage : impression idempotente, séquences, bornes et historique privé',async()=>{
  const id=randomUUID(), body={id,videoId:first.id,surface:'short'};
  assert.equal((await api('/watch/impressions','POST',body)).status,201);assert.equal((await api('/watch/impressions','POST',body)).status,201);
  assert.equal(await db.watchSession.count({where:{id}}),1);
  assert.equal((await api('/watch/impressions','POST',body,c)).status,404);
  const event={sequence:1,event:'progress',watchedMs:100,positionMs:100};
  assert.equal((await api('/watch/'+id,'PUT',event,c)).status,404);
  assert.equal((await (await api('/watch/'+id,'PUT',event)).json()).accepted,true);
  assert.equal((await (await api('/watch/'+id,'PUT',event)).json()).accepted,false);
  assert.equal(await db.watchEvent.count({where:{sessionId:id}}),1);
  assert.equal((await api('/watch/'+id,'PUT',{...event,sequence:2,watchedMs:100000})).status,400);
  assert.equal((await (await api('/me/history')).json()).items[0].videoId,first.id);assert.equal((await (await api('/me/history','GET',undefined,c)).json()).items.length,0);
  await api('/me/history','DELETE');assert.equal(await db.watchSession.count({where:{id}}),0);
  assert.equal(await db.watchEvent.count({where:{sessionId:id}}),0);
});
test('WebVTT : propriétaire, format, lecture signée et suppression',async()=>{
  const path=`/videos/${first.id}/captions/fr`,body={label:'Français',content:'WEBVTT\n\n00:00.000 --> 00:02.000\nBonjour TALA\n'};
  assert.equal((await api(path,'PUT',body)).status,404);assert.equal((await api(path,'PUT',{...body,content:'pas du VTT'},a)).status,400);
  assert.equal((await api(path,'PUT',body,a)).status,200);
  const playback=await (await api(`/videos/${first.id}/playback`)).json();assert.equal(playback.captions.length,1);
  const url=new URL(playback.captions[0].url);const track=await api(url.pathname.replace('/api/v1','')+url.search,'GET',undefined,null);assert.equal(track.status,200);assert.match(await track.text(),/Bonjour TALA/);
  assert.equal((await api(path+'?expires=1&signature=bad','GET',undefined,null)).status,404);
  assert.equal((await api(path,'DELETE',undefined,a)).status,200);
});
test('Formats, refus des curseurs croisés et restauration des vidéos masquées',async()=>{
  const long=await db.video.create({data:{...first,id:randomUUID(),muxAttempt:randomUUID(),kind:'long',title:'Longue',duration:600}});
  const shorts=await (await api(`/feed?creator=${pa.username}&limit=1`)).json();
  assert.ok(shorts.items.every(v=>v.kind==='short'));
  const longs=await (await api(`/feed?creator=${pa.username}&kind=long`)).json();assert.equal(longs.items[0].id,long.id);
  assert.equal((await api(`/feed?creator=${pa.username}&kind=long&cursor=${encodeURIComponent(shorts.nextCursor)}`)).status,400);
  await api(`/videos/${first.id}/reactions/not_interested`,'PUT');
  assert.ok((await (await api('/me/creator-controls')).json()).items.some(v=>v.videoId===first.id));
  await api(`/videos/${first.id}/reactions/not_interested`,'DELETE');
  assert.ok(!(await (await api('/me/creator-controls')).json()).items.some(v=>v.videoId===first.id));
});
test('Mesures cumulatives : complétion, relecture et déduplication du journal',async()=>{
  const beforeViews=(await db.video.findUnique({where:{id:first.id}})).viewCount;
  const id=randomUUID();await api('/watch/impressions','POST',{id,videoId:first.id,surface:'short'});
  await db.watchSession.update({where:{id},data:{createdAt:new Date(Date.now()-20000)}});
  assert.equal((await api('/watch/'+id,'PUT',{sequence:1,event:'complete',watchedMs:18000,positionMs:20000})).status,200);
  assert.equal((await api('/watch/'+id,'PUT',{sequence:2,event:'replay',watchedMs:18000,positionMs:0})).status,200);
  await api('/watch/'+id,'PUT',{sequence:2,event:'replay',watchedMs:18000,positionMs:0});
  const row=await db.watchSession.findUnique({where:{id}});assert.equal(row.completed,true);assert.equal(row.replayCount,1);assert.equal(await db.watchEvent.count({where:{sessionId:id}}),2);
  assert.equal((await db.video.findUnique({where:{id:first.id}})).viewCount,beforeViews+1);assert.equal(row.viewCounted,true);
  await api('/me/history','DELETE');assert.equal((await db.video.findUnique({where:{id:first.id}})).viewCount,beforeViews+1);
});
test('Suppression de profil et vidéo : purge des interactions, pistes et historique, même en concurrence',async()=>{
  await api(`/videos/${first.id}/reactions/like`,'PUT');await api(`/videos/${first.id}/comments`,'POST',{text:'À supprimer avec le profil'});
  assert.equal((await api('/me/profile','DELETE')).status,200);
  assert.equal(await db.videoReaction.count({where:{profileId:pb.id}}),0);assert.equal(await db.watchSession.count({where:{profileId:pb.id}}),0);
  const id=randomUUID();await api('/watch/impressions','POST',{id,videoId:first.id,surface:'short'},c);
  await api(`/videos/${first.id}/captions/fr`,'PUT',{label:'Français',content:'WEBVTT\n\n00:00.000 --> 00:01.000\nBonjour\n'},a);
  const results=await Promise.all([api(`/videos/${first.id}`,'DELETE',undefined,a),api(`/videos/${first.id}/reactions/like`,'PUT',undefined,c)]);
  assert.equal(results[0].status,200);assert.ok([200,404].includes(results[1].status));
  assert.equal(await db.videoReaction.count({where:{videoId:first.id}}),0);assert.equal(await db.videoCaption.count({where:{videoId:first.id}}),0);assert.equal(await db.watchSession.count({where:{videoId:first.id}}),0);
  assert.equal((await api(`/videos/${first.id}/playback`,'GET',undefined,c)).status,404);
});
