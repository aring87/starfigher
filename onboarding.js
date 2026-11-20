/* First-earned guidance. The game supplies profile persistence and screen gates;
 * this controller owns only its small, pointer-transparent presentation. */
(() => {
  'use strict';
  const HINTS=Object.freeze({
    missile:{title:'MISSILES ONLINE',copy:'Missiles launch with your shots and steer toward enemies. Keep firing normally.'},
    bit:{title:'DEFENSE BIT ONLINE',copy:'The small drone guards above or below your fighter and blocks pink shots. Amber fire passes through it.'},
    shield:{title:'SHIELD READY',copy:'Each shield charge absorbs one hit. The SHIELD counter shows how many remain.'},
    delta:{title:'DELTA READY',copy:'Press Q at 100% DOSE to clear hostile fire and strike active boss cores. Kills and Force blocks refill the meter.'},
    gear:{title:'EQUIPMENT FOR YOUR GARAGE',copy:'Recovered gear stays with this pilot between runs. Equip it here, then launch or apply your changes to return to the fight.'},
    module:{title:'ONE FIELD MODULE',copy:'Choose one improvement for this run. Your recovered equipment is waiting in the Garage.'},
    doctrine:{title:'ONE DOCTRINE POINT',copy:'Spend this point on one available node to shape this run. Gear in the Garage is your lasting loadout.'},
    synergy:{title:'BUILD PAIR ACTIVE',copy:'Two equipped items now work together for an extra bonus. The Equipment Pairs panel shows the effect and its requirements.'}
  });
  const HINT_IDS=Object.freeze(Object.keys(HINTS)),VISIBLE_SECONDS=9;
  function injectStyle(doc){
    if(doc.getElementById('starfighter-onboarding-style'))return;
    const style=doc.createElement('style');style.id='starfighter-onboarding-style';
    style.textContent=`
      .sf-onboarding{position:absolute;inset:0;z-index:7;pointer-events:none;color:#e9f7ff;text-shadow:none;font-family:'Chakra Petch',system-ui,sans-serif}
      .sf-onboarding *{box-sizing:border-box}.sf-onboarding[hidden]{display:none!important}
      .sf-onboarding-card{position:absolute;left:2.6%;bottom:13%;width:min(350px,32%);padding:12px 14px;border:1px solid #456377;border-left:3px solid #7cdae2;background:#071420ee;box-shadow:0 8px 24px #0004;pointer-events:none;text-align:left}
      .sf-onboarding-card h3{margin:0 0 5px;color:#9ceaf1;font:700 10px/1.35 'Oxanium',system-ui,sans-serif;letter-spacing:.08em}
      .sf-onboarding-card p{margin:0;color:#c0d6e4;font-size:clamp(11px,1.02cqw,14px);line-height:1.45}
      .sf-onboarding-card button{pointer-events:auto;display:block;margin:8px 0 0 auto;padding:5px 9px;border:1px solid #4a7184;background:#112b3b;color:#e9faff;font:700 10px/1.3 'Oxanium',system-ui,sans-serif;letter-spacing:.04em;cursor:pointer}
      .sf-onboarding-card button:hover{background:#1a4050;border-color:#8be8ed}.sf-onboarding-card button:focus-visible{outline:2px solid #ffd166;outline-offset:3px}
      .sf-onboarding[data-inline='true']{position:relative;inset:auto;width:min(840px,94%);margin:6px auto;z-index:1}
      .sf-onboarding[data-inline='true'] .sf-onboarding-card{position:relative;inset:auto;width:100%;display:grid;grid-template-columns:1fr auto;column-gap:18px;align-items:center;padding:10px 14px;box-shadow:none}
      .sf-onboarding[data-inline='true'] h3,.sf-onboarding[data-inline='true'] p{grid-column:1}
      .sf-onboarding[data-inline='true'] button{grid-column:2;grid-row:1/3;margin:0;align-self:center}
      @media(max-width:650px){.sf-onboarding-card{width:42%;padding:8px 10px;bottom:14%}.sf-onboarding-card h3{font-size:8px}.sf-onboarding-card p{font-size:10px}.sf-onboarding-card button{font-size:8px;padding:4px 7px}.sf-onboarding[data-inline='true'] .sf-onboarding-card{padding:8px 10px;column-gap:10px}}
    `;
    doc.head.appendChild(style);
  }
  function create(options={}){
    const root=options.root||document.getElementById('game-shell')||document.body,doc=root.ownerDocument||document;
    injectStyle(doc);
    let host=null,active=null,queue=[],cooldown=0,disposed=false,copyElement=null;
    const retired=new Set();
    const call=(name,...args)=>{try{return typeof options[name]==='function'?options[name](...args):undefined}catch{return undefined}};
    let scope=call('getScope');
    const allowed=id=>call('isAllowed',id)===true;
    function seen(id){const values=call('getSeen');return Array.isArray(values)?values.includes(id):values instanceof Set&&values.has(id)}
    function removeHost(){if(!host)return;host.querySelector('button')?.blur?.();host.remove();host=null;copyElement=null;}
    function close(){removeHost();active=null;queue=[];cooldown=0;retired.clear();}
    function syncScope(){const next=call('getScope');if(next!==scope){close();scope=next;}}
    function anchor(id){const target=call('getAnchor',id);return target&&typeof target.appendChild==='function'?target:null;}
    function mount(){
      if(!active)return;
      const target=anchor(active.id);active.inline=!!target;
      if(!host){
        host=doc.createElement('aside');host.className='sf-onboarding';host.setAttribute('role','status');host.setAttribute('aria-live','polite');host.setAttribute('aria-atomic','true');host.dataset.hint=active.id;
        const card=doc.createElement('div'),title=doc.createElement('h3'),copy=doc.createElement('p'),button=doc.createElement('button');card.className='sf-onboarding-card';
        const hint=call('formatHint',HINTS[active.id])||HINTS[active.id];title.textContent=hint.title;copy.textContent=hint.copy;copyElement=copy;button.type='button';button.textContent='GOT IT';button.setAttribute('aria-label','Dismiss '+hint.title.toLowerCase());
        button.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();dismiss();button.blur?.();});card.append(title,copy,button);host.appendChild(card);
      }
      host.dataset.inline=String(active.inline);
      if(host.parentElement!==(target||root))(target||root).appendChild(host);
      active.shown=true;
    }
    function suspend(){if(!active)return;removeHost();queue.unshift(active);active=null;}
    function pump(){
      if(disposed)return;
      queue=queue.filter(item=>!seen(item.id)&&!retired.has(item.id));
      if(active&&(seen(active.id)||retired.has(active.id))){removeHost();active=null;}
      if(active&&!allowed(active.id))suspend();
      if(active){mount();return;}
      if(cooldown>0)return;
      const index=queue.findIndex(item=>allowed(item.id));
      if(index<0)return;
      active=queue.splice(index,1)[0];mount();
    }
    function retire(){
      const completed=active;removeHost();active=null;if(!completed?.shown)return;
      retired.add(completed.id);call('remember',completed.id);cooldown=completed.inline?0:.8;
    }
    function show(id){
      if(disposed||!Object.prototype.hasOwnProperty.call(HINTS,id))return false;
      syncScope();
      if(seen(id)||retired.has(id)||active?.id===id||queue.some(item=>item.id===id))return false;
      // The fixed catalogue also bounds pending guidance to eight unique hints.
      queue.push({id,elapsed:0,shown:false,inline:false});pump();return true;
    }
    function tick(dt=0){
      if(disposed)return;
      syncScope();pump();
      const seconds=Number.isFinite(dt)?Math.max(0,dt):0;
      if(active&&allowed(active.id)){
        active.elapsed+=seconds;
        // Decision notes stay in normal flow until acknowledgement or commit;
        // timed removal could otherwise move the option under a clicking hand.
        if(!active.inline&&active.elapsed>=VISIBLE_SECONDS)retire();
      }else if(queue.some(item=>allowed(item.id)))cooldown=Math.max(0,cooldown-seconds);
      pump();
    }
    function dismiss(){
      if(disposed)return false;
      syncScope();pump();
      if(!active?.shown||!host||!allowed(active.id))return false;
      retire();pump();return true;
    }
    function dispose(){close();disposed=true;}
    return{show,tick,dismiss,close,dispose,refreshInputHints(){if(copyElement&&active)copyElement.textContent=(call('formatHint',HINTS[active.id])||HINTS[active.id]).copy},get activeId(){syncScope();return active&&allowed(active.id)?active.id:null},get queuedIds(){syncScope();return queue.map(item=>item.id)}};
  }
  window.StarfighterOnboarding=Object.freeze({create,hintIds:HINT_IDS});
})();
