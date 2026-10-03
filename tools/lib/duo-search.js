'use strict';
// Exact complete position graphs for two coloured penguins on rectangular ice.
// Search accelerator only: every selected board is checked by the real engine.
const DIRS=['U','R','D','L'];
const DV=[[0,-1],[1,0],[0,1],[-1,0]];
function graph(w,h,walls,goals){
  const n=w*h,B=n+1,total=B*B,wall=new Uint8Array(n);
  walls.forEach(c=>wall[c]=1);
  const free=[];for(let c=0;c<n;c++)if(!wall[c])free.push(c);
  const stops=new Int16Array(n*4);
  for(const c of free)for(let d=0;d<4;d++){
    let x=c%w,y=c/w|0;const [dx,dy]=DV[d];
    while(x+dx>=0&&x+dx<w&&y+dy>=0&&y+dy<h&&!wall[(y+dy)*w+x+dx]){x+=dx;y+=dy;}
    stops[c*4+d]=y*w+x;
  }
  function glide(c,other,d){
    if(c===n)return n;
    const end=stops[c*4+d];
    if(other===n)return end;
    const [dx,dy]=DV[d],delta=d%2?other%w-c%w:(other/w|0)-(c/w|0);
    const aligned=d%2?(c/w|0)===(other/w|0):c%w===other%w;
    if(aligned&&delta*(dx||dy)>0&&Math.abs(delta)<=Math.abs(d%2?end%w-c%w:(end/w|0)-(c/w|0)))return other-dx-dy*w;
    return end;
  }
  function tilt(a,b,d){
    let chain=false;
    const [dx,dy]=DV[d];
    for(let round=0;round<3;round++){
      const oldA=a,oldB=b;
      const leadA=a===n?-100:(a%w)*dx+(a/w|0)*dy;
      const leadB=b===n?-100:(b%w)*dx+(b/w|0)*dy;
      if(leadA>=leadB){a=glide(a,b,d);b=glide(b,a,d);}else{b=glide(b,a,d);a=glide(a,b,d);}
      if(round>0&&(a!==oldA||b!==oldB))chain=true;
      let removed=false;
      if(a===goals[0]){a=n;removed=true;}
      if(b===goals[1]){b=n;removed=true;}
      if(!removed)break;
    }
    return {id:a*B+b,chain};
  }
  function pair(a,b,d){
    const [dx,dy]=DV[d];
    if((a%w)*dx+(a/w|0)*dy>=(b%w)*dx+(b/w|0)*dy){a=glide(a,b,d);b=glide(b,a,d);}
    else{b=glide(b,a,d);a=glide(a,b,d);}return [a,b];
  }
  const next=new Int16Array(total*4).fill(-1),chains=new Uint8Array(total*4);
  const head=new Int32Array(total).fill(-1),from=new Int16Array(total*4),link=new Int32Array(total*4);
  const valid=new Uint8Array(total);let edges=0;
  for(const a of free.concat(n))for(const b of free.concat(n)){
    if((a===b&&a!==n)||a===goals[0]||b===goals[1])continue;
    const id=a*B+b;valid[id]=1;
    if(a===n&&b===n)continue;
    for(let d=0;d<4;d++){
      const t=tilt(a,b,d);if(t.id===id)continue;
      const e=id*4+d;next[e]=t.id;chains[e]=+t.chain;
      from[edges]=id;link[edges]=head[t.id];head[t.id]=edges++;
    }
  }
  const dist=new Int16Array(total).fill(-1),queue=new Int16Array(total);
  const end=n*B+n;let read=0,write=1;queue[0]=end;dist[end]=0;
  while(read<write){const id=queue[read++];for(let e=head[id];e>=0;e=link[e]){
    const p=from[e];if(dist[p]<0){dist[p]=dist[id]+1;queue[write++]=p;}
  }}
  // A fair room cannot strand the pair on an ordinary move. Losing a brake by
  // collecting it too early is the only permitted irreversible mistake.
  const unfair=new Uint8Array(total);read=0;write=0;
  function collected(id){return +(Math.floor(id/B)===n)+ +(id%B===n);}
  for(let id=0;id<total;id++)if(dist[id]>0){
    for(let d=0;d<4;d++){const v=next[id*4+d];
      if(v>=0&&dist[v]<0&&collected(id)===collected(v)){
        unfair[id]=1;queue[write++]=id;break;
      }
    }
  }
  while(read<write){const id=queue[read++];for(let e=head[id];e>=0;e=link[e]){
    const p=from[e];if(dist[p]>=0&&!unfair[p]){unfair[p]=1;queue[write++]=p;}
  }}
  return {w,h,n,B,total,walls,goals,free,next,chains,valid,dist,unfair,glide,pair};
}
function rows(g,id){
  const a=id/g.B|0,b=id%g.B,out=Array(g.n).fill('.');
  g.walls.forEach(c=>out[c]='#');out[g.goals[0]]='a';out[g.goals[1]]='b';
  if(a<g.n)out[a]='A';if(b<g.n)out[b]='B';
  const r=[];for(let y=0;y<g.h;y++)r.push(out.slice(y*g.w,(y+1)*g.w).join(''));return r;
}
function canonical(board,onlyWalls){
  const w=board[0].length,h=board.length,flat=board.join('');let best=null;
  const count=w===h?8:4;
  for(let swap=0;swap<(onlyWalls?1:2);swap++)for(let t=0;t<count;t++){
    const out=Array(w*h);
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){
      let nx=t&1?w-1-x:x,ny=t&2?h-1-y:y;
      if(t&4){const v=nx;nx=ny;ny=v;}
      let c=flat[y*w+x];if(onlyWalls)c=c==='#'?'#':'.';
      else if(swap)c=({A:'B',B:'A',a:'b',b:'a'})[c]||c;
      out[ny*w+nx]=c;
    }
    const key=w+'x'+h+':'+out.join('');if(best===null||key<best)best=key;
  }return best;
}
function assess(g,start){
  let id=start,prev=-1,forced=0,maxForced=0,decisions=0,branchSum=0,interactions=0,chain=0;
  let solo=0,away=0;const path=[],states=[start],brakes=new Set();
  while(g.dist[id]>0){
    const viable=new Set(),options=[];
    for(let d=0;d<4;d++){const v=g.next[id*4+d];if(v<0)continue;
      if(g.dist[v]>=0&&v!==prev)viable.add(v);
      if(g.dist[v]===g.dist[id]-1)options.push(d);
    }
    branchSum+=viable.size;
    if(viable.size>=2){decisions++;forced=0;}else{forced++;maxForced=Math.max(maxForced,forced);}
    // Among equally short routes, prefer variety and continuing decisions.
    options.sort((d,e)=>{
      function score(k){const v=g.next[id*4+k],outs=new Set();for(let j=0;j<4;j++){
        const z=g.next[v*4+j];if(z>=0&&z!==id&&g.dist[z]>=0)outs.add(z);
      }return outs.size-(path.length&&path[path.length-1]===DIRS[k]?.5:0);}
      return score(e)-score(d);
    });
    const d=options[0],next=g.next[id*4+d],a=id/g.B|0,b=id%g.B;
    if(a===g.n||b===g.n)solo++;
    else{
      const aa=g.glide(a,g.n,d),bb=g.glide(b,g.n,d),joint=g.pair(a,b,d);
      if(joint[0]!==aa){interactions++;brakes.add('B');}
      if(joint[1]!==bb){interactions++;brakes.add('A');}
    }
    function naive(v){let sum=0;for(let i=0;i<2;i++){const p=i?v%g.B:v/g.B|0;
      if(p<g.n)sum+=Math.abs(p%g.w-g.goals[i]%g.w)+Math.abs((p/g.w|0)-(g.goals[i]/g.w|0));}return sum;}
    if(naive(next)>naive(id))away++;
    chain+=g.chains[id*4+d];path.push(DIRS[d]);prev=id;id=next;states.push(id);
  }
  const par=path.length;
  const opening=[];for(let d=0;d<4;d++){const v=g.next[start*4+d];if(v>=0)opening.push(v);}
  const openingSafe=new Set(opening.filter(v=>g.dist[v]>=0)).size;
  let repeated=0;for(let k=4;k<path.length;k++)if(path[k]===path[k-4]&&path[k-1]===path[k-5])repeated++;
  return {par,path:path.join(''),states,decisions,decisionRate:decisions/par,branching:branchSum/par,
    maxForced,interactions,brakes:brakes.size,solo,away,chain,openingSafe,repeated:repeated/par,
    score:decisions/par*30+branchSum/par*12+Math.min(interactions,8)+Math.min(away,5)*2-maxForced*3-solo-repeated*1.5};
}
module.exports={graph,rows,canonical,assess,DIRS};
