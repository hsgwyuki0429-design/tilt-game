'use strict';
const assert=require('assert'),E=require('../src/engine'),S=require('./lib/duo-search');
let seed=10203;function random(n){seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return(seed>>>0)%n;}
let checked=0;
for(let k=0;k<120;k++){
  const w=k%2?5:4,h=4,n=w*h,cells=Array.from({length:n},(_,i)=>i);
  for(let i=n-1;i>0;i--){const j=random(i+1);[cells[i],cells[j]]=[cells[j],cells[i]];}
  const walls=cells.slice(0,2+random(4)),goals=cells.slice(8,10),g=S.graph(w,h,walls,goals);
  const stage=E.compile({board:S.rows(g,cells[6]*g.B+cells[7])});
  for(let id=0;id<g.total;id++)if(g.valid[id]&&g.dist[id]!==0){
    const positions=[id/g.B|0,id%g.B];
    const state={pos:stage.colour.map(c=>{const p=positions[c-1];return p===n?[0,0]:[p%w,p/w|0];}),
      alive:stage.colour.map(c=>+(positions[c-1]!==n)),collected:positions.filter(p=>p===n).length,lost:0,moves:0};
    for(let d=0;d<4;d++){
      const r=E.simulate(stage,state,S.DIRS[d],{frames:false});
      let dest=[n,n];stage.colour.forEach((c,i)=>{if(r.state.alive[i])dest[c-1]=r.state.pos[i][1]*w+r.state.pos[i][0];});
      assert.strictEqual(g.next[id*4+d],r.moved?dest[0]*g.B+dest[1]:-1,'accelerator disagrees '+k+'/'+id+'/'+d);
      checked++;
    }
  }
}
console.log('PASS: '+checked+' rectangular accelerator transitions agree with the shipping engine');
