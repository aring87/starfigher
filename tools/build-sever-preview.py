from pathlib import Path
import re
root=Path(__file__).resolve().parent.parent
source=(root/'game.js').read_text(encoding='utf-8')
controls=r'''
  let severPreviewHeld=true,severPreviewAnimate=false,severPreviewTime=0;
  const previewUpdate=update;update=dt=>{if(!severPreviewHeld)previewUpdate(dt)};
  const panel=document.createElement('aside');panel.id='sever-preview-controls';panel.style.cssText='position:fixed;inset:0 0 auto;z-index:1001;padding:8px;background:#09121f;color:#d7e9f7;display:flex;gap:6px;align-items:center;font:12px sans-serif';
  panel.innerHTML='<b>PRIVATE PART STUDY</b><select aria-label="Part study enemy" id="sever-enemy"></select><button id="sever-load">LOAD</button><button id="sever-break">BREAK NEXT LIMB</button><button id="sever-step">NEXT POSES</button><button id="sever-play">PLAY MOTION</button><label><input type="checkbox" id="sever-flash">HIT FLASH</label><span id="sever-status"></span>';
  document.body.appendChild(panel);const select=panel.querySelector('select');
  for(const[family,defs]of[['mini',miniBossDefs],['main',bossTypes],['epic',epicBossTypes]])defs.forEach((def,index)=>{const option=document.createElement('option');option.value=family+':'+index;option.textContent=family.toUpperCase()+' / '+def.name;select.appendChild(option)});
  const sheet=document.createElement('canvas');sheet.width=1280;sheet.height=720;sheet.style.cssText='position:fixed;inset:40px 0 0;z-index:1000;width:100%;height:calc(100% - 40px);object-fit:contain;background:#0a1320';document.body.appendChild(sheet);const sheetCtx=sheet.getContext('2d');
  const updateStatus=()=>{const e=boss||miniBoss;panel.querySelector('#sever-status').textContent=e?e.def.name+' / '+activeWeakNodes(e).filter(n=>n.destroyed).length+' BROKEN':'READY'};
  function paintSeverSheet(){
    const e=boss||miniBoss;if(!e)return;sheetCtx.setTransform(1,0,0,1,0,0);sheetCtx.fillStyle='#0a1320';sheetCtx.fillRect(0,0,1280,720);sheetCtx.textAlign='center';sheetCtx.font='15px sans-serif';sheetCtx.fillStyle='#b5ccdf';sheetCtx.fillText(e.def.name+' / INTACT AND SEVERED AT IDENTICAL POSES',640,25);
    const nodes=activeWeakNodes(e),saved=nodes.map(n=>n.destroyed),clock=e.clock,hit=e.hitFlash,originalFrame=miniBossFrame,destination=ctx;
    try{
      for(let pose=0;pose<4;pose++)for(let broken=0;broken<2;broken++){
        const col=pose%2*2+broken,row=Math.floor(pose/2),x=col*320+160,y=row*330+205,frame=(pose*4+Math.floor(severPreviewTime*8))%16;
        e.clock=clock+pose*.37;e.hitFlash=panel.querySelector('#sever-flash').checked?.11:0;miniBossFrame=()=>frame;nodes.forEach((n,index)=>n.destroyed=broken?saved[index]:false);
        ctx=sheetCtx;ctx.save();ctx.translate(x,y);ctx.scale(1.6,1.6);drawNativeFracturedBody(e,()=>paintNativeFractureBody(e,frame),e.kind==='mini'?frame:undefined);ctx.restore();
        sheetCtx.fillStyle=broken?'#ffcc7a':'#8eece1';sheetCtx.font='13px monospace';sheetCtx.fillText((broken?'SEVERED':'INTACT')+' / POSE '+frame,x,y+130)
      }
    }finally{ctx=destination;miniBossFrame=originalFrame;e.clock=clock;e.hitFlash=hit;nodes.forEach((n,index)=>n.destroyed=saved[index])}
  }
  panel.querySelector('#sever-load').onclick=()=>{const[family,id]=select.value.split(':');if(family==='mini')startMiniBossLab(+id);else if(family==='main')startBossLab(+id);else startEpicBossLab(+id);const e=boss||miniBoss;Object.assign(e,{x:700,y:270,intro:0,clock:.5,cool:99,weakOpen:true,coreAperture:1,weakTimer:999});player.inv=1e6;severPreviewTime=0;updateStatus();paintSeverSheet()};
  panel.querySelector('#sever-break').onclick=()=>{const e=boss||miniBoss;if(!e)return;const nodes=activeWeakNodes(e),node=nodes.find(n=>!n.destroyed&&nativeFractureProfile(e,n));if(node){const group=nativeFractureProfile(e,node).groupId;for(const n of nodes)if(nativeFractureProfile(e,n)?.groupId===group)damageWeakNode(e,n,n.hp)}updateStatus();paintSeverSheet()};
  panel.querySelector('#sever-step').onclick=()=>{severPreviewTime+=.125;const e=boss||miniBoss;if(e)e.clock+=.125;paintSeverSheet()};panel.querySelector('#sever-play').onclick=()=>{severPreviewAnimate=!severPreviewAnimate;panel.querySelector('#sever-play').textContent=severPreviewAnimate?'FREEZE MOTION':'PLAY MOTION'};panel.querySelector('#sever-flash').onchange=paintSeverSheet;
  let lastSeverFrame=0;function previewLoop(now){if(severPreviewAnimate){const delta=Math.min(.05,(now-lastSeverFrame)/1000);severPreviewTime+=delta;const e=boss||miniBoss;if(e)e.clock+=delta}lastSeverFrame=now;paintSeverSheet();requestAnimationFrame(previewLoop)}requestAnimationFrame(previewLoop);
  select.value='mini:0';panel.querySelector('#sever-load').click();
'''
end=source.rfind('})();');source=source[:end]+controls+source[end:]
(root/'artifacts/sever-preview-game.js').write_text(source,encoding='utf-8')
html=(root/'index.html').read_text(encoding='utf-8').replace('<head>','<head><base href="../">',1)
html=re.sub(r'<script src="game.js\?v=\d+"></script>','<script src="artifacts/sever-preview-game.js?v=131"></script>',html)
memory='''<script>const memory=new Map();Object.defineProperty(window,'localStorage',{value:{getItem:k=>memory.get(k)??null,setItem:(k,v)=>memory.set(k,String(v)),removeItem:k=>memory.delete(k)}});</script>'''
html=html.replace('<body>','<body>'+memory,1)
(root/'artifacts/sever-preview.html').write_text(html,encoding='utf-8')
print('Built private animated part-removal comparison.')
