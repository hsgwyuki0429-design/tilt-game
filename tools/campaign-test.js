'use strict';
const assert=require('assert'),E=require('../src/engine'),S=require('./lib/duo-search');
const A=require('./lib/level-analysis'),K=require('./lib/board-keys');
const {STAGES,CHAPTERS}=require('../src/stages');
const selection=require('./campaign-selection.json');
assert.strictEqual(STAGES.length,100);
assert.strictEqual(STAGES[0].par,3);
assert(STAGES.filter(d=>d.board[0].length===4).length>=70,'4x4 must remain the main tray');
const boards=new Set(),walls=new Set();let examined=0,ordinary=0,collectionTraps=0;
STAGES.forEach((def,i)=>{
  const st=E.compile(def),where='stage '+def.id;
  assert.strictEqual(def.id,i+1);
  assert(st.h===4&&(st.w===4||st.w===5),where+': 4x4 or 5x4');
  assert.strictEqual(st.penguins,i?2:1,where+': fixed penguin count');
  assert.strictEqual(st.drifters,0,where+': no moving grey blocks');
  assert(!def.board.join('').match(/[^.#ABab]/),where+': only walls, penguins and goals');
  assert.strictEqual(st.goalCells.length,st.penguins);
  const key=S.canonical(def.board),wall=S.canonical(def.board,true);
  assert(!boards.has(key)&&!walls.has(wall),where+': distinct board and wall plan');boards.add(key);walls.add(wall);
  assert.strictEqual(E.solve(st).moves,def.par,where+': exact shortest path');
  if(i){assert(def.par>=STAGES[i-1].par);assert(def.par-STAGES[i-1].par<=2,'no abrupt par jump');}
  const g=E.graph(st),toWin=A.distanceToWin(g);examined+=g.n;
  assert.strictEqual(toWin[0],def.par);
  for(let at=0;at<g.n;at++)if(Number.isFinite(toWin[at]))for(const next of g.next[at]){
    if(next===at)continue;
    if(g.states[next].collected===g.states[at].collected){
      ordinary++;assert(Number.isFinite(toWin[next]),where+': an ordinary move must not silently create a dead end');
    }else if(!Number.isFinite(toWin[next]))collectionTraps++;
  }
  if(i){
    const flat=def.board.join(''),ws=[];for(let c=0;c<flat.length;c++)if(flat[c]==='#')ws.push(c);
    const accelerated=S.graph(st.w,st.h,ws,[flat.indexOf('a'),flat.indexOf('b')]);
    const start=flat.indexOf('A')*accelerated.B+flat.indexOf('B'),m=S.assess(accelerated,start);
    assert(!accelerated.unfair[start]);assert(m.brakes>=1&&m.interactions>=1,where+': real penguin cooperation');
    assert(m.decisionRate>=.48&&m.branching>=1.5&&m.maxForced<=3&&m.solo<=4&&m.repeated<=.38,where+': choice and repetition limits');
    assert.strictEqual(m.path,selection.stages[i].path);
    // Independently measure useful decisions on the selected solution in the
    // actual engine graph; taking back the preceding move is not a choice.
    let at=0,prev=-1,run=0,max=0,decisions=0;
    for(const d of m.path){
      const options=new Set(g.next[at].filter(v=>v!==at&&v!==prev&&Number.isFinite(toWin[v])));
      if(options.size>=2){decisions++;run=0;}else max=Math.max(max,++run);
      const next=g.next[at][E.DIRS.indexOf(d)];assert.strictEqual(toWin[next],toWin[at]-1);
      prev=at;at=next;
    }
    assert(max<=3&&decisions/m.par>=.48&&g.clear[at]);
  }
  for(let v=0;v<(st.w===st.h?8:4);v++){
    const transformed=K.present(def.board,v);
    assert.strictEqual(E.solve(E.compile({board:transformed})).moves,def.par,where+': direction symmetry');
    assert.strictEqual(K.canonBoard(transformed),K.canonBoard(def.board));
  }
});
let covered=0;CHAPTERS.forEach((c,i)=>{assert.strictEqual(c.from,covered+1);assert.strictEqual(c.number,i+1);covered=c.to;});
assert.strictEqual(covered,100);
assert.strictEqual(STAGES[99].par,Math.max(...STAGES.map(d=>d.par)));
console.log('PASS: 100 new stages, '+examined+' reachable states, '+ordinary+' ordinary transitions without surprise dead ends; '+collectionTraps+' premature-collection traps; symmetry, branching and exact pars verified');
