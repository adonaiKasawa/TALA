import 'dotenv/config';
import {before,after,test} from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';import {createServer} from 'node:http';import {randomBytes,randomUUID,createHmac} from 'node:crypto';
import {SignJWT,importJWK} from 'jose';import {TOTP,Secret} from 'otpauth';
const require=createRequire(import.meta.url);const{createAuthApp}=require('../dist/app.factory.js');const{Database}=require('../dist/database/database.service.js');const{KeysService}=require('../dist/keys/keys.service.js');const{ConfigService}=require('../dist/config/config.service.js');const{PhoneService}=require('../dist/identity/phone.service.js');const{FederationController}=require('../dist/federation/federation.controller.js');const{hash}=require('@node-rs/argon2');
let app,db,keys,phone,base,config,privateKey,user,admin,member,secret;
const syncKey=randomBytes(32).toString('hex'),password='QAOnly!'+randomBytes(16).toString('hex');
const call=(path,method='GET',body,auth=member)=>fetch(base+path,{method,headers:{...(auth?{authorization:'Bearer '+auth.token}:{}),...(body===undefined?{}:{'content-type':'application/json'})},body:body===undefined?undefined:JSON.stringify(body),redirect:'manual'});
async function issue(u,mfa=false){const sid=randomUUID(),gid=randomUUID();for(const row of [{model:'Session',id:randomUUID(),uid:sid},{model:'Grant',id:gid}])await db.oidcArtifact.create({data:{...row,accountId:u.id,payload:keys.seal({}),expiresAt:new Date(Date.now()+600000)}});const token=await new SignJWT({sid,gid,scope:'tala.identity tala.admin',client_id:config.AUTH_REVIEW_CLIENT_ID,amr:mfa?['pwd','otp']:['pwd'],auth_time:Math.floor(Date.now()/1000)}).setProtectedHeader({alg:'RS256',typ:'at+jwt',kid:config.jwks.keys[0].kid}).setIssuer(config.issuer).setSubject(u.id).setAudience(config.IDENTITY_AUDIENCE).setIssuedAt().setExpirationTime('5m').sign(privateKey);return{token,sid,gid};}
function internal(path,method='GET',body,timestamp=String(Date.now())){const signature=createHmac('sha256',Buffer.from(syncKey,'hex')).update(`${method}\n${path}\n${timestamp}\n${JSON.stringify(body||{})}`).digest('hex');return fetch(base+path,{method,headers:{'x-tala-time':timestamp,'x-tala-signature':signature,...(body?{'content-type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});}
before(async()=>{const s=createServer();await new Promise(r=>s.listen(0,'127.0.0.1',r));base=`http://127.0.0.1:${s.address().port}`;await new Promise(r=>s.close(r));process.env.OIDC_ISSUER=base;process.env.IDENTITY_SYNC_KEY=syncKey;process.env.SMS_DRIVER='local';process.env.SMTP_URL='';process.env.NODE_ENV='test';app=await createAuthApp();await app.listen(Number(new URL(base).port),'127.0.0.1');db=app.get(Database);keys=app.get(KeysService);phone=app.get(PhoneService);config=app.get(ConfigService).value;privateKey=await importJWK(config.jwks.keys[0],'RS256');secret=new Secret({size:20}).base32;
user=await db.user.create({data:{email:randomUUID()+'@example.test',username:'qa_'+randomBytes(6).toString('hex'),emailVerified:true,passwordHash:await hash(password),role:'viewer'}});
admin=await db.user.create({data:{email:randomUUID()+'@example.test',username:'qa_'+randomBytes(6).toString('hex'),emailVerified:true,passwordHash:await hash(password),role:'admin',mfaEnabled:true,mfaSecret:keys.seal(secret)}});member=await issue(user);});
after(async()=>{await app?.close();delete process.env.IDENTITY_SYNC_KEY;});
test('Canal interne : signature, horodatage et absence de session',async()=>{
assert.equal((await call('/internal/identity-events?after=0','GET',undefined,null)).status,401);
assert.equal((await internal('/internal/identity-events?after=0','GET',undefined,String(Date.now()-120000))).status,401);
assert.equal((await internal(`/internal/identity-state/${user.id}?sid=${member.sid}&gid=${member.gid}`)).status,200);
const state=await(await internal(`/internal/identity-state/${user.id}?sid=bad&gid=bad`)).json();assert.equal(state.active,false);
});
test('Type de compte : aucun rôle administratif choisi librement, révocation et événement durable',async()=>{
assert.equal((await call('/account/type','POST',{role:'admin'})).status,400);
assert.equal((await call('/account/type','POST',{role:'creator'})).status,201);
assert.equal((await call('/account/me')).status,401);
const events=await(await internal('/internal/identity-events?after=0')).json();assert.ok(events.some(e=>e.subject===user.id&&e.role==='creator'));
member=await issue(await db.user.findUniqueOrThrow({where:{id:user.id}}));
});
async function codeFor(id){const r=await db.phoneChallenge.findUniqueOrThrow({where:{id}});const text=keys.open(r.delivery).text;return text.match(/\b\d{6}\b/)[0];}
test('OTP : association vérifiée, usage unique, finalité et erreurs persistées',async()=>{
const p='+243'+String(Math.floor(100000000+Math.random()*899999999));const c=await phone.start(user.id,p,'link','qa-link');const code=await codeFor(c.challengeId);
await assert.rejects(phone.consume(c.challengeId,code,'login:wrong',user.id,true));
await assert.rejects(phone.consume(c.challengeId,'000000','link',user.id,true));assert.equal((await db.phoneChallenge.findUnique({where:{id:c.challengeId}})).attempts,1);
await phone.consume(c.challengeId,code,'link',user.id,true);assert.equal((await db.user.findUnique({where:{id:user.id}})).phone,p);
await assert.rejects(phone.consume(c.challengeId,code,'link',user.id,true));
const login=await phone.start(user.id,p,'login:qa','qa-login');const loginCode=await codeFor(login.challengeId);const results=await Promise.allSettled([phone.consume(login.challengeId,loginCode,'login:qa'),phone.consume(login.challengeId,loginCode,'login:qa')]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
});
test('OTP : limite de tentatives, expiration et mode SMS désactivé',async()=>{
const u=await db.user.findUniqueOrThrow({where:{id:user.id}});const c=await phone.start(u.id,u.phone,'login:limit','qa-limit');const code=await codeFor(c.challengeId);
for(let i=0;i<5;i++)await assert.rejects(phone.consume(c.challengeId,'000000','login:limit'));
await assert.rejects(phone.consume(c.challengeId,code,'login:limit'));assert.equal((await db.phoneChallenge.findUnique({where:{id:c.challengeId}})).attempts,5);
const expired=await phone.start(u.id,u.phone,'login:expired','qa-expired');await db.phoneChallenge.update({where:{id:expired.challengeId},data:{expiresAt:new Date(0)}});await assert.rejects(phone.consume(expired.challengeId,await codeFor(expired.challengeId),'login:expired'));
process.env.SMS_DRIVER='disabled';try{await assert.rejects(phone.start(u.id,u.phone,'link','qa-disabled'));}finally{process.env.SMS_DRIVER='local'}
});
test('Connexion SMS complète : interaction OAuth, CSRF, consentement et PKCE',async()=>{
 const{adapterFactory}=require('../dist/oidc/persistence/postgres.adapter.js');const{createHash}=await import('node:crypto');
 const clientId='qa_phone_'+randomBytes(5).toString('hex'),redirect=base+'/qa-callback';
 await new(adapterFactory(db,keys))('Client').upsert(clientId,{client_id:clientId,client_name:'QA téléphone',redirect_uris:[redirect],response_types:['code'],grant_types:['authorization_code'],token_endpoint_auth_method:'none',scope:'openid profile email tala.identity'},0);
 const cookies=new Map();async function browser(path,options={}){const headers=new Headers(options.headers);headers.set('cookie',[...cookies].map(([k,v])=>k+'='+v).join('; '));const res=await fetch(new URL(path,base),{...options,headers,redirect:'manual'});for(const cookie of res.headers.getSetCookie()){const pair=cookie.split(';')[0],at=pair.indexOf('=');cookies.set(pair.slice(0,at),pair.slice(at+1));}return res;}
 const verifier=randomBytes(32).toString('base64url');const query=new URLSearchParams({client_id:clientId,redirect_uri:redirect,response_type:'code',scope:'openid profile email tala.identity',resource:config.IDENTITY_AUDIENCE,code_challenge:createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'S256',state:randomUUID(),nonce:randomUUID()});
 let response=await browser('/auth?'+query),authorizationCode;
 for(let attempt=0;attempt<12;attempt++){
  const location=response.headers.get('location');assert.ok(location);const url=new URL(location,base);
  if(url.pathname==='/qa-callback'){assert.equal(url.searchParams.get('error'),null);authorizationCode=url.searchParams.get('code');break;}
  response=await browser(url);if(response.status!==200||!url.pathname.startsWith('/interaction/'))continue;
  const html=await response.text(),csrf=html.match(/name="csrf" value="([^"]+)"/)?.[1],action=html.match(/<form method="post" action="([^"]+)"/)?.[1];assert.ok(csrf&&action);
  if(action.endsWith('/login')){
   const phoneNumber=(await db.user.findUniqueOrThrow({where:{id:user.id}})).phone;
   const headers={'content-type':'application/json',origin:base,'x-csrf-token':csrf};
   const start=await browser(url.pathname+'/phone/challenge',{method:'POST',headers,body:JSON.stringify({phone:phoneNumber})});assert.equal(start.status,201);const challenge=await start.json();
   response=await browser(url.pathname+'/phone/login',{method:'POST',headers,body:JSON.stringify({challengeId:challenge.challengeId,code:await codeFor(challenge.challengeId)})});
  }else response=await browser(action,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded',origin:base},body:new URLSearchParams({csrf})});
 }
 assert.ok(authorizationCode);const exchange=await fetch(base+'/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'authorization_code',client_id:clientId,redirect_uri:redirect,code:authorizationCode,code_verifier:verifier})});assert.equal(exchange.status,200);const result=await exchange.json();assert.equal((await call('/account/me','GET',undefined,{token:result.access_token})).status,200);
 const{decodeJwt}=await import('jose');assert.ok(decodeJwt(result.access_token).amr.includes('sms'));
});
test('MFA retrait : TOTP, preuve liée au contexte et consommation non rejouable',async()=>{
const contextHash=randomBytes(32).toString('hex'),auth=await issue(admin,true);
assert.equal((await call('/account/step-up','POST',{password,code:'000000',purpose:'withdrawal',contextHash},auth)).status,401);
const code=new TOTP({secret}).generate();const r=await call('/account/step-up','POST',{password,code,purpose:'withdrawal',contextHash},auth);assert.equal(r.status,201);const data=await r.json();assert.ok(data.proof);
const body={proof:data.proof,subject:admin.id,purpose:'withdrawal',contextHash};assert.equal((await internal('/internal/step-up/consume','POST',{...body,contextHash:randomBytes(32).toString('hex')})).status,401);
const responses=await Promise.all([internal('/internal/step-up/consume','POST',body),internal('/internal/step-up/consume','POST',body)]);assert.deepEqual(responses.map(r=>r.status).sort(),[201,401]);
assert.equal((await call('/account/mfa/disable','POST',{password,code},auth)).status,400);
});
test('Google/Apple : fournisseurs absents sans clés, configuration spécifique lorsqu’elles sont présentes',()=>{
const c=app.get(FederationController);const old={...process.env};try{process.env.FEDERATION_PROVIDERS_PATH='';process.env.GOOGLE_CLIENT_ID='qa-client';process.env.GOOGLE_CLIENT_SECRET='qa-secret';process.env.APPLE_CLIENT_ID='qa-service';process.env.APPLE_TEAM_ID='QA';process.env.APPLE_KEY_ID='QA';process.env.APPLE_PRIVATE_KEY_PATH='qa-only.p8';const providers=c.providers();assert.ok(providers.some(p=>p.id==='google'&&p.issuer==='https://accounts.google.com'));assert.ok(providers.some(p=>p.id==='apple'&&p.responseMode==='form_post'));}finally{for(const k of ['GOOGLE_CLIENT_ID','GOOGLE_CLIENT_SECRET','APPLE_CLIENT_ID','APPLE_TEAM_ID','APPLE_KEY_ID','APPLE_PRIVATE_KEY_PATH','FEDERATION_PROVIDERS_PATH']){if(old[k]===undefined)delete process.env[k];else process.env[k]=old[k];}}});
test('Suppression identité : tombstone durable et nettoyage des défis téléphoniques',async()=>{
assert.equal((await call('/account/me','DELETE',{password})).status,200);assert.equal(await db.user.findUnique({where:{id:user.id}}),null);
assert.equal(await db.phoneChallenge.count({where:{userId:user.id}}),0);assert.ok(await db.identityEvent.count({where:{subject:user.id,kind:'deleted'}}));
});

