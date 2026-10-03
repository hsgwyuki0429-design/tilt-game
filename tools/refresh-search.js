'use strict';
const fs=require('fs');const S=require('./lib/duo-search');
const w=Number(process.argv[2]||4),h=4,iterations=Number(process.argv[3]||30000);
const out=process.argv[4]||'tools/refresh-pool-'+w+'.json';
const minWalls=Number(process.argv[6]||2),maxWalls=Number(process.argv[7]||(w===4?5:6));
let seed=Number(process.argv[5]||271828+w),rng=()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return(seed>>>0)/4294967296;};
const initialSeed=seed;
let pool=new Map(),seen=new Set(),longest=0,qualified=0,evaluated=0,extremes=[],start=Date.now();
const counts={};
for(let it=0;it<iterations;it++){
  const cells=Array.from({length:w*h},(_,i)=>i);
  for(let i=cells.length-1;i>0;i--){const j=rng()*(i+1)|0;[cells[i],cells[j]]=[cells[j],cells[i]];}
  const wc=minWalls+(rng()*(maxWalls-minWalls+1)|0),walls=cells.slice(0,wc).sort((a,b)=>a-b),goals=cells.slice(wc,wc+2);
  const key=walls.join(',')+'|'+goals.slice().sort((a,b)=>a-b).join(',');if(seen.has(key))continue;seen.add(key);
  const g=S.graph(w,h,walls,goals);evaluated++;
  const starts=[];
  for(const a of g.free)for(const b of g.free){
    if(a===b||goals.includes(a)||goals.includes(b))continue;
    const id=a*g.B+b,par=g.dist[id];if(par<3)continue;
    if(par>longest){longest=par;extremes.push({par,board:S.rows(g,id)});console.log(w+'x4 longest '+par+' @ '+it);}
    if(!g.unfair[id])starts.push(id);
  }
  starts.sort((a,b)=>g.dist[b]-g.dist[a]);
  const picks=starts.slice(0,3);
  for(let j=0;j<3&&starts.length;j++)picks.push(starts[rng()*starts.length|0]);
  for(const id of new Set(picks)){
    const a=S.assess(g,id);
    if(a.openingSafe<2||a.maxForced>3||a.decisionRate<.48||a.branching<1.5||a.solo>4||a.brakes<1||a.repeated>.38)continue;
    qualified++;counts[a.par]=(counts[a.par]||0)+1;
    const board=S.rows(g,id),canon=S.canonical(board),wallKey=S.canonical(board,true);
    const bucket=a.par;let list=pool.get(bucket)||[];
    if(list.some(x=>x.canon===canon))continue;
    const entry={board,canon,wallKey,...a};delete entry.states;
    list.push(entry);list.sort((x,y)=>y.score-x.score);
    // Keep room diversity within each par, not hundreds of starts in one room.
    const perWall=new Map();list=list.filter(x=>{let n=perWall.get(x.wallKey)||0;perWall.set(x.wallKey,n+1);return n<2;}).slice(0,70);
    pool.set(bucket,list);
  }
  if(it%10000===0)console.log(JSON.stringify({it,evaluated,longest,qualified,seconds:(Date.now()-start)/1000}));
}
fs.writeFileSync(out,JSON.stringify({w,h,iterations,seed:initialSeed,minWalls,maxWalls,evaluated,qualified,longest,seconds:(Date.now()-start)/1000,counts,extremes,candidates:[...pool.values()].flat()},null,2));
console.log(JSON.stringify({out,evaluated,qualified,longest,counts,seconds:(Date.now()-start)/1000}));
