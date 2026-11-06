import 'dotenv/config';
import {before, beforeEach, after, test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {randomBytes,randomUUID,createHmac,createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {generateKeyPair,exportJWK,SignJWT} from 'jose';
const require=createRequire(import.meta.url);
const {createApiApp}=require('../dist/app.factory.js');
const {IdentitySyncService}=require('../dist/auth/identity-sync.service.js');
const {Database}=require('../dist/database/database.service.js');
if(process.env.NODE_ENV==='production'||!['localhost','127.0.0.1'].includes(new URL(process.env.DATABASE_URL).hostname))throw Error('Tests locaux uniquement');
let app,db,server,issuer,base,pair,jwk,owner,viewer,other,admin,noMfa,privateVideo,publicVideo;
const fixture='community_'+randomBytes(5).toString('hex'),states=new Map(),events=[];
let failEvents=false;
const syncKey=randomBytes(32).toString('hex');
const rateKeys=['read','write','upload','watch'].map(k=>createHash('sha256').update(`test:${k}:127.0.0.1`).digest('hex'));
async function actor(role='viewer',mfa=false){const subject=randomUUID();states.set(subject,{active:true,role});const token=await new SignJWT({client_id:fixture,scope:'tala.api',sid:fixture,gid:fixture,role,amr:mfa?['pwd','otp']:['pwd'],auth_time:Math.floor(Date.now()/1000)}).setProtectedHeader({alg:'RS256',typ:'at+jwt',kid:fixture}).setIssuer(issuer).setSubject(subject).setAudience('urn:tala:api').setIssuedAt().setExpirationTime('15m').sign(pair.privateKey);return{subject,token};}
const api=(path,method='GET',body,who=viewer)=>fetch(base+path,{method,headers:{...(who?{authorization:'Bearer '+who.token}:{}),...(body===undefined?{}:{'content-type':'application/json'})},body:body===undefined?undefined:JSON.stringify(body)});
async function profile(who,isPrivate=false){who.profile=await db.profile.create({data:{issuer,subject:who.subject,username:'qa_'+randomBytes(8).toString('hex'),displayName:'TALA QA',isPrivate,interests:['musique'],languages:['fr'],country:'CD'}});}
async function video(who,extra={}){return db.video.create({data:{issuer,subject:who.subject,profileId:who.profile.id,title:'Musique Kinshasa',description:'#musique',hashtags:['musique'],language:'fr',category:'musique',country:'CD',kind:'short',status:'published',visibility:'public',driver:'local',expectedBytes:1024,uploadedBytes:1024,duration:10,expiresAt:new Date(Date.now()+86400000),publishedAt:new Date(),...extra}});}
before(async()=>{
  process.env.NODE_ENV='test';process.env.MEDIA_ENABLED='true';process.env.MEDIA_DRIVER='local';process.env.MEDIA_QUEUE_DRIVER='postgres';process.env.MEDIA_ROOT=resolve('.local',fixture);process.env.IDENTITY_SYNC_KEY=syncKey;
  pair=await generateKeyPair('RS256');jwk={...await exportJWK(pair.publicKey),kid:fixture,alg:'RS256',use:'sig'};
  server=createServer((req,res)=>{res.setHeader('content-type','application/json');if(req.url==='/jwks'){res.end(JSON.stringify({keys:[jwk]}));return;}
    const expected=createHmac('sha256',Buffer.from(syncKey,'hex')).update(`GET\n${req.url}\n${req.headers['x-tala-time']}\n{}`).digest('hex');
    if(req.headers['x-tala-signature']!==expected){res.writeHead(401).end('{}');return;}
    const url=new URL(req.url,'http://localhost');
    if(url.pathname==='/internal/identity-events'){if(failEvents){res.writeHead(503).end('{}');return;}res.end(JSON.stringify(events.filter(e=>BigInt(e.sequence)>BigInt(url.searchParams.get('after')||'0'))));return;}
    const subject=decodeURIComponent(url.pathname.split('/').at(-1));res.end(JSON.stringify(states.get(subject)||{active:false,role:'viewer'}));
  });await new Promise(r=>server.listen(0,'127.0.0.1',r));issuer=process.env.OIDC_ISSUER=`http://127.0.0.1:${server.address().port}`;
  [owner,viewer,other,admin,noMfa]=await Promise.all([actor('creator'),actor(),actor('creator'),actor('admin',true),actor('moderator')]);
  app=await createApiApp();await app.listen(0,'127.0.0.1');db=app.get(Database);base=await app.getUrl()+'/api/v1';
  for(const a of [owner,viewer,other,admin,noMfa])await profile(a,a===owner);
  privateVideo=await video(owner);publicVideo=await video(other);
});
beforeEach(async()=>db.rateBucket.deleteMany({where:{key:{in:rateKeys}}}));
after(async()=>{await app?.close();server?.closeAllConnections();if(server)await new Promise(r=>server.close(r));delete process.env.IDENTITY_SYNC_KEY;});

test('Rôles : spectateur interdit à l’import, créateur autorisé, rôle relu côté identité',async()=>{
  assert.equal((await api('/videos','POST',{title:'QA',size:1024})).status,403);
  assert.equal((await api('/videos','POST',{title:'QA',size:1024},other)).status,201);
  states.get(admin.subject).role='viewer';assert.equal((await api('/moderation/verifications','GET',undefined,admin)).status,403);states.get(admin.subject).role='admin';
  assert.equal((await api('/moderation/verifications','GET',undefined,noMfa)).status,403);
});
test('Compte privé : demande, approbation propriétaire, accès puis révocation',async()=>{
  assert.equal((await api(`/videos/${privateVideo.id}/playback`)).status,404);
  let r=await api(`/creators/${owner.profile.username}/relations/follow`,'PUT');assert.equal(r.status,200);assert.equal((await r.json()).pending,true);
  assert.equal((await api(`/videos/${privateVideo.id}/playback`)).status,404);
  assert.equal((await api(`/me/follow-requests/${viewer.profile.id}`,'PUT',{accept:true},other)).status,404);
  const list=await(await api('/me/follow-requests','GET',undefined,owner)).json();assert.equal(list[0].from.id,viewer.profile.id);
  assert.equal((await api(`/me/follow-requests/${viewer.profile.id}`,'PUT',{accept:true},owner)).status,200);
  assert.equal((await api(`/videos/${privateVideo.id}/playback`)).status,200);
  const privateComment=await(await api(`/videos/${privateVideo.id}/comments`,'POST',{text:'Commentaire privé'},owner)).json();assert.equal((await api(`/videos/${privateVideo.id}/comments`,'POST',{text:'Réponse autorisée',parentId:privateComment.id})).status,201);
  assert.ok((await(await api('/feed?mode=following')).json()).items.some(v=>v.id===privateVideo.id));
  await api(`/me/followers/${viewer.profile.id}`,'DELETE',undefined,owner);
  assert.equal((await api(`/videos/${privateVideo.id}/playback`)).status,404);
  await api(`/creators/${owner.profile.username}/relations/follow`,'PUT');await api(`/creators/${owner.profile.username}/relations/follow`,'DELETE');
  assert.equal(await db.creatorRelation.count({where:{fromId:viewer.profile.id,toId:owner.profile.id}}),0);
});
test('Épingles et republications : propriétaire, attribution et confidentialité',async()=>{
  assert.equal((await api(`/videos/${publicVideo.id}/pin`,'PUT',{rank:1})).status,404);
  assert.equal((await api(`/videos/${publicVideo.id}/pin`,'PUT',{rank:1},other)).status,200);
  assert.equal((await(await api(`/profiles/${other.profile.username}/pinned`)).json()).items[0].id,publicVideo.id);
  assert.equal((await api(`/videos/${publicVideo.id}/repost`,'PUT')).status,200);
  const reposts=await(await api(`/profiles/${viewer.profile.username}/reposts`)).json();assert.equal(reposts.items[0].creator.username,other.profile.username);
  await db.profile.update({where:{id:other.profile.id},data:{isPrivate:true}});
  assert.equal((await(await api(`/profiles/${viewer.profile.username}/reposts`)).json()).items.length,0);
  await db.profile.update({where:{id:other.profile.id},data:{isPrivate:false}});
});
test('Collections : aucune consultation croisée et ajouts concurrents idempotents',async()=>{
  const r=await api('/me/collections','POST',{name:'À revoir'});assert.equal(r.status,201);const col=await r.json();
  assert.equal((await api('/me/collections/'+col.id,'GET',undefined,other)).status,404);
  await Promise.all([api(`/me/collections/${col.id}/videos/${publicVideo.id}`,'PUT'),api(`/me/collections/${col.id}/videos/${publicVideo.id}`,'PUT')]);
  assert.equal((await(await api('/me/collections/'+col.id)).json()).items.length,1);
  assert.equal((await api('/me/collections/'+col.id,'PATCH',{name:'Mes idées'})).status,200);assert.equal((await(await api('/me/collections/'+col.id)).json()).name,'Mes idées');
  await api('/me/collections/'+col.id,'DELETE');assert.equal((await api('/me/collections/'+col.id)).status,404);
});
test('Commentaires : likes idempotents, épingle réservée et réponse vidéo propriétaire',async()=>{
  const r=await api(`/videos/${publicVideo.id}/comments`,'POST',{text:'Question QA'});const c=await r.json();assert.equal(r.status,201);
  await api(`/comments/${c.id}/like`,'PUT');await api(`/comments/${c.id}/like`,'PUT');assert.equal(await db.commentLike.count({where:{commentId:c.id}}),1);
  assert.equal((await api(`/comments/${c.id}/pin`,'PUT')).status,404);
  assert.equal((await api(`/comments/${c.id}/pin`,'PUT',undefined,other)).status,200);
  assert.equal((await api(`/comments/${c.id}/video-reply`,'PUT',{videoId:privateVideo.id},other)).status,404);
  assert.equal((await api(`/comments/${c.id}/video-reply`,'PUT',{videoId:publicVideo.id},other)).status,200);
  assert.equal((await db.video.findUnique({where:{id:publicVideo.id}})).replyToCommentId,c.id);
  const context=await(await api(`/videos/${publicVideo.id}/reply-context`)).json();assert.equal(context.commentId,c.id);
  const comments=await(await api(`/videos/${publicVideo.id}/comments`)).json();assert.equal(comments.items[0].likes,1);assert.equal(comments.items[0].liked,true);assert.equal(comments.items[0].pinned,true);
});
test('Téléchargements : refus par défaut, autorisation propriétaire et droits de lecture',async()=>{
  assert.equal((await api(`/videos/${publicVideo.id}/download`)).status,403);
  assert.equal((await api(`/videos/${publicVideo.id}`,'PATCH',{allowDownload:true},other)).status,200);
  const unchanged=await db.video.findUnique({where:{id:publicVideo.id}});assert.equal(unchanged.visibility,'public');assert.equal(unchanged.language,'fr');assert.equal(unchanged.category,'musique');
  const r=await api(`/videos/${publicVideo.id}/download`);assert.equal(r.status,200);assert.equal((await r.json()).type,'mp4');
  await db.profile.update({where:{id:other.profile.id},data:{isPrivate:true}});assert.equal((await api(`/videos/${publicVideo.id}/download`)).status,404);await db.profile.update({where:{id:other.profile.id},data:{isPrivate:false}});
});
test('Badge : file privée, MFA administrative, décision auditée et non rejouable',async()=>{
  const r=await api('/me/verification','POST',{reason:'Créateur QA avec une présence publique vérifiable.'},other);assert.equal(r.status,201);const request=await r.json();
  assert.equal((await api('/moderation/verifications')).status,403);
  assert.equal((await api('/moderation/verifications/'+request.id,'PUT',{approved:true,reason:'Vérifié'},noMfa)).status,403);
  assert.equal((await api('/moderation/verifications/'+request.id,'PUT',{approved:true,reason:'Vérifié'},admin)).status,200);
  assert.equal((await api('/moderation/verifications/'+request.id,'PUT',{approved:false,reason:'Rejoué'},admin)).status,409);
  assert.equal((await(await api('/profiles/'+other.profile.username)).json()).verified,true);
  assert.equal((await api(`/moderation/profiles/${other.profile.id}/verification`,'DELETE',{reason:'Test de révocation'},admin)).status,200);
  assert.equal((await(await api('/profiles/'+other.profile.username)).json()).verified,false);
});
test('Recherche et suggestions : filtres publics, pas de profil privé ni identité interne',async()=>{
  const r=await api('/search?q=musique','GET',undefined,null);assert.equal(r.status,200);const page=await r.json();assert.ok(page.videos.some(v=>v.id===publicVideo.id));assert.ok(!page.videos.some(v=>v.id===privateVideo.id));assert.ok(page.hashtags.includes('musique'));
  const suggestions=await(await api('/me/creator-suggestions')).json();assert.ok(suggestions.items.some(p=>p.username===other.profile.username));assert.ok(!JSON.stringify(suggestions).includes(other.subject));
});
test('Pour toi : préférences, pagination liée au spectateur, remise à zéro et filtrage tardif',async()=>{
  for(let i=0;i<4;i++)await video(other,{title:'Découverte '+i});
  const r=await api('/discover?limit=1&category=musique&language=fr&country=CD');assert.equal(r.status,200);const page=await r.json();assert.equal(page.items.length,1);assert.ok(page.nextCursor);
  assert.equal((await api('/discover?limit=1&cursor='+encodeURIComponent(page.nextCursor),'GET',undefined,other)).status,400);
  assert.equal((await api('/discover?limit=1&category=musique&language=fr&country=CD&cursor='+encodeURIComponent(page.nextCursor))).status,200);
  await api('/me/discovery/reset','POST',{});assert.equal((await db.profile.findUnique({where:{id:viewer.profile.id}})).interests.length,0);
  assert.equal((await api('/discover?limit=1&category=musique&language=fr&country=CD&cursor='+encodeURIComponent(page.nextCursor))).status,400);
});
test('Défis, sons et essais : droits de modération et exposition hors abonnés',async()=>{
  const now=Date.now(),body={slug:fixture,title:'Défi musique',description:'Défi QA',startsAt:new Date(now-1000).toISOString(),endsAt:new Date(now+86400000).toISOString()};
  assert.equal((await api('/moderation/challenges','POST',body)).status,403);const challenge=await(await api('/moderation/challenges','POST',body,admin)).json();assert.ok(challenge.id);
  const sound=await(await api(`/videos/${publicVideo.id}/sound`,'POST',{label:'Son original QA',reuseAllowed:true},other)).json();assert.ok(sound.id);
  assert.equal((await api(`/videos/${privateVideo.id}/discovery-links`,'PUT',{soundId:sound.id,challengeId:challenge.id},owner)).status,200);
  const trial=await video(other,{trial:true});assert.ok((await(await api('/discover?mode=trial')).json()).items.some(v=>v.id===trial.id));
  await api(`/creators/${other.profile.username}/relations/follow`,'PUT');assert.ok(!(await(await api('/discover?mode=trial')).json()).items.some(v=>v.id===trial.id));
  assert.equal((await api(`/videos/${trial.id}/trial-results`)).status,404);
  assert.equal((await api('/admin/recommendation-models/train','POST',{},admin)).status,409);
});
test('Modèle supervisé : corpus synthétique, évaluation séparée, activation et retour arrière',async()=>{
  const profiles=Array.from({length:20},()=>({id:randomUUID(),issuer,subject:randomUUID(),username:'qa_'+randomBytes(8).toString('hex'),displayName:'Corpus synthétique'}));
  await db.profile.createMany({data:profiles});const videos=[];for(let i=0;i<11;i++)videos.push(await video(other,{title:'Corpus modèle '+i}));
  const rows=Array.from({length:220},(_,i)=>({id:randomUUID(),profileId:profiles[i%20].id,videoId:videos[Math.floor(i/20)].id,surface:'short',watchedMs:i%2?8000:500,features:[1,i%2,0,0,0,0.5,0],createdAt:new Date(Date.now()-7200000+i*1000),updatedAt:new Date(Date.now()-3700000)}));
  await db.watchSession.createMany({data:rows});
  const trained=await api('/admin/recommendation-models/train','POST',{},admin);assert.equal(trained.status,201);const model=await trained.json();assert.equal(model.active,false);assert.equal(model.metrics.eligible,true);assert.ok(model.metrics.loss<model.metrics.baselineLoss);
  assert.equal((await api(`/admin/recommendation-models/${model.id}/active`,'PUT',undefined,admin)).status,200);
  assert.equal(await db.recommendationModel.count({where:{active:true}}),1);
  assert.equal((await api('/admin/recommendation-models/active','DELETE',undefined,admin)).status,200);assert.equal(await db.recommendationModel.count({where:{active:true}}),0);
});
test('Espace : grilles privées, favoris, compteurs et conversations contrôlées côté serveur',async()=>{
  await api(`/videos/${publicVideo.id}/reactions/save`,'PUT');
  const library=await(await api('/me/library?tab=favorites')).json();assert.ok(library.items.some(v=>v.id===publicVideo.id));assert.ok(library.stats.favorites>=1);assert.equal(library.viewScope,'cumulative');
  assert.equal((await fetch(base+'/me/library')).status,401);
  assert.equal((await api('/me/conversations','POST',{username:viewer.profile.username})).status,400);
  const first=await api('/me/conversations','POST',{username:other.profile.username});assert.equal(first.status,201);const thread=await first.json();assert.ok(thread.id);
  assert.equal((await(await api('/me/conversations','POST',{username:other.profile.username})).json()).id,thread.id);
  const data={text:'Bonjour TALA',clientId:randomUUID()};const sent=await api(`/conversations/${thread.id}/messages`,'POST',data);assert.equal(sent.status,201);const message=await sent.json();assert.equal((await(await api(`/conversations/${thread.id}/messages`,'POST',data)).json()).id,message.id);
  assert.equal((await api(`/conversations/${thread.id}/messages`,'GET',undefined,owner)).status,404);
  assert.equal((await api(`/conversations/${thread.id}/messages`,'POST',{...data,text:'intrusion'},owner)).status,404);
  const inbox=await(await api('/me/conversations','GET',undefined,other)).json();assert.equal(inbox.items.find(t=>t.id===thread.id).unread,1);
  const page=await(await api(`/conversations/${thread.id}/messages`,'GET',undefined,other)).json();assert.equal(page.items[0].text,data.text);assert.equal(page.me,other.profile.id);assert.equal(page.peer.issuer,undefined);assert.equal(page.peer.subject,undefined);assert.equal(page.peer.interests,undefined);
  await api(`/conversations/${thread.id}/read`,'PUT',undefined,other);assert.equal((await(await api('/me/conversations','GET',undefined,other)).json()).items.find(t=>t.id===thread.id).unread,0);
  assert.equal((await api(`/conversations/${thread.id}/messages`,'POST',{text:'x'.repeat(2001),clientId:randomUUID()})).status,400);
  await api(`/creators/${other.profile.username}/relations/block`,'PUT');assert.equal((await api(`/conversations/${thread.id}/messages`)).status,404);assert.equal((await api(`/conversations/${thread.id}/messages`,'POST',{text:'bloqué',clientId:randomUUID()})).status,404);await api(`/creators/${other.profile.username}/relations/block`,'DELETE');
  await api(`/creators/${other.profile.username}/relations/restrict`,'PUT');assert.equal((await(await api('/me/conversations')).json()).items.some(t=>t.id===thread.id),false);assert.equal((await api(`/conversations/${thread.id}/messages`)).status,404);await api(`/creators/${other.profile.username}/relations/restrict`,'DELETE');
});
test('Suspension et suppression : propagation durable, reprise après panne et révocation en direct',async()=>{
  const sync=app.get(IdentitySyncService);states.get(owner.subject).active=false;
  assert.equal((await api('/me/profile','GET',undefined,owner)).status,401);
  events.push({sequence:'1',subject:owner.subject,role:'creator',active:false,kind:'state',createdAt:new Date().toISOString()});
  failEvents=true;await assert.rejects(sync.poll());assert.equal((await db.profile.findUnique({where:{id:owner.profile.id}})).suspended,false);failEvents=false;
  await sync.poll();assert.equal((await db.profile.findUnique({where:{id:owner.profile.id}})).suspended,true);
  events.push({sequence:'2',subject:owner.subject,role:'creator',active:false,kind:'deleted',createdAt:new Date().toISOString()});await sync.poll();await sync.poll();
  assert.equal(await db.profile.findUnique({where:{id:owner.profile.id}}),null);assert.equal((await db.video.findUnique({where:{id:privateVideo.id}})).status,'deleted');assert.equal((await db.identitySync.findUnique({where:{issuer}})).sequence,2n);
});



