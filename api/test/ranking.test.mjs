import {test} from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);const{rankingFeatures,fit,predict,logLoss}=require('../dist/feed/ranking.js');
test('Classement : données déclarées de la vidéo et préférences du seul spectateur',()=>{
 const profile={interests:['MUSIQUE'],languages:['fr'],country:'CD'},video={hashtags:['musique'],category:'arts',language:'fr',country:'CD',publishedAt:new Date(100000)};
 assert.deepEqual(rankingFeatures(profile,video,true,true,100000),[1,1,1,1,1,1,1]);
 assert.equal(rankingFeatures(profile,{...video,language:'en',country:'US'},false,false,100000)[2],0);
});
test('Modèle : apprentissage sur un signal connu et évaluation indépendante',()=>{
 const rows=Array.from({length:300},(_,i)=>({features:[1,i%2,0,0,0,0.5,0],label:i%2}));
 const weights=fit(rows.slice(0,240)),validation=rows.slice(240);
 assert.ok(predict(weights,[1,1,0,0,0,0.5,0])>predict(weights,[1,0,0,0,0,0.5,0]));
 assert.ok(logLoss(validation,s=>predict(weights,s.features))<logLoss(validation,()=>0.5)-0.1);
 assert.ok(weights.every(Number.isFinite));
});
test('Probabilités bornées et pertes finies aux extrêmes',()=>{
 assert.ok(predict([1000,0,0,0,0,0,0],[1,0,0,0,0,0,0])<1);
 assert.ok(Number.isFinite(logLoss([{features:[],label:0}],()=>1)));
});
