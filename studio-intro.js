/* The One Ring Productions card that opens the game.
 *
 * Ported from restart/splash.gd in "Brayden & Malia's Wonder Worlds" (same timeline and drawing): a spark in the dark
 * stretches into gold and blue light streaks that swirl into the ring; the ring flips, slows and settles with its
 * reflection on a dark floor; a glow pulse, then the company name fades up under it. About 6 seconds. Any key, click
 * or controller button skips it (after 0.3 s). Art and sting are the owner's (assets/studio/README.txt).
 *
 * It plays on top of the title screen, so nothing waits on it; the game holds its menu music until it ends. It never
 * traps the player: if the pictures do not load in 4 seconds, or anything throws, it simply ends. With reduced motion
 * it shows a calm version (no spin, streaks or sparks). No network, no storage, no external script. */
(function(root,factory){
  'use strict';
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.StarfighterStudioIntro=api;
})(typeof window==='object'?window:null,function(){
  'use strict';
  const VIEW=Object.freeze({w:1920,h:1088}),CENTRE=Object.freeze({x:960,y:380}),RING_SIZE=470,FLOOR_Y=630,WORD_W=860;
  // Timeline in seconds, as in the original.
  const T=Object.freeze({SPARK_END:.7,STREAK_END:1.9,SETTLE:3.1,NAME_IN:3.3,NAME_FULL:4.3,OUT:5.6,DONE:6.3,SKIP_AFTER:.3,STING_LAND:2.1,LOAD_MS:4000});
  const SPIN=Math.PI*2*3,STING_GAIN=Math.pow(10,-8/20),SPAWN_PER_SECOND=180;
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const smoothstep=(from,to,x)=>{const k=clamp((x-from)/(to-from),0,1);return k*k*(3-2*k)};
  const spin=t=>{const k=clamp((t-(T.STREAK_END-.5))/(T.SETTLE-(T.STREAK_END-.5)),0,1);return SPIN*(1-Math.pow(1-k,3))};
  const ringAlpha=t=>clamp((t-(T.STREAK_END-.6))/.6,0,1);
  const nameAlpha=t=>smoothstep(T.NAME_IN,T.NAME_FULL,t);
  const fadeOut=t=>1-smoothstep(T.OUT,T.DONE-.1,t);
  function seeded(seed){let a=seed>>>0;return()=>{a=(a+0x6D2B79F5)>>>0;let t=a;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296}}
  const rgb=(c,a)=>`rgba(${c[0]},${c[1]},${c[2]},${clamp(a,0,1)})`;
  const GOLD=[255,191,89],BLUE=[115,179,255],BURST=[255,204,115];
  const lighten=(c,k)=>c.map(v=>Math.round(v+(255-v)*k));

  // The drawing and particles, with no browser objects, so every frame can be tested.
  function createScene(options={}){
    const calm=!!options.calm,rand=seeded(7),range=(a,b)=>a+rand()*(b-a);
    let t=0,carry=0,burst=false;const sparks=[],puffs=[];
    function spark(x,y,colour,speed=160){
      const dx=x-CENTRE.x,dy=y-CENTRE.y,len=Math.hypot(dx,dy)||1,m=range(.3,1);
      sparks.push({x,y,vx:(dx/len*m)*speed,vy:(dy/len*m-.3)*speed,life:range(.6,1.4),age:0,c:colour,r:range(1.5,4)});
    }
    function onRing(jitter){const angle=rand()*Math.PI*2,radius=RING_SIZE*.5*(jitter?range(.8,1.15):1);return[CENTRE.x+Math.cos(angle)*radius,CENTRE.y+Math.sin(angle)*radius]}
    function step(dt){
      dt=clamp(Number(dt)||0,0,.1);t+=dt;
      if(!calm){
        if(t>T.STREAK_END-.6&&t<T.SETTLE+.3){
          carry+=dt*SPAWN_PER_SECOND;
          while(carry>=1){carry--;const[x,y]=onRing(true);spark(x,y,rand()<.6?GOLD:BLUE)}
        }
        if(!burst&&t>=T.SETTLE){
          burst=true;
          for(let i=0;i<60;i++){const[x,y]=onRing(false);spark(x,y,BURST,380)}
          for(let i=0;i<14;i++)puffs.push({x:CENTRE.x+range(-320,320),y:FLOOR_Y+range(-20,10),vx:range(-40,40),vy:range(-30,-8),life:range(1.8,2.8),age:0,r:range(60,120)});
        }
      }
      for(let i=sparks.length-1;i>=0;i--){const s=sparks[i];s.age+=dt;s.x+=s.vx*dt;s.y+=s.vy*dt;const drag=Math.max(0,1-1.8*dt);s.vx*=drag;s.vy*=drag;if(s.age>=s.life)sparks.splice(i,1)}
      for(let i=puffs.length-1;i>=0;i--){const p=puffs[i];p.age+=dt;p.x+=p.vx*dt;p.y+=p.vy*dt;if(p.age>=p.life)puffs.splice(i,1)}
    }
    function glow(ctx,x,y,w,h,colour,alpha){
      if(!(alpha>.002))return;
      ctx.save();ctx.translate(x,y);ctx.scale(w/2,h/2);
      const g=ctx.createRadialGradient(0,0,0,0,0,1);g.addColorStop(0,rgb(colour,alpha));g.addColorStop(1,rgb(colour,0));
      ctx.fillStyle=g;ctx.fillRect(-1,-1,2,2);ctx.restore();
    }
    // ctx is already scaled so that the picture is VIEW.w x VIEW.h. images = {ring, word}.
    function draw(ctx,images){
      const fade=fadeOut(t),ra0=ringAlpha(t),ra=ra0*fade;
      ctx.fillStyle='rgb(3,3,6)';ctx.fillRect(0,0,VIEW.w,VIEW.h);
      glow(ctx,CENTRE.x,FLOOR_Y+20,1500,260,[64,115,230],.18*fade*ra0);
      if(t<T.STREAK_END){
        const k=clamp(t/T.SPARK_END,0,1),a=(1-smoothstep(T.STREAK_END-.5,T.STREAK_END,t))*fade;
        glow(ctx,CENTRE.x,CENTRE.y,60+260*k,18+30*k,[255,191,102],.9*a);glow(ctx,CENTRE.x,CENTRE.y,18,18,[255,255,255],a);
      }
      if(!calm&&t>T.SPARK_END*.6&&t<T.SETTLE+.2){
        const k=clamp((t-T.SPARK_END*.6)/(T.STREAK_END-T.SPARK_END*.6),0,1),a=(1-smoothstep(T.SETTLE-.5,T.SETTLE+.2,t))*fade;
        const r=40+(RING_SIZE*.5-40)*smoothstep(0,1,k),squash=.25+.75*k;
        ctx.lineCap='round';ctx.lineJoin='round';
        for(const[colour,offset]of[[[255,184,77],0],[[102,173,255],Math.PI]]){
          const start=t*7+offset,length=.6+1.6*k;ctx.beginPath();
          for(let i=0;i<24;i++){const ang=start+length*i/23,x=CENTRE.x+Math.cos(ang)*r,y=CENTRE.y+Math.sin(ang)*r*squash;if(i)ctx.lineTo(x,y);else ctx.moveTo(x,y)}
          for(const[width,alpha,col]of[[14,.25*a,colour],[4,.9*a,colour],[1.5,.8*a,[255,255,255]]]){ctx.lineWidth=width;ctx.strokeStyle=rgb(col,alpha);ctx.stroke()}
        }
      }
      const pulse=clamp(1-Math.abs(t-(T.SETTLE+.15))/.6,0,1)*fade;
      if(pulse>0)glow(ctx,CENTRE.x,CENTRE.y,RING_SIZE*1.9,RING_SIZE*1.9,[255,191,102],.3*pulse);
      if(ra>0&&images.ring){
        const angle=calm?0:spin(t),sx=Math.abs(Math.cos(angle))*.96+.04,tilt=calm?0:Math.sin(angle*.5)*.08,half=RING_SIZE/2;
        ctx.save();ctx.translate(CENTRE.x,CENTRE.y);ctx.rotate(tilt);ctx.scale(sx,1);ctx.globalAlpha=ra;ctx.drawImage(images.ring,-half,-half,RING_SIZE,RING_SIZE);ctx.restore();
        ctx.save();ctx.translate(CENTRE.x,FLOOR_Y+(FLOOR_Y-CENTRE.y));ctx.rotate(-tilt);ctx.scale(sx,-1);ctx.globalAlpha=.16*ra*(1-nameAlpha(t));ctx.drawImage(images.ring,-half,-half,RING_SIZE,RING_SIZE);ctx.restore();
        for(let i=0;i<10;i++){ctx.fillStyle=`rgba(3,3,6,${clamp(.1+i*.09,0,1)})`;ctx.fillRect(0,FLOOR_Y+30+i*26,VIEW.w,26)}
      }
      for(const p of puffs){const k=p.age/p.life;glow(ctx,p.x,p.y,p.r*(1+k),p.r*.55*(1+k),[115,153,242],Math.sin(k*Math.PI)*.18*fade)}
      for(const s of sparks){
        const a=(1-s.age/s.life)*fade;ctx.fillStyle=rgb(s.c,.25*a);ctx.beginPath();ctx.arc(s.x,s.y,s.r*2.2,0,Math.PI*2);ctx.fill();
        ctx.fillStyle=rgb(lighten(s.c,.4),a);ctx.beginPath();ctx.arc(s.x,s.y,s.r,0,Math.PI*2);ctx.fill();
      }
      const na=nameAlpha(t)*fade;
      if(na>0&&images.word){
        const h=WORD_W*images.word.height/images.word.width,rise=(1-nameAlpha(t))*24;
        ctx.save();ctx.globalAlpha=na;ctx.drawImage(images.word,CENTRE.x-WORD_W/2,FLOOR_Y+60+rise,WORD_W,h);ctx.restore();
      }
    }
    return{step,draw,get t(){return t},set t(value){t=value},get sparks(){return sparks.length},get puffs(){return puffs.length}};
  }

  function create(options={}){
    const win=options.window||null,doc=options.document||win?.document||null,cover=options.cover||null;
    if(!win||!doc||!cover)return null;
    const canvas=doc.createElement('canvas'),ctx=canvas.getContext?.('2d');
    if(!ctx)return null;
    const base=options.base||'assets/studio/',scene=createScene({calm:!!options.calm}),images={};
    const raf=options.raf||(fn=>win.requestAnimationFrame(fn)),caf=options.caf||(id=>win.cancelAnimationFrame?.(id));
    const timer=options.timers||{set:(fn,ms)=>win.setTimeout(fn,ms),clear:id=>win.clearTimeout(id)};
    const gain=()=>{const g=Number(options.volume?.());return Number.isFinite(g)?clamp(g,0,1):STING_GAIN};
    let running=false,finished=false,skipping=false,padArmed=false,frame=0,last=0,loadTimer=null,wallTimer=null,sting=null,stingStarted=false,hiddenPause=false;
    const listeners=[];
    const listen=(target,type,fn)=>{target?.addEventListener?.(type,fn,true);listeners.push(()=>target?.removeEventListener?.(type,fn,true))};
    function finish(){
      if(finished)return;finished=true;running=false;
      if(frame)caf(frame);if(loadTimer)timer.clear(loadTimer);if(wallTimer)timer.clear(wallTimer);listeners.forEach(fn=>{try{fn()}catch{}});
      try{sting?.pause?.()}catch{}sting=null;
      try{canvas.remove?.()}catch{}cover.hidden=true;
      try{options.onDone?.()}catch{}
    }
    function skip(){
      if(finished||skipping||scene.t<T.SKIP_AFTER)return false;
      skipping=true;scene.t=Math.max(scene.t,T.OUT);return true;
    }
    // Every key, click or touch while the card is up belongs to the card, not to the menu behind it.
    function onInput(event){try{event.stopImmediatePropagation?.()}catch{}if(!running&&!finished)finish();else skip()}
    function resize(){
      const dpr=clamp(Number(win.devicePixelRatio)||1,1,2),w=Math.max(1,Math.round((win.innerWidth||VIEW.w)*dpr)),h=Math.max(1,Math.round((win.innerHeight||VIEW.h)*dpr));
      if(canvas.width!==w)canvas.width=w;if(canvas.height!==h)canvas.height=h;
    }
    function paint(){
      resize();const s=Math.min(canvas.width/VIEW.w,canvas.height/VIEW.h);
      ctx.setTransform(1,0,0,1,0,0);ctx.fillStyle='rgb(3,3,6)';ctx.fillRect(0,0,canvas.width,canvas.height);
      ctx.setTransform(s,0,0,s,(canvas.width-VIEW.w*s)/2,(canvas.height-VIEW.h*s)/2);
      ctx.save();ctx.beginPath();ctx.rect(0,0,VIEW.w,VIEW.h);ctx.clip();scene.draw(ctx,images);ctx.restore();ctx.setTransform(1,0,0,1,0,0);
    }
    function pollPad(){
      const pads=guard(()=>win.navigator?.getGamepads?.()||[],[]);let pressed=false;
      for(const pad of pads)for(const b of pad?.buttons||[])if(b&&(b.pressed||b.value>.5))pressed=true;
      // A button already held when the card appears must be released once before it can skip.
      if(!pressed)padArmed=true;else if(padArmed)skip();
    }
    function startSting(){
      if(stingStarted||skipping||scene.t<T.SETTLE-T.STING_LAND)return;stingStarted=true;
      const g=gain();if(!(g>0))return;
      try{sting=options.makeAudio?options.makeAudio(base+'sting_one_ring.ogg'):new win.Audio(base+'sting_one_ring.ogg');sting.volume=g;const p=sting.play?.();p?.catch?.(()=>{})}catch{sting=null}
    }
    function tick(now){
      frame=0;if(!running||finished)return;
      try{
        const dt=last?(now-last)/1000:0;last=now;if(hiddenPause){frame=raf(tick);return}
        scene.step(dt);startSting();pollPad();
        if(sting&&scene.t>T.OUT)guard(()=>{sting.volume=gain()*Math.max(1-smoothstep(T.OUT,T.DONE-.1,scene.t),.001)});
        paint();
        if(scene.t>=T.DONE)return finish();
        frame=raf(tick);
      }catch{finish()}
    }
    function begin(){
      if(finished||running)return;running=true;if(loadTimer){timer.clear(loadTimer);loadTimer=null}
      cover.hidden=false;frame=raf(tick);
      // However slowly frames arrive, the card never outlives this: the menu music and the player are not kept waiting.
      wallTimer=timer.set(()=>{wallTimer=null;finish()},T.DONE*1000+8000);
    }
    function load(name,key){
      return new Promise(resolve=>{
        const loader=options.loadImage?options.loadImage(base+name):new Promise((ok,fail)=>{const img=new win.Image();img.onload=()=>ok(img);img.onerror=()=>fail(new Error('missing'));img.src=base+name});
        Promise.resolve(loader).then(img=>{images[key]=img;resolve(true)},()=>resolve(false));
      });
    }
    function start(){
      if(finished||running||loadTimer)return;
      canvas.setAttribute?.('aria-hidden','true');cover.append?.(canvas);cover.hidden=false;resize();paint();
      listen(win,'keydown',onInput);listen(win,'pointerdown',onInput);listen(win,'mousedown',onInput);listen(win,'touchstart',onInput);listen(win,'click',onInput);
      listen(doc,'visibilitychange',()=>{hiddenPause=!!doc.hidden;if(sting){if(hiddenPause)guard(()=>sting.pause());else if(!skipping)guard(()=>{const p=sting.play();p?.catch?.(()=>{})})}});
      loadTimer=timer.set(()=>{loadTimer=null;finish()},T.LOAD_MS);
      Promise.all([load('one_ring.png','ring'),load('one_ring_wordmark.png','word')]).then(ok=>{if(finished)return;if(ok.every(Boolean))begin();else finish()});
    }
    function guard(fn,fallback){try{return fn()}catch{return fallback}}
    return{start,skip,finish,get finished(){return finished},get running(){return running},get time(){return scene.t},scene};
  }
  return Object.freeze({create,createScene,timeline:T,spin,ringAlpha,nameAlpha,fadeOut,smoothstep,view:VIEW,stingGain:STING_GAIN});
});
