import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
for (const platform of ['web/src/components/feed', 'mobile/src/feed']) {
  const code = ts.transpileModule(readFileSync('../'+platform+'/watch-tracker.ts','utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
  const { WatchTracker } = await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
  test(platform+': pauses, saut de lecture et horloge ne gonflent pas le visionnage', async()=>{
    let now=0; const events=[];
    const tracker=new WatchTracker(async body=>events.push(body),()=>now);
    tracker.sample(0,false);now=1000;tracker.sample(1,true);tracker.emit('pause');
    now=100000;tracker.sample(1,false);now=101000;tracker.sample(2,true);
    tracker.sample(15,false);now=102000;tracker.sample(16,true);
    await tracker.finish();
    assert.equal(events[0].watchedMs,1000);assert.equal(events.at(-1).watchedMs,3000);assert.equal(events.at(-1).positionMs,16000);
    assert.ok(events.every((event,i)=>event.sequence===i+1));
    const count=events.length;tracker.emit('progress');await tracker.finish();assert.equal(events.length,count);
  });
  test(platform+': aucun événement sans exposition et envois sérialisés après erreur réseau', async()=>{
    const events=[];let inFlight=0,maxInFlight=0;
    const tracker=new WatchTracker(async body=>{ inFlight++;maxInFlight=Math.max(maxInFlight,inFlight);await Promise.resolve();events.push(body);inFlight--;if(body.sequence===1)throw new Error('offline'); },()=>1000);
    assert.equal(events.length,0);tracker.sample(1,true);tracker.emit('play');tracker.emit('pause');await tracker.finish();
    assert.equal(maxInFlight,1);assert.deepEqual(events.map(e=>e.sequence),[1,2,3]);
  });
}
