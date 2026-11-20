"""Build a private production-renderer gallery for all 38 encounter phases.

Each card waits for its textures, captures a pair, and retains only canvases.
Preparing every source simultaneously would thrash destruction's four-source
cache and could falsely present intact fallback as damaged artwork.
"""
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parent.parent
source = (ROOT / "game.js").read_text(encoding="utf-8")
CONTROLLER = r'''
  update=()=>{};loop=()=>{};
  soundtrack.pause();musicVolume=0;muted=true;sfx.setMuted(true);playMusic=()=>{};
  const rosterPanel=document.createElement('nav');rosterPanel.id='roster-controls';
  rosterPanel.innerHTML='<b>PRIVATE / DESTRUCTION ROSTER</b><label>FAMILY <select id="roster-family"><option value="all">ALL 22 ENCOUNTERS</option><option value="mini">10 MINI BOSSES</option><option value="main">10 MAIN BOSSES</option><option value="epic">2 SECRET BOSSES</option></select></label><label>PHASE <select id="roster-phase"><option value="all">ALL PHASES</option><option value="1">1</option><option value="2">2</option><option value="3">3</option><option value="4">4</option></select></label><button id="roster-prev">PREVIOUS POSE</button><button id="roster-next">NEXT POSE</button><button id="roster-motion">PLAY VISIBLE MOTION</button><button id="roster-refresh">RECAPTURE</button><label><input type="checkbox" id="roster-mini-cells">ALL 16 MINI ART CELLS</label><label><input type="checkbox" id="roster-flash">HIT FLASH</label><span id="roster-status" role="status">BUILDING 38 PHASE CARDS</span><output id="roster-summary" aria-live="polite">0 / 38 CAPTURED · 0 ERRORS</output>';
  document.body.appendChild(rosterPanel);
  const rosterMain=document.createElement('main');rosterMain.id='roster-main';rosterMain.innerHTML='<h1>Every enemy assembly / intact and all exterior parts removed</h1><p>Both sides use the same production pose and body painter. The right side sets only detachable assemblies to zero HP; surviving internal reactors retain their native housing. Bloodstar uses its original authored tentacle masks. No smoke, combat effects, player saves or rewards are included. Cards load and capture sequentially; retained canvases remain visible after source textures leave the cache. Motion updates visible cards only.</p><div id="roster-grid"></div>';document.body.appendChild(rosterMain);
  const rosterStyle=document.createElement('style');rosterStyle.textContent=`body::before{display:none!important}html,body{display:block!important;overflow:auto!important;background:#060c15!important;color:#d6e8f1!important;font:13px system-ui,sans-serif!important}#game-shell{display:none!important}#roster-controls{position:sticky;top:0;z-index:9999;padding:10px 14px;background:#102235;display:flex;align-items:center;flex-wrap:wrap;gap:10px;border-bottom:1px solid #49627a}#roster-controls label{display:flex;align-items:center;gap:6px;font-size:10px;color:#a5c5d7}#roster-controls select,#roster-controls button{padding:7px;background:#17364c;border:1px solid #4c6a83;color:#ecf8ff;font:700 10px system-ui}#roster-status{color:#f1cf8b;font:11px monospace}#roster-main{max-width:1900px;margin:auto;padding:16px}#roster-main h1{font-size:21px;margin:0 0 6px}#roster-main>p{max-width:1350px;line-height:1.55;color:#9ab4c5}#roster-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}.roster-card{border:1px solid #38546a;min-width:0;background:#0b1621;scroll-margin-top:110px}.roster-card[hidden]{display:none!important}.roster-card h2{font:700 14px system-ui;margin:0;padding:10px 12px;color:#d8f4fb}.roster-card .roster-pair{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:1px;background:#32485c}.roster-side{min-width:0;background:#0b1621}.roster-side h3{margin:0;padding:7px 10px;font:700 10px system-ui;letter-spacing:.08em;color:#8ecad8}.roster-side:last-child h3{color:#efbd83}.roster-side canvas{display:block;width:100%;height:auto;filter:none!important}.roster-meta{margin:0;padding:9px 12px;min-height:33px;color:#a6bac9;font:11px monospace;white-space:normal;overflow-wrap:anywhere}.roster-meta[data-state="error"]{color:#ff9f93}.roster-meta[data-state="ready"]{color:#95d8a4}.roster-card a{color:#91daed;text-decoration:none}.roster-card a:hover{text-decoration:underline}@media(max-width:1050px){#roster-grid{grid-template-columns:1fr}}`;
  document.head.appendChild(rosterStyle);
  const rosterJobs=[],rosterGrid=rosterMain.querySelector('#roster-grid'),rosterParams=new URLSearchParams(location.search);
  for(const[family,defs]of[['mini',miniBossDefs],['main',bossTypes],['epic',epicBossTypes]])defs.forEach((def,index)=>{
    const phases=family==='mini'?1:family==='epic'?4:2;
    for(let phase=1;phase<=phases;phase++){
      const card=document.createElement('article');card.className='roster-card';card.id=`roster-${family}-${index}-${phase}`;card.dataset.family=family;card.dataset.phase=phase;
      const heading=document.createElement('h2');heading.textContent=`${family.toUpperCase()} ${String(index+1).padStart(2,'0')} / ${def.name} / PHASE ${phase}`;card.appendChild(heading);
      const pair=document.createElement('div');pair.className='roster-pair';const canvases=[];
      for(const label of['INTACT / SAME POSE','ALL EXTERIOR ASSEMBLIES REMOVED']){const side=document.createElement('section');side.className='roster-side';const title=document.createElement('h3');title.textContent=label;const canvas=document.createElement('canvas');canvas.width=600;canvas.height=460;side.append(title,canvas);pair.appendChild(side);canvases.push(canvas)}
      const meta=document.createElement('p');meta.className='roster-meta';meta.textContent='WAITING FOR SEQUENTIAL CAPTURE';card.append(pair,meta);rosterGrid.appendChild(card);
      rosterJobs.push({family,index,phase,name:def.name,card,canvases,meta,ready:false});
    }
  });
  const familyFilter=rosterPanel.querySelector('#roster-family'),phaseFilter=rosterPanel.querySelector('#roster-phase'),status=rosterPanel.querySelector('#roster-status');
  if(['all','mini','main','epic'].includes(rosterParams.get('family')))familyFilter.value=rosterParams.get('family');if(['all','1','2','3','4'].includes(rosterParams.get('phase')))phaseFilter.value=rosterParams.get('phase');
  let rosterStep=Number(rosterParams.get('pose'))||0,rosterBusy=false,rosterMotion=false,rosterGeneration=0,rosterMotionTimer=null,rosterRecapture=false;
  const rosterPause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  function rosterFiltered(){return rosterJobs.filter(job=>(familyFilter.value==='all'||job.family===familyFilter.value)&&(phaseFilter.value==='all'||String(job.phase)===phaseFilter.value))}
  function rosterApplyFilters(){for(const job of rosterJobs)job.card.hidden=!rosterFiltered().includes(job);rosterUpdateStatus()}
  function rosterUpdateStatus(message=''){const selected=rosterFiltered(),ready=selected.filter(j=>j.ready).length;status.textContent=message||`${ready}/${selected.length} CARDS READY · POSE STEP ${Math.floor(rosterStep)%32+1}/32${rosterMotion?' · VISIBLE MOTION':''}`;rosterPanel.dataset.ready=String(rosterJobs.filter(j=>j.ready).length);rosterPanel.dataset.busy=String(rosterBusy);const captured=rosterJobs.filter(job=>job.ready).length,errors=rosterJobs.filter(job=>job.meta.dataset.state==='error').length;rosterPanel.dataset.errors=String(errors);rosterPanel.querySelector('#roster-summary').textContent=`${captured} / 38 CAPTURED · ${errors} ERRORS`;document.title=`Destruction roster ${captured}/38 · ${errors} errors`}
  function rosterEnemy(job){
    if(job.family==='mini')startMiniBossLab(job.index);else if(job.family==='main')startBossLab(job.index);else startEpicBossLab(job.index);
    const e=job.family==='mini'?miniBoss:boss;Object.assign(e,{phase:job.phase,x:0,y:0,intro:0,clock:0,hitFlash:0,phaseFlash:0,weakOpen:true,weakTelegraph:0,weakTimer:999,coreAperture:1,cool:99,hidden:false,visualAngle:0});
    e.nativeSeveredGroups={};e.pendingNativeSpriteParts=new Map();bossFragments=[];particles=[];debris=[];soundtrack.pause();sfx.setMuted(true);show('');$('#hud').classList.add('hidden');return e;
  }
  function rosterPose(e,step){
    const n=((step%32)+32)%32;e.clock=n*.125;e.hitFlash=rosterPanel.querySelector('#roster-flash').checked?.11:0;
    if(e.kind==='mini'){e.clock=n/(e.def.rate*.5);return rosterPanel.querySelector('#roster-mini-cells').checked?Math.floor(n)%16:undefined}
    if(e.epic)e.clock=(n+.02)/((3.35+e.phase*.14)*3);
    else if(e.type===0)e.clock=n/(e.phase===2?3.15:2.45);
    else if(e.type===1)e.clock=n/(e.phase===2?6.5:5);
    else if(e.type===2)e.clock=n/(e.phase===2?6.2:4.6);
    else if(e.type===3){const period=e.phase===2?1.25:1.3,frames=e.phase===2?4:8;e.cool=period*(1-((n%frames)+.02)/frames)}
    else if(e.type===4){const period=e.phase===2?.86:1.05;e.attackCycle=1;e.ironCycle=period*((n%8)+.02)/8}
    else if(e.type===5){let lo=0,hi=1;for(let i=0;i<24;i++){const p=(lo+hi)/2;if(p-Math.sin(p*Math.PI*2)*.055<(n+.02)/32)lo=p;else hi=p}e.chargeWindow=1.35*(1-(lo+hi)/2);e.voidAnimWindow=0}
    else{const rate=e.type===6?(e.phase===2?4.05:3.5):e.type===7?(e.phase===2?4:3.6):e.type===8?(e.phase===2?4.1:3.65):(e.phase===2?3.9:3.55);e.clock=(n+.02)/(rate*3)}
    return undefined;
  }
  function rosterSource(e){
    if(e.kind==='mini')return miniBossSpriteFor(e.type);
    if(e.epic||e.type>=5)return lateBossMaterialFrame(e).source;
    if(e.type===0)return bloodstarPhaseSprites[e.phase-1];if(e.type<=2)return bossSprites[e.type];
    if(e.type===3)return e.phase===1&&riftFrame(e)%2?riftPhase1InbetweenSprite:riftPhaseSprites[e.phase-1];
    return ironBloomFrame(e)%2?ironBloomInbetweenSprites[e.phase-1]:ironBloomPhaseSprites[e.phase-1];
  }
  async function rosterWait(e,job,token){
    const started=performance.now();
    while(token===rosterGeneration){
      const required=[];if(!e.epic&&e.kind==='boss'&&e.type===6){const between=bossInbetween32Asset(6,e.phase-1);if(between)required.push(between)}
      const source=rosterSource(e);required.push(source);
      const bloodstar=e.kind==='boss'&&!e.epic&&e.type===0;if(bloodstar)required.push(...bloodstarTentacleMasks[e.phase-1]);
      preloadAssets(required);const nativeReady=required.every(asset=>asset?.ready);
      if(nativeReady){if(bloodstar)return source;const module=window.StarfighterDestruction;if(!module?.has(source))throw new Error('PREPARED SOURCE NOT REGISTERED: '+source.sourcePath);module.preload(source);if(module.ready(source))return source}
      if(performance.now()-started>30000)throw new Error('TEXTURE READINESS TIMEOUT — original/core/parts/caps did not all load');
      job.meta.dataset.state='loading';job.meta.textContent='LOADING ORIGINAL + PREPARED CORE / PARTS / JOINT ART';await rosterPause(40);
    }
    throw new Error('Capture superseded');
  }
  function rosterPaint(e,canvas,broken,frame){
    const nodes=activeWeakNodes(e),saved=nodes.map(node=>({destroyed:node.destroyed,hp:node.hp})),destination=ctx;
    for(const node of nodes){const detachable=e.kind==='boss'&&!e.epic&&e.type===0?node.tentacleIndex>=0:!!nativeFractureBaseProfile(e,node,frame);node.destroyed=broken&&detachable;node.hp=node.destroyed?0:node.max;node.hitTime=-100;node.nativeDetached=node.destroyed}
    ctx=canvas.getContext('2d');ctx.save();
    try{ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,canvas.width,canvas.height);ctx.fillStyle='#08131f';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.strokeStyle='#193046';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(0,canvas.height/2+.5);ctx.lineTo(canvas.width,canvas.height/2+.5);ctx.moveTo(canvas.width/2+.5,0);ctx.lineTo(canvas.width/2+.5,canvas.height);ctx.stroke();ctx.translate(canvas.width/2,canvas.height/2);ctx.scale(1.48,1.48);applyEnemyPose(e,false);drawNativeFracturedBody(e,()=>paintNativeFractureBody(e,frame),frame)}finally{ctx.restore();ctx=destination;nodes.forEach((node,index)=>Object.assign(node,saved[index]))}
  }
  async function rosterCapture(job,step,token){
    const e=rosterEnemy(job),frame=rosterPose(e,step),source=await rosterWait(e,job,token);if(token!==rosterGeneration)return;
    rosterPaint(e,job.canvases[0],false,frame);rosterPaint(e,job.canvases[1],true,frame);job.ready=true;job.meta.dataset.state='ready';
    const groups=new Set(activeWeakNodes(e).map(node=>e.kind==='boss'&&!e.epic&&e.type===0?node.tentacleIndex>=0?'tentacle-'+node.tentacleIndex:null:nativeFractureBaseProfile(e,node,frame)?.groupId).filter(Boolean));
    const sourceName=source.sourcePath?.split('/').pop()||'native sprite';job.meta.textContent=`READY · POSE ${frame===undefined?inspectionFrame(e)+1:frame+1} · ${groups.size} DETACHED ASSEMBLIES · ${sourceName}`;
    const inspect=document.createElement('a');inspect.href=`artifacts/damage-sprite-preview.html?enemy=${job.family}:${job.index}&phase=${job.phase}`;inspect.target='_blank';inspect.rel='noopener';inspect.textContent=' · INSPECT COMBINATIONS';job.meta.appendChild(inspect);
  }
  async function rosterRun(jobs,step){
    if(rosterBusy){rosterRecapture=true;return}rosterBusy=true;const token=++rosterGeneration;rosterUpdateStatus(`CAPTURING ${jobs.length} CARDS SEQUENTIALLY`);
    for(let i=0;i<jobs.length;i++){const job=jobs[i];try{await rosterCapture(job,step,token)}catch(error){job.ready=false;job.meta.dataset.state='error';job.meta.textContent=error.message;console.warn('Roster preview:',job.family,job.index,job.phase,error)}rosterUpdateStatus(`CAPTURE ${i+1}/${jobs.length} · ${job.name} / PHASE ${job.phase}`);await rosterPause(0)}
    rosterBusy=false;rosterUpdateStatus();if(rosterRecapture){rosterRecapture=false;rosterRun(rosterFiltered(),rosterStep)}
  }
  function rosterVisible(){return rosterFiltered().filter(job=>{const r=job.card.getBoundingClientRect();return r.bottom>rosterPanel.getBoundingClientRect().bottom&&r.top<innerHeight})}
  function rosterStopMotion(){rosterMotion=false;clearTimeout(rosterMotionTimer);rosterPanel.querySelector('#roster-motion').textContent='PLAY VISIBLE MOTION';rosterUpdateStatus()}
  async function rosterAnimate(){if(!rosterMotion)return;if(!rosterBusy){rosterStep=(rosterStep+1)%32;await rosterRun(rosterVisible(),rosterStep)}rosterMotionTimer=setTimeout(rosterAnimate,125)}
  familyFilter.onchange=()=>{rosterStopMotion();rosterApplyFilters();if(rosterFiltered().some(job=>!job.ready))rosterRun(rosterFiltered(),rosterStep)};phaseFilter.onchange=familyFilter.onchange;
  for(const[id,delta]of[['#roster-prev',-1],['#roster-next',1]])rosterPanel.querySelector(id).onclick=()=>{rosterStopMotion();rosterStep=(rosterStep+delta+32)%32;rosterRun(rosterFiltered(),rosterStep)};
  rosterPanel.querySelector('#roster-refresh').onclick=()=>rosterRun(rosterFiltered(),rosterStep);
  rosterPanel.querySelector('#roster-motion').onclick=()=>{if(rosterMotion)rosterStopMotion();else{rosterMotion=true;rosterPanel.querySelector('#roster-motion').textContent='FREEZE MOTION';rosterAnimate()}};
  for(const id of['#roster-mini-cells','#roster-flash'])rosterPanel.querySelector(id).onchange=()=>rosterRun(rosterFiltered(),rosterStep);
  addEventListener('keydown',event=>{if(event.target.closest('input,select,button'))return;if(event.key==='ArrowRight'||event.key==='ArrowLeft'){event.preventDefault();rosterPanel.querySelector(event.key==='ArrowRight'?'#roster-next':'#roster-prev').click()}});
  rosterApplyFilters();rosterRun(rosterFiltered(),rosterStep);
'''
end = source.rfind('})();')
assert end >= 0
(ROOT / 'artifacts/destruction-roster-preview.js').write_text(source[:end] + CONTROLLER + source[end:], encoding='utf-8')
html = (ROOT / 'index.html').read_text(encoding='utf-8').replace('<head>', '<head><base href="../">', 1)
html = re.sub(r'<script src="game.js\?v=\d+"></script>', '<script src="artifacts/destruction-roster-preview.js?v=1"></script>', html)
assert 'artifacts/destruction-roster-preview.js' in html
memory = '<script>const rosterMemory=new Map([["starfighterMuted","true"]]);Object.defineProperty(window,"localStorage",{value:{getItem:k=>rosterMemory.get(k)??null,setItem:(k,v)=>rosterMemory.set(k,String(v)),removeItem:k=>rosterMemory.delete(k)}});</script>'
html = html.replace('<body>', '<body>' + memory, 1)
(ROOT / 'artifacts/destruction-roster-preview.html').write_text(html, encoding='utf-8')
print('Built private production destruction roster: 22 encounters, 38 phase cards.')
