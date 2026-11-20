'use strict';

// Source-atlas coordinates only. These rules follow the visible reactor axis
// and whole wing roots, independently of the old combat fracture polygons.
const cache=new WeakMap();
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const families=[
  {name:'dorsal and ventral fins',radius:.18,axis:.082},
  {name:'crusher arches',radius:.17,axis:.09},
  {name:'pressure fins',radius:.172,axis:.09},
  {name:'prism wings',radius:.18,axis:.09},
  {name:'blade petals',radius:.166,axis:.085},
  {name:'jaw crests',radius:.18,axis:.095,mouth:true},
  {name:'relay wings',radius:.18,axis:.09},
  {name:'coronal crests',radius:.18,axis:.095,mouth:true},
  {name:'gravity fins',radius:.175,axis:.095},
  {name:'signal wings',radius:.18,axis:.09}
];
function bounds(record,tile){const col=tile%record.cols,row=Math.floor(tile/record.cols),ox=Math.round(col*record.cellW),oy=Math.round(row*record.cellH);return{ox,oy,W:Math.round((col+1)*record.cellW)-ox,H:Math.round((row+1)*record.cellH)-oy}}
function material(record,tile){
  let tiles=cache.get(record);if(!tiles){tiles=[];cache.set(record,tiles)}if(tiles[tile])return tiles[tile];
  const{W,H,ox,oy}=bounds(record,tile),N=W*H,labels=new Int32Array(N),queue=new Int32Array(N),components=[];labels.fill(-1);
  const alpha=p=>record.rgba[((oy+Math.floor(p/W))*record.width+ox+p%W)*4+3];
  for(let p=0;p<N;p++){
    if(labels[p]>=0||alpha(p)<96)continue;const id=components.length;let head=0,tail=1;queue[0]=p;labels[p]=id;
    while(head<tail){const q=queue[head++],x=q%W,y=Math.floor(q/W);for(let yy=y-1;yy<=y+1;yy++)for(let xx=x-1;xx<=x+1;xx++){if(xx<0||yy<0||xx>=W||yy>=H)continue;const at=yy*W+xx;if(labels[at]<0&&alpha(at)>=96){labels[at]=id;queue[tail++]=at}}}
    components.push({id,pixels:tail});
  }
  const main=components.sort((a,b)=>b.pixels-a.pixels)[0]?.id??-1,anchor=record.coreFrames[tile]?.point||[W/2,H/2],family=families[record.baseType]||families[0];
  let axisY=anchor[1],left=W,right=0;
  for(let y=18;y<H-5;y++)for(let x=0;x<W;x++)if(labels[y*W+x]===main){left=Math.min(left,x);right=Math.max(right,x)}
  if(right<=left){left=W*.08;right=W*.92}
  // In the alternate columns the whole cannon shifts substantially. Its
  // luminous tip gives the source axis directly; weak-node tracks alone are
  // insufficient for those perspectives.
  if(family.mouth){
    let top=H,bottom=0;for(let y=18;y<H-5;y++)for(let x=left;x<Math.min(W,left+W*.12);x++)if(labels[y*W+x]===main){top=Math.min(top,y);bottom=Math.max(bottom,y)}
    if(bottom>top)axisY=clamp((top+bottom)/2,anchor[1]-H*.24,anchor[1]+H*.24);
  }else{
    let weight=0,total=0;for(let y=Math.max(0,Math.floor(axisY-H*.16));y<Math.min(H,axisY+H*.16);y++)for(let x=left;x<Math.min(W,left+W*.075);x++){
      const p=y*W+x,at=((oy+y)*record.width+ox+x)*4;if(labels[p]!==main)continue;const light=Math.max(record.rgba[at],record.rgba[at+1],record.rgba[at+2]),dark=Math.min(record.rgba[at],record.rgba[at+1],record.rgba[at+2]);if(light<130||light-dark<35)continue;const w=(light-100)*record.rgba[at+3]/255;weight+=w;total+=(y+.5)*w;
    }
    if(weight)axisY=clamp(total/weight,anchor[1]-H*.14,anchor[1]+H*.14);
  }
  left=W;right=0;for(let y=Math.max(0,Math.floor(axisY-H*.095));y<Math.min(H,axisY+H*.095);y++)for(let x=0;x<W;x++)if(labels[y*W+x]===main){left=Math.min(left,x);right=Math.max(right,x)}
  if(right<=left){left=W*.08;right=W*.92}
  const centerX=(left+right)/2,radiusX=clamp((right-left)*.5+W*.025,W*.32,W*.46),radiusY=H*family.radius;
  return tiles[tile]={W,H,ox,oy,main,sourceLabels:labels,axisY,left,right,centerX,radiusX,radiusY,axisHalf:H*family.axis,family};
}
function classify(record,tile,x,y){
  const m=material(record,tile),xx=(x-m.centerX)/m.radiusX,yy=(y-m.axisY)/m.radiusY;
  if(xx*xx+yy*yy<=1||Math.abs(y-m.axisY)<m.axisHalf)return true;
  // These two families have a complete toothed firing jaw. Their severable
  // pieces are the dorsal/ventral blades behind the face, not the teeth.
  return !!m.family.mouth&&x<m.centerX-m.W*.12&&Math.abs(y-m.axisY)<m.H*.255;
}
function repairLabels(record,tile,labels,parts){
  const m=material(record,tile),{W,H,ox,oy}=m,N=W*H,queue=new Int32Array(N),seen=new Uint8Array(N),components=[];
  const alpha=p=>record.rgba[((oy+Math.floor(p/W))*record.width+ox+p%W)*4+3];
  const active=parts.map((part,index)=>({part,index,frame:part.frames[tile]})).filter(p=>p.frame),sideOwner=y=>{
    const side=y<m.axisY?-1:1,candidates=active.filter(p=>(p.frame.seed[1]<m.axisY?-1:1)===side);return(candidates.length?candidates:active).reduce((best,p)=>!best||Math.abs(p.frame.seed[1]-y)<Math.abs(best.frame.seed[1]-y)?p:best,null)?.index??-1;
  };
  for(let p=0;p<N;p++){
    if(labels[p]!==-1||seen[p]||alpha(p)<96)continue;let head=0,tail=1,sumY=0;queue[0]=p;seen[p]=1;const pixels=[];
    while(head<tail){const q=queue[head++],x=q%W,y=Math.floor(q/W);pixels.push(q);sumY+=y;for(let yy=y-1;yy<=y+1;yy++)for(let xx=x-1;xx<=x+1;xx++){if(xx<0||yy<0||xx>=W||yy>=H)continue;const at=yy*W+xx;if(!seen[at]&&labels[at]===-1&&alpha(at)>=96){seen[at]=1;queue[tail++]=at}}}
    components.push({pixels,y:sumY/tail});
  }
  components.sort((a,b)=>b.pixels.length-a.pixels.length);
  for(const component of components.slice(1)){
    // A separate muzzle glow is intentional; preserve the whole firing tip.
    if(component.pixels.every(p=>p%W<m.centerX&&(Math.abs(Math.floor(p/W)-m.axisY)<=m.axisHalf||m.family.mouth&&p%W<m.centerX-m.W*.12&&Math.abs(Math.floor(p/W)-m.axisY)<m.H*.255)))continue;
    const owner=sideOwner(component.y);if(owner<0)continue;
    for(const p of component.pixels)labels[p]=owner;
    // Carry the native antialias fringe with its material chip. Do not cross
    // any other solid component or reassign the neighboring hull.
    for(const p of component.pixels){const x=p%W,y=Math.floor(p/W);for(let yy=Math.max(0,y-2);yy<=Math.min(H-1,y+2);yy++)for(let xx=Math.max(0,x-2);xx<=Math.min(W-1,x+2);xx++){const q=yy*W+xx;if(labels[q]===-1&&alpha(q)<96&&alpha(q)>0)labels[q]=owner;}}
  }
  // Native edge spill is assigned to the wing on that side, never a core
  // remnant. Intact reconstruction remains byte-for-byte reversible.
  for(let p=0;p<N;p++)if(labels[p]===-1&&m.sourceLabels[p]!==m.main&&alpha(p)>0){const y=Math.floor(p/W);if(y<18||y>=H-5||p%W<3||p%W>=W-3){const owner=sideOwner(y);if(owner>=0)labels[p]=owner;}}
  // Use the visible distal material to orient the cap outboard. A weak-node
  // center may be deliberately inside its armor root, especially ventrally.
  for(const item of active){let n=0,x=0,y=0;for(let p=0;p<N;p++)if(labels[p]===item.index&&alpha(p)>=128&&m.sourceLabels[p]===m.main){n++;x+=p%W+.5;y+=Math.floor(p/W)+.5;}if(n){item.frame.seed=[x/n,y/n];}}
}
module.exports={classify,repairLabels,describe:(record,tile)=>{const m=material(record,tile);return{axisY:m.axisY,centerX:m.centerX,radiusX:m.radiusX,radiusY:m.radiusY,axisHalf:m.axisHalf,left:m.left,right:m.right,family:m.family.name}}};
