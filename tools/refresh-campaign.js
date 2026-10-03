'use strict';
const fs=require('fs'),path=require('path'),assert=require('assert');
const E=require('../src/engine'),S=require('./lib/duo-search');
const ROOT=path.resolve(__dirname,'..'),selection=path.join(__dirname,'campaign-selection.json');
function unpack(board){
  const w=board[0].length,h=board.length,flat=board.join(''),walls=[];
  for(let i=0;i<flat.length;i++)if(flat[i]==='#')walls.push(i);
  const goals=[flat.indexOf('a'),flat.indexOf('b')],g=S.graph(w,h,walls,goals);
  return {g,start:flat.indexOf('A')*g.B+flat.indexOf('B')};
}
function tutorial(){
  // Exhaustive small tutorial pass; ordinary moves must all stay recoverable.
  for(let wall=0;wall<16;wall++)for(let goal=0;goal<16;goal++)for(let p=0;p<16;p++){
    if(new Set([wall,goal,p]).size!==3)continue;
    const f=Array(16).fill('.');f[wall]='#';f[goal]='a';f[p]='A';
    const board=Array.from({length:4},(_,i)=>f.slice(i*4,i*4+4).join(''));
    const st=E.compile({board}),r=E.solve(st);
    if(r.moves!==3)continue;
    const states=E.reachable(st);if(states.some(s=>!E.solve(st,s).solvable))continue;
    if(E.DIRS.filter(d=>E.step(st,E.initialState(st),d)).length<2)continue;
    return {board,par:3,path:r.path.join(''),wallKey:S.canonical(board,true),score:0};
  }throw Error('tutorial missing');
}
let data;
if(process.argv.length>2){
  const sources=process.argv.slice(2).map(file=>({file,...JSON.parse(fs.readFileSync(file,'utf8'))}));
  const candidates=new Map();let unfair=0;
  for(const source of sources)for(const c of source.candidates){
    if(candidates.has(c.canon))continue;
    const {g,start}=unpack(c.board);if(g.unfair[start]){unfair++;continue;}
    assert.strictEqual(g.dist[start],c.par);
    const a=S.assess(g,start);if(a.brakes<1)continue;
    Object.assign(c,a);delete c.states;candidates.set(c.canon,c);
  }
  const pool=[...candidates.values()],used=new Set(),chosen=[tutorial()];
  used.add(chosen[0].wallKey);
  // Difficulty is monotone, with room for a few scarce late-game discoveries.
  // 4x4 gets the first choice until 23; different wall plans prevent leftovers.
  const end=Math.min(32,Math.max(...pool.map(c=>c.par)));
  let last=3;
  for(let i=1;i<100;i++){
    const target=i<80?Math.round(3+i*18/79):Math.round(22+(i-80)*(end-22)/19);
    const roomMax=new Map();pool.forEach(c=>{if(!used.has(c.wallKey))roomMax.set(c.wallKey,Math.max(c.par,roomMax.get(c.wallKey)||0));});
    const remaining={};for(let p=3;p<=end;p++)remaining[p]=[...roomMax.values()].filter(n=>n>=p).length;
    const available=pool.filter(c=>!used.has(c.wallKey)&&c.par>=last&&c.par<=target+1&&remaining[c.par]>=100-i);
    available.sort((a,b)=>{
      function rank(c){return c.score-Math.abs(c.par-target)*80+(c.board[0].length===4?32:0)-
        Math.abs(c.interactions-(2+i/12))*.8-(roomMax.get(c.wallKey)-c.par)*30;}
      return rank(b)-rank(a);
    });
    if(!available.length)throw Error('No diverse candidate at '+(i+1)+' target '+target+' previous '+last);
    const c=available[0];chosen.push(c);used.add(c.wallKey);last=c.par;
  }
  chosen.sort((a,b)=>a.par-b.par);
  // Keep the solo introduction first among the 3-move boards.
  assert(!chosen[0].board.join('').includes('B'));
  const names=('HOME PAIR GLIDE FLOE CROSS CALM FROST SHELF CRISP DAWN RIME THAW SLEET BERG CRAG PALE HUSH VEIL SPUR NORTH GLEAM SNAP RIDGE BASIN FJORD SHARD PRISM GLINT HOAR BLUE CLEFT WAKE SHOAL PACK TIDE SPIRE BRINE CROWN STILL FLARE QUARTZ LEDGE SLATE MIST ARCH FLINT GLACE SIREN HOLLOW HALF AURORA CINDER BEACON LANTERN HARBOUR KEEL ANCHOR MARINER COMPASS MERIDIAN SOLSTICE ZENITH LATITUDE CURRENT DRAUGHT CAVERN CHASM FISSURE MORAINE CIRQUE SERAC CREVASSE CORNICE SUMMIT TRAVERSE ASCENT PITON BELAY CAIRN BEARING POLARIS MIDNIGHT LONGNIGHT WHITEOUT BLIZZARD SQUALL TEMPEST GALE PASSAGE ICEFALL DEEPFROST COLDIRON STARFIELD NIGHTFALL FARSHORE LASTLIGHT ENDLESS THRESHOLD CROSSING TILT').split(' ');
  chosen.forEach((c,i)=>{c.id=i+1;c.name=names[i];const r=E.solve(E.compile({board:c.board}));assert.strictEqual(r.moves,c.par);});
  data={version:'duo-2026-10',criteria:{ordinaryMoveDeadEnds:0,maxForcedRun:3,minDecisionRate:.48,minUsefulBranching:1.5,maxSoloTail:4},
    sources:sources.map(s=>({file:path.basename(s.file),evaluated:s.evaluated,longest:s.longest})),unfairRejected:unfair,
    candidateCount:pool.length,stages:chosen};
  fs.writeFileSync(selection,JSON.stringify(data,null,2)+'\n');
}else data=JSON.parse(fs.readFileSync(selection,'utf8'));
const chapters=[['FIRST LIGHT','はじまり'],['PARTNERS','ふたり'],['BRAKES','止まり木'],['CROSSROADS','分かれ道'],
 ['SETUP','布石'],['EXCHANGE','入れ替え'],['BALANCE','釣り合い'],['PATIENCE','順番'],['DISCOVERY','発見'],['FINALE','結晶']]
 .map((c,i)=>({number:i+1,name:c[0],ja:c[1],from:i*10+1,to:i*10+10,note:'Two penguins, shared gravity, and a choice of paths.'}));
const hints=[
 {ja:'壁で止まって、オーロラを目指そう。通り過ぎるだけでは入れません。',en:'Use the wall to stop on your aurora. Passing over it does not collect you.'},
 {ja:'2体が同時に滑ります。それぞれ同じ色のオーロラへ。',en:'Both penguins slide together. Stop each on its matching aurora.'},
 {ja:'もう一羽も、止まるための足場になります。',en:'The other penguin can be the brake you need.'},
 {ja:'先にゴールすると、相手の足場がなくなることも。',en:'Collecting one penguin too early can remove a brake the other needs.'},
 {ja:'一度遠ざかると、別の止まり方が見えてきます。',en:'Moving away can reveal a new place to stop.'},
 {ja:'どちらを先に止めるか、位置関係を見てみよう。',en:'Look at where each penguin can stop the other.'}
];
const stages=data.stages.map((c,i)=>({id:i+1,name:c.name,par:c.par,
 idea:i?'Two penguins; branching routes and a verified shortest solution.':'One penguin; learn to stop on the aurora.',
 hint:hints[i<2?i:(c.brakes===2?5:c.away>=3?4:c.solo>=2?3:2)],board:c.board}));
const js="'use strict';\n// Generated by tools/refresh-campaign.js from the reviewed campaign-selection.json.\n"+
"(function(root,factory){var api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.TiltStages=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){\n"+
'  var CHAPTERS = '+JSON.stringify(chapters,null,2)+';\n  var STAGES = '+JSON.stringify(stages,null,2)+';\n'+
"  return { STAGES:STAGES, CHAPTERS:CHAPTERS };\n});\n";
fs.writeFileSync(path.join(ROOT,'src/stages.js'),js);
const histogram={};stages.forEach(c=>histogram[c.par]=(histogram[c.par]||0)+1);
console.log(JSON.stringify({count:stages.length,square:stages.filter(c=>c.board[0].length===4).length,
  rectangle:stages.filter(c=>c.board[0].length===5).length,first:stages[0].par,last:stages[99].par,histogram}));
