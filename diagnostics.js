/* Opt-in, local-only performance diagnostics for playtests.
 *
 * When switched on in Flight Manual, this records frame timing, hitch context, memory
 * samples and script errors in memory, autosaves a compact copy to this browser
 * profile, and exports it ONLY when the player presses SAVE FILE or COPY TEXT.
 * Nothing is sent anywhere. Saves, pilot names, equipment, file paths and the page
 * address are never read. Every public method swallows its own errors so diagnostics
 * can never interrupt the game loop. It is inert (and its controls hidden) inside the
 * isolated Flight School practice document. */
(function(root,factory){
  'use strict';
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.StarfighterDiagnostics=api;
})(typeof window==='object'?window:null,function(){
  'use strict';
  const SCHEMA=1,ENABLED_KEY='starfighterDiagnostics',SESSIONS_KEY='starfighterDiagnosticsSessions';
  const LIMITS=Object.freeze({recent:100,worst:40,encounters:120,errors:20,heap:240,sessions:5,storedBytes:150000});
  // A hitch is an interval of two or more 60 Hz frames, or one frame whose own work is long.
  // Intervals up to GAP_MS are real stalls and are recorded (a 3 s freeze is the most important hitch to see).
  // Longer gaps mean sleep or a debugger; hidden pages reset the clock explicitly (see listen()).
  const SLOW_INTERVAL_MS=34,SLOW_WORK_MS=20,GAP_MS=10000,MARK_WINDOW_MS=5000,AUTOSAVE_MS=20000,HEAP_MS=15000;
  const PRIVACY='Frame timing, hitch context, memory samples and script errors only. No saves, names, equipment, file paths or page address. Stored on this computer and exported only by the player.';
  const round=(value,digits=1)=>{const p=10**digits;return Math.round(value*p)/p};
  const clip=(value,limit=200)=>String(value??'').slice(0,limit);
  const fileOnly=value=>clip(String(value||'').split(/[?#]/)[0].split(/[\\/]/).pop(),80);
  const hist=(step,max)=>({step,counts:new Uint32Array(Math.ceil(max/step)+1),total:0});
  function add(h,value){const i=Math.min(h.counts.length-1,Math.max(0,Math.floor(value/h.step)));h.counts[i]++;h.total++}
  function quantile(h,q){
    if(!h.total)return null;const target=Math.max(1,Math.ceil(h.total*q));let run=0;
    for(let i=0;i<h.counts.length;i++){run+=h.counts[i];if(run>=target)return round(i*h.step,2)}
    return null;
  }
  function sparse(h){const out=[];for(let i=0;i<h.counts.length;i++)if(h.counts[i])out.push([round(i*h.step,2),h.counts[i]]);return out}
  const stats=(h,max)=>({count:h.total,p50:quantile(h,.5),p95:quantile(h,.95),p99:quantile(h,.99),max:round(max,2),histogram:sparse(h)});
  const newSession=(id,startedAt,startNow)=>({id,startedAt,startNow,frames:0,visibleMs:0,interval:hist(1,200),draw:hist(.25,50),update:hist(.25,50),
    max:{interval:0,draw:0,update:0},slow:{ms34:0,ms50:0,ms100:0,work20:0},recent:[],worst:[],encounters:new Map(),marks:{},heap:[],errors:[],errorCount:0});
  function serialize(s,now){
    const encounters={};
    for(const[key,e]of s.encounters)encounters[key]={frames:e.frames,meanInterval:round(e.intervalSum/Math.max(1,e.frames),2),meanDraw:round(e.drawSum/Math.max(1,e.frames),2),
      meanUpdate:round(e.updateSum/Math.max(1,e.frames),2),slow34:e.slow34,slow50:e.slow50,worstInterval:round(e.worstInterval,1),worstDraw:round(e.worstDraw,1)};
    const used=s.heap.map(h=>h.usedMB);
    return{schema:SCHEMA,id:s.id,startedAt:s.startedAt,durationSec:round((now-s.startNow)/1000,1),playedSec:round(s.visibleMs/1000,1),frames:s.frames,
      interval:stats(s.interval,s.max.interval),draw:stats(s.draw,s.max.draw),update:stats(s.update,s.max.update),
      slow:{...s.slow,perMinuteOver34:s.visibleMs?round(s.slow.ms34/(s.visibleMs/60000),2):0},
      encounters,marks:{...s.marks},heap:{samples:s.heap.slice(),firstMB:used[0]??null,lastMB:used.at(-1)??null,maxMB:used.length?Math.max(...used):null},
      worst:s.worst.slice(),recent:s.recent.slice(),errorCount:s.errorCount,errors:s.errors.slice()};
  }
  function create(options={}){
    const win=options.window||null,doc=options.document||win?.document||null,store=options.storage||null,sandbox=!!options.sandbox;
    const now=options.now||(()=>win?.performance?.now?.()??Date.now()),version=clip(options.version||'dev',24);
    let enabled=false,session=null,previous=[],contextFn=null,keyFn=null,settingsFn=null,envFn=null;
    let lastFrame=0,lastHeap=0,lastSave=0,marks={},listening=false;
    const guard=(fn,fallback)=>{try{return fn()}catch{return fallback}};
    const read=key=>guard(()=>store?.getItem(key),null);
    const write=(key,value)=>guard(()=>{store?.setItem(key,value);return true},false);
    function loadPrevious(){
      const list=guard(()=>JSON.parse(read(SESSIONS_KEY)||'[]'),[]);
      return(Array.isArray(list)?list:[]).filter(s=>s&&typeof s==='object'&&s.schema===SCHEMA&&Number.isFinite(s.id)).slice(-(LIMITS.sessions-1));
    }
    function persist(){
      if(!store||!session)return false;
      return guard(()=>{
        let list=[...previous,serialize(session,now())].slice(-LIMITS.sessions),text=JSON.stringify(list);
        if(text.length>LIMITS.storedBytes){list=list.map(s=>({...s,recent:[]}));text=JSON.stringify(list)}
        while(text.length>LIMITS.storedBytes&&list.length>1){list.shift();text=JSON.stringify(list)}
        return write(SESSIONS_KEY,text);
      },false);
    }
    // Errors raised by the optional Spotify player are never recorded: the log must hold no Spotify data of any kind.
    const fromSpotify=event=>/spotify|scdn\.co/i.test(`${event?.message||''} ${event?.filename||''} ${event?.error?.message||''} ${event?.reason?.message||event?.reason||''}`);
    function onError(event){
      if(!enabled||!session||guard(()=>fromSpotify(event),false))return;
      guard(()=>{
        session.errorCount++;if(session.errors.length>=LIMITS.errors)return;
        session.errors.push({t:round((now()-session.startNow)/1000,1),message:clip(event?.message||event?.error?.message||event?.reason?.message||event?.reason),file:fileOnly(event?.filename),line:Number.isFinite(event?.lineno)?event.lineno:null});
      });
    }
    function listen(){
      if(listening||!win?.addEventListener)return;listening=true;
      win.addEventListener('error',onError);win.addEventListener('unhandledrejection',onError);
      win.addEventListener('pagehide',()=>{if(enabled)persist()});
      doc?.addEventListener?.('visibilitychange',()=>{if(doc.visibilityState==='hidden'){lastFrame=0;if(enabled)persist()}});
    }
    function start(){
      previous=loadPrevious();
      const t=now();session=newSession((previous.at(-1)?.id||0)+1,new Date().toISOString(),t);
      lastFrame=0;lastHeap=lastSave=t;marks={};listen();
    }
    function sinceMarks(t){
      const out={};for(const name of Object.keys(marks)){const dt=t-marks[name];if(dt>=0&&dt<=MARK_WINDOW_MS)out[name]=Math.round(dt)}
      return out;
    }
    function recordSlow(event){
      session.recent.push(event);if(session.recent.length>LIMITS.recent)session.recent.shift();
      const score=Math.max(event.interval,event.draw,event.update),w=session.worst;
      let at=w.length;while(at>0&&Math.max(w[at-1].interval,w[at-1].draw,w[at-1].update)<score)at--;
      if(at<LIMITS.worst){w.splice(at,0,event);if(w.length>LIMITS.worst)w.pop()}
    }
    function frame(nowMs,updateMs,drawMs){
      if(!enabled||sandbox||!session)return;
      guard(()=>{
        const previousFrame=lastFrame;lastFrame=nowMs;if(!previousFrame)return;
        const interval=nowMs-previousFrame;if(!(interval>0)||interval>GAP_MS)return;
        const s=session,u=Math.max(0,+updateMs||0),d=Math.max(0,+drawMs||0);
        s.frames++;s.visibleMs+=interval;add(s.interval,interval);add(s.draw,d);add(s.update,u);
        if(interval>s.max.interval)s.max.interval=interval;if(d>s.max.draw)s.max.draw=d;if(u>s.max.update)s.max.update=u;
        let key=clip(guard(()=>keyFn?.(),'')||'unknown',48),e=s.encounters.get(key);
        if(!e){if(s.encounters.size>=LIMITS.encounters)key='other',e=s.encounters.get(key);if(!e){e={frames:0,intervalSum:0,drawSum:0,updateSum:0,slow34:0,slow50:0,worstInterval:0,worstDraw:0};s.encounters.set(key,e)}}
        e.frames++;e.intervalSum+=interval;e.drawSum+=d;e.updateSum+=u;if(interval>e.worstInterval)e.worstInterval=interval;if(d>e.worstDraw)e.worstDraw=d;
        if(interval>=SLOW_INTERVAL_MS){s.slow.ms34++;e.slow34++}if(interval>=50){s.slow.ms50++;e.slow50++}if(interval>=100)s.slow.ms100++;
        if(d>=SLOW_WORK_MS||u>=SLOW_WORK_MS)s.slow.work20++;
        if(interval>=SLOW_INTERVAL_MS||d>=SLOW_WORK_MS||u>=SLOW_WORK_MS)
          recordSlow({t:round((nowMs-s.startNow)/1000,1),interval:round(interval,1),draw:round(d,1),update:round(u,1),key,sinceMark:sinceMarks(nowMs),ctx:guard(()=>contextFn?.(),null)});
        if(nowMs-lastHeap>=HEAP_MS){
          lastHeap=nowMs;const memory=win?.performance?.memory;
          if(memory&&Number.isFinite(memory.usedJSHeapSize)&&s.heap.length<LIMITS.heap)s.heap.push({t:round((nowMs-s.startNow)/1000,0),usedMB:round(memory.usedJSHeapSize/1048576,1),totalMB:round((memory.totalJSHeapSize||0)/1048576,1)});
        }
        if(nowMs-lastSave>=AUTOSAVE_MS){lastSave=nowMs;persist()}
      });
    }
    function environment(){
      const nav=win?.navigator||{},scr=win?.screen||{};
      return{userAgent:clip(nav.userAgent,240),cpuThreads:nav.hardwareConcurrency??null,deviceMemoryGB:nav.deviceMemory??null,
        screen:[scr.width??null,scr.height??null],window:[win?.innerWidth??null,win?.innerHeight??null],pixelRatio:win?.devicePixelRatio??null,
        ...(guard(()=>envFn?.(),null)||{})};
    }
    function snapshot(){
      const t=now();
      return{schema:SCHEMA,app:'Starfighter: Last Signal',build:version,generatedAt:new Date().toISOString(),privacy:PRIVACY,environment:environment(),
        settings:guard(()=>settingsFn?.(),null)||{},recording:enabled,sessions:[...previous,...(session?[serialize(session,t)]:[])]};
    }
    const exportText=()=>JSON.stringify(snapshot(),null,1);
    function fileName(){
      const d=new Date(),p=n=>String(n).padStart(2,'0');
      return `starfighter-diagnostics-${version}-${d.getFullYear()}${p(d.getMonth()+1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.json`;
    }
    function download(text,name){
      if(options.download)return options.download(text,name);
      return guard(()=>{
        const blob=new win.Blob([text],{type:'application/json'}),url=win.URL.createObjectURL(blob),link=doc.createElement('a');
        link.href=url;link.download=name;link.style.display='none';doc.body.append(link);link.click();link.remove();
        win.setTimeout(()=>win.URL.revokeObjectURL(url),2000);return true;
      },false);
    }
    function save(){if(sandbox)return null;persist();const text=exportText(),name=fileName();return{ok:!!download(text,name),name,bytes:text.length}}
    async function copy(){
      if(sandbox)return false;const text=exportText();
      try{if(win?.navigator?.clipboard?.writeText){await win.navigator.clipboard.writeText(text);return true}}catch{}
      return guard(()=>{
        const area=doc.createElement('textarea');area.value=text;area.style.position='fixed';area.style.opacity='0';doc.body.append(area);area.select();
        const ok=doc.execCommand('copy');area.remove();return !!ok;
      },false);
    }
    function setEnabled(value){
      if(sandbox)return false;value=!!value;
      if(value&&!enabled){enabled=true;write(ENABLED_KEY,'1');start()}
      else if(!value&&enabled){persist();enabled=false;write(ENABLED_KEY,'0')}
      return enabled;
    }
    function clear(){
      previous=[];guard(()=>store?.removeItem(SESSIONS_KEY));
      if(enabled){const t=now();session=newSession(1,new Date().toISOString(),t);lastFrame=0;marks={}}else session=null;
    }
    function describe(){
      if(sandbox)return'Not available in practice.';
      if(!enabled)return previous.length?`Off. ${previous.length} earlier session${previous.length===1?'':'s'} stored on this computer.`:'Off. Turn on before playing, then send the saved file with your feedback.';
      const s=session;return`Recording: ${s.frames} frames, ${s.slow.ms34} hitches over 34 ms, worst ${round(s.max.interval,0)} ms.${previous.length?` ${previous.length} earlier session${previous.length===1?'':'s'} kept.`:''}`;
    }
    function bind(document=doc){
      const find=id=>guard(()=>document?.getElementById(id),null),group=find('diagnostics-group'),box=find('diagnostics-enabled'),status=find('diagnostics-status');
      let hold=0;const say=(text,keep=false)=>{if(status)status.textContent=text;if(keep)hold=now()+8000};
      if(sandbox){if(group)group.hidden=true;return false}
      if(box){box.checked=enabled;box.addEventListener?.('change',()=>{box.checked=setEnabled(box.checked);say(describe())})}
      find('diagnostics-save')?.addEventListener?.('click',()=>{const r=save();say(r?.ok?`Saved ${r.name} (${Math.max(1,Math.round(r.bytes/1024))} KB). Send it with your feedback.`:'Could not save a file. Try COPY TEXT instead.',true)});
      find('diagnostics-copy')?.addEventListener?.('click',async()=>say(await copy()?'Copied. Paste it into a message or a text file.':'Could not copy. Try SAVE FILE instead.',true));
      find('diagnostics-clear')?.addEventListener?.('click',()=>{clear();say('Cleared. '+describe(),true)});
      // Keep the live counts fresh while Flight Manual is open, without overwriting a recent button message.
      win?.setInterval?.(()=>{if(!status||now()<hold)return;const text=describe();if(status.textContent!==text)status.textContent=text},2000);
      say(describe());return true;
    }
    if(!sandbox&&read(ENABLED_KEY)==='1'){enabled=true;start()}
    return{
      get active(){return enabled&&!sandbox},get enabled(){return enabled},get sandbox(){return sandbox},
      setEnabled,frame,idle(){lastFrame=0},
      mark(name){if(enabled&&!sandbox)guard(()=>{marks[clip(name,24)]=now();if(session)session.marks[clip(name,24)]=(session.marks[clip(name,24)]||0)+1})},
      setContext(context){contextFn=typeof context==='function'?context:null},setKey(fn){keyFn=typeof fn==='function'?fn:null},
      setSettings(fn){settingsFn=typeof fn==='function'?fn:null},setEnvironment(fn){envFn=typeof fn==='function'?fn:null},
      snapshot,exportText,save,copy,clear,describe,bind,persist,fileName,
    };
  }
  return Object.freeze({create,schema:SCHEMA,limits:LIMITS,slowIntervalMs:SLOW_INTERVAL_MS,slowWorkMs:SLOW_WORK_MS,keys:Object.freeze({enabled:ENABLED_KEY,sessions:SESSIONS_KEY})});
});
