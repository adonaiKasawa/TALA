import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {testDatabase} from './test-database.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const require=createRequire(resolve(root,'authserver/package.json'));
const env=require('dotenv').parse(readFileSync(resolve(root,'authserver/.env')));
const files=process.argv.slice(2);if(files.some(f=>!['integration','extensions'].includes(f)))throw Error('Suite inconnue');
const db=await testDatabase(env,process.execPath,'authserver');
try{const child=spawn(process.execPath,['--test','--test-concurrency=1',...(files.length?files:['integration','extensions']).map(f=>`test/${f}.mjs`)],{cwd:resolve(root,'authserver'),env:{...process.env,...env,NODE_ENV:'test',AUTH_DATABASE_URL:db.url,SMS_DRIVER:'disabled',GOOGLE_CLIENT_ID:'',GOOGLE_CLIENT_SECRET:'',APPLE_CLIENT_ID:'',SMTP_URL:''},stdio:'inherit',windowsHide:true});process.exitCode=await new Promise((done,reject)=>{child.on('error',reject);child.on('exit',code=>done(code??1))});}finally{await db.dispose();}
