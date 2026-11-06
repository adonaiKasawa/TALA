import {createRequire} from 'node:module';
import {readFileSync,writeFileSync,renameSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomBytes} from 'node:crypto';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const require=createRequire(resolve(root,'api/package.json'));const {parse}=require('dotenv');
const files=['authserver/.env','api/.env'].map(name=>({path:resolve(root,name),text:readFileSync(resolve(root,name),'utf8')}));
const values=files.map(file=>parse(file.text));
for(const env of values){if(env.NODE_ENV==='production')throw Error('Cette préparation est réservée au développement local.');const url=new URL(env.AUTH_DATABASE_URL||env.DATABASE_URL);if(!['localhost','127.0.0.1'].includes(url.hostname))throw Error('Base locale requise.');}
const keys=values.map(v=>v.IDENTITY_SYNC_KEY).filter(Boolean);
if(keys.some(key=>!/^[a-f0-9]{64}$/i.test(key))||new Set(keys).size>1)throw Error('Clés existantes invalides ou différentes ; aucune modification effectuée.');
const key=keys[0]||randomBytes(32).toString('hex');
for(const file of files){const line=`IDENTITY_SYNC_KEY=${key}`;const text=/^IDENTITY_SYNC_KEY=.*$/m.test(file.text)?file.text.replace(/^IDENTITY_SYNC_KEY=.*$/m,line):file.text.trimEnd()+'\n'+line+'\n';writeFileSync(file.path+'.sync-tmp',text,{mode:0o600});renameSync(file.path+'.sync-tmp',file.path);}
console.log('Clé de synchronisation configurée dans les deux fichiers privés. Redémarrer les services après les migrations.');
