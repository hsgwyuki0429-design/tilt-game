'use strict';
const assert=require('assert'),vm=require('vm'),fs=require('fs');
const old={version:2,cleared:{1:1,99:52},unlocked:100,sound:false,haptics:false,reduceMotion:true};
const storage={'tilt.save.duo.v3':JSON.stringify(old)};
const window={localStorage:{getItem:k=>storage[k]||null,setItem:(k,v)=>storage[k]=v}};
vm.runInNewContext(fs.readFileSync(require.resolve('../src/save.js'),'utf8'),{window});
const Save=window.TiltSave.Save;let save=new Save();
assert.strictEqual(save.clearedCount(),0);assert.strictEqual(save.data.unlocked,1);
assert.strictEqual(save.data.sound,false);assert.strictEqual(save.data.haptics,false);assert.strictEqual(save.data.reduceMotion,true);
save.recordClear(1,3,100);save=new Save();
assert.strictEqual(save.best(1),3);assert.strictEqual(save.best(99),null);
assert.strictEqual(storage['tilt.save.duo.v3'],JSON.stringify(old),'old campaign save preserved');
storage['tilt.save.floe.v4']='{broken';save=new Save();assert.strictEqual(save.clearedCount(),0);
console.log('PASS: campaign scores isolated, preferences retained, old save preserved, new save roundtrip and corruption recovery');

// Graphics preference: AUTO by default, only the three known values survive,
// and what AUTO learned is kept only if it is a real timestamp.
storage['tilt.save.floe.v4']=JSON.stringify({version:4,cleared:{},unlocked:1});
save=new Save();assert.strictEqual(save.data.quality,'auto');assert.strictEqual(save.data.qualityLearned,null);
save.set('quality','lite');save.set('qualityLearned',{at:1.8e12});save=new Save();
assert.strictEqual(save.data.quality,'lite');assert.strictEqual(save.data.qualityLearned.at,1.8e12);
storage['tilt.save.floe.v4']=JSON.stringify({version:4,cleared:{},unlocked:1,quality:'ultra',qualityLearned:{at:'soon'}});
save=new Save();assert.strictEqual(save.data.quality,'auto','an unknown mode falls back to auto');assert.strictEqual(save.data.qualityLearned,null);
storage['tilt.save.floe.v4']=JSON.stringify({version:4,cleared:{},unlocked:1,quality:'high',qualityLearned:null});
save=new Save();assert.strictEqual(save.data.quality,'high');
save.reset();assert.strictEqual(save.data.quality,'auto','erasing progress restores AUTO');
console.log('PASS: graphics preference defaults, validation and reset');
