/* Controls editor and controller menu focus. Input preferences are owned by the game. */
(() => {
  'use strict';
  const B=window.StarfighterBindings;
  const actionable='button,input,select,summary,a[href]';
  function available(el){
    if(el.disabled||el.matches?.(':disabled')||el.closest('[hidden],[inert],[aria-hidden="true"],[aria-disabled="true"]')||!el.getClientRects().length)return false;
    const style=getComputedStyle(el);if(style.display==='none'||['hidden','collapse'].includes(style.visibility))return false;
    for(let parent=el.parentElement;parent;parent=parent.parentElement)if(parent.tagName==='DETAILS'&&!parent.open&&el!==parent.querySelector('summary'))return false;
    return true;
  }
  function targets(root){
    const all=Array.from(root.querySelectorAll(actionable+',[tabindex]')).filter(el=>available(el)&&(el.matches(actionable)||el.tabIndex>=0));
    // Empty inventory regions remain useful navigation anchors after the final item is removed.
    return all.filter(el=>el.matches(actionable)||!all.some(child=>child!==el&&el.contains(child)));
  }
  function focus(el){el?.focus({preventScroll:true});el?.scrollIntoView?.({block:'nearest',inline:'nearest',behavior:'instant'});return el}
  function focusFirst(root){const all=targets(root);return focus(all.find(el=>el.classList.contains('primary'))||all[0])}
  function adjust(el,direction){
    const sign=direction==='left'?-1:1;
    if(el.tagName==='SELECT'){
      const options=Array.from(el.options).filter(o=>!o.disabled&&!o.hidden&&!o.parentElement?.disabled),current=options.indexOf(el.selectedOptions[0]),next=Math.max(0,Math.min(options.length-1,current+sign)),value=options[next]?.value;
      if(value!==undefined&&value!==el.value){el.value=value;el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}))}return true;
    }
    if(el.tagName==='INPUT'&&el.type==='range'){
      const min=Number(el.min||0),max=Number(el.max||100),step=Number(el.step)||1,value=el.value;
      el.value=String(Number(Math.max(min,Math.min(max,Number(value)+step*sign)).toPrecision(12)));
      if(el.value!==value){el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}))}return true;
    }
    return false;
  }
  function scrollRegion(el,root){
    for(let parent=el.parentElement;parent&&parent!==root;parent=parent.parentElement){const style=getComputedStyle(parent);if(/auto|scroll/.test(style.overflowY||style.overflow)&&parent.scrollHeight>parent.clientHeight)return parent}
    return null;
  }
  function navigationRect(el,root,verticalRegion=null){
    const source=el.getBoundingClientRect(),rect={left:source.left,right:source.right,top:source.top,bottom:source.bottom};
    for(let parent=el.parentElement;parent&&parent!==root;parent=parent.parentElement){
      const style=getComputedStyle(parent),clip=parent.getBoundingClientRect();
      if(/auto|scroll|hidden|clip/.test(style.overflowX||style.overflow)){rect.left=Math.max(rect.left,clip.left);rect.right=Math.min(rect.right,clip.right)}
      if(!verticalRegion&&/auto|scroll|hidden|clip/.test(style.overflowY||style.overflow)){rect.top=Math.max(rect.top,clip.top);rect.bottom=Math.min(rect.bottom,clip.bottom)}
    }
    return rect.right>rect.left&&rect.bottom>rect.top?rect:null;
  }
  function navigate(root,direction){
    if(!root)return;const all=targets(root),active=(root.ownerDocument||document).activeElement;
    if(!all.includes(active))return focusFirst(root);
    if(['left','right'].includes(direction)&&adjust(active,direction))return;
    const vertical=['up','down'].includes(direction),sign=['up','left'].includes(direction)?-1:1,region=vertical?scrollRegion(active,root):null;
    function choose(local){
      const rect=navigationRect(active,root,local?region:null)||active.getBoundingClientRect(),x=(rect.left+rect.right)/2,y=(rect.top+rect.bottom)/2;let best=null,bestScore=Infinity,bestBeam=false;
      for(const el of all){
        if(el===active||local&&scrollRegion(el,root)!==region)continue;const r=navigationRect(el,root,local?region:null);if(!r)continue;
        const dx=(r.left+r.right)/2-x,dy=(r.top+r.bottom)/2-y,forward=(vertical?dy:dx)*sign,side=Math.abs(vertical?dx:dy);if(forward<2)continue;
        const overlap=vertical?Math.min(rect.right,r.right)-Math.max(rect.left,r.left):Math.min(rect.bottom,r.bottom)-Math.max(rect.top,r.top),beam=overlap>1;
        const score=beam?forward+side*.25:forward+side*2+side*side/Math.max(20,forward);
        if(beam&&!bestBeam||beam===bestBeam&&score<bestScore){best=el;bestScore=score;bestBeam=beam}
      }
      return best;
    }
    // Finish the current scroll column before moving to actions outside it.
    const best=region&&choose(true)||choose(false);
    if(best)focus(best);
  }
  function activate(root){if(!root)return;const all=targets(root),active=(root.ownerDocument||document).activeElement;if(!all.includes(active)){focusFirst(root);return}if(active.tagName==='SELECT'){adjust(active,'right');return}if(active.matches(actionable)&&(active.tagName!=='INPUT'||['checkbox','radio','button'].includes(active.type)))active.click()}
  function create(options){
    const host=options.host,doc=host.ownerDocument||document;host.classList.add('controls-dialog');host.setAttribute('aria-label','Keyboard and controller controls');
    let device='keyboard',capture=null,captureReady=false,opened=false,status=null,table=null,captureBox=null,connection=null,lastConnection='';
    const node=(parent,tag,text,cls)=>{const el=doc.createElement(tag);if(text!==undefined)el.textContent=text;if(cls)el.className=cls;parent.appendChild(el);return el};
    function say(text){if(status)status.textContent=text;if(capture&&captureBox)captureBox.querySelector('p').textContent=text}
    function stopCapture(restoreFocus=true){const origin=capture?.origin;capture=null;captureReady=false;if(captureBox)captureBox.hidden=true;options.onCaptureChange?.(false);if(restoreFocus&&origin&&opened)focus(doc.getElementById(origin))}
    function change(next,message){const result=options.onChange(next);renderRows();stopCapture();say(message+(result?.saved===false?' Active for this session; browser storage is unavailable.':' Saved.'))}
    function assign(value){if(!capture)return;try{const result=B.rebind(options.getBindings(),device,capture.action,capture.slot,value);const label=value===null?'Binding cleared.':(device==='keyboard'?B.labelKey(value):B.labelButton(value))+' assigned to '+B.actions.find(a=>a.id===capture.action).label+'.';change(result.bindings,label+(result.swapped?' Conflicting bindings were swapped.':''))}catch(error){say(error.message)}}
    function begin(action,slot){capture={action,slot,origin:`binding-${device}-${action}-${slot}`};captureReady=false;captureBox.hidden=false;options.onCaptureChange?.(true);say('Changing '+B.actions.find(a=>a.id===action).label+'. Existing bindings remain active until a valid replacement is selected.');captureBox.querySelector('p').textContent=device==='keyboard'?'Press a new key. Tab reaches Cancel / Clear; Enter activates them. Esc cancels.':'Release all buttons, then press the controller button to assign. Esc or Cancel leaves the binding unchanged.';focus(captureBox.querySelector('button'))}
    function renderRows(){
      table.replaceChildren();const config=options.getBindings();
      for(const action of B.actions.filter(a=>a.devices.includes(device))){const row=node(table,'div',undefined,'binding-row');node(row,'b',action.label);for(let slot=0;slot<3;slot++){const value=config[device][action.id][slot],button=node(row,'button',value===undefined?'Add binding':device==='keyboard'?B.labelKey(value):B.labelButton(value));button.type='button';button.id=`binding-${device}-${action.id}-${slot}`;button.setAttribute('aria-label',`${action.label}, binding ${slot+1}: ${value===undefined?'unassigned':button.textContent}`);button.onclick=()=>begin(action.id,slot)}}
    }
    function render(){
      host.replaceChildren();const header=node(host,'div',undefined,'controls-header');const titles=node(header,'div');node(titles,'small','INPUT SETTINGS');node(titles,'h2','CONTROLS');const closeButton=node(header,'button','CLOSE');closeButton.type='button';closeButton.onclick=close;
      node(host,'p','Choose a binding, then press a key or controller button. Conflicting assignments swap places. Each action keeps at least one binding.','controls-copy');
      const tabs=node(host,'div',undefined,'controls-tabs');for(const id of['keyboard','controller']){const button=node(tabs,'button',id.toUpperCase());button.type='button';button.id=`controls-tab-${id}`;button.setAttribute('aria-pressed',String(device===id));button.onclick=()=>{stopCapture(false);device=id;render();focus(doc.getElementById(`controls-tab-${id}`))}}
      connection=node(host,'p',lastConnection||'Controller: connect a standard Xbox / PlayStation-compatible pad and press a button.','controls-connection');
      node(host,'p','Menu navigation stays fixed: left stick / D-pad, A / Cross to confirm, B / Circle to go back. Left stick always flies.','controls-note');
      table=node(host,'div',undefined,'controls-bindings');renderRows();
      captureBox=node(host,'div',undefined,'controls-capture');captureBox.hidden=true;node(captureBox,'p','');const cancel=node(captureBox,'button','CANCEL');cancel.type='button';cancel.onclick=()=>{stopCapture();say('Binding unchanged.')};const clear=node(captureBox,'button','CLEAR THIS BINDING');clear.type='button';clear.onclick=()=>assign(null);
      const footer=node(host,'div',undefined,'controls-footer');const reset=node(footer,'button','RESTORE DEFAULTS');reset.type='button';reset.onclick=()=>change(B.defaults,'Keyboard and controller defaults restored.');status=node(footer,'p','Changes save automatically.','controls-status');status.setAttribute('role','status');
    }
    function finishClose(){if(!opened)return;opened=false;stopCapture(false);options.onClose?.()}
    function close(){if(host.open)host.close();finishClose()}
    function open(){device='keyboard';capture=null;render();opened=true;if(!host.open)host.showModal();focusFirst(host)}
    doc.addEventListener('keydown',event=>{if(!host.open||!capture)return;if(event.code==='Tab'||event.code==='Enter')return;event.preventDefault();event.stopImmediatePropagation();if(event.code==='Escape'){stopCapture();say('Binding unchanged.');return}if(event.ctrlKey||event.metaKey||event.altKey||event.isComposing){say('Browser shortcuts stay reserved. Choose a gameplay key.');return}if(device==='keyboard')assign(event.code)},true);
    host.addEventListener('cancel',event=>{event.preventDefault();close()});host.addEventListener('close',finishClose);
    return{open,close,isCapturing:()=>!!capture,navigationRoot:()=>host,setSaveResult(result){say(result.saved?'Controls saved.':'Controls are active for this session; browser storage is unavailable.')},
      captureButtons(rawButtons){if(!capture||device!=='controller')return false;const down=rawButtons.filter(n=>n>=0&&n<=15);if(!captureReady){if(!down.length)captureReady=true;return true}if(down.length)assign(down[0]);return true},
      setConnection(frame){const next=frame.connected?'Controller connected: '+frame.id:frame.supported===false?'Controller API unavailable in this browser. Keyboard controls remain available.':frame.unsupported?'Controller detected; a browser-standard mapping is needed.':'Controller: connect a standard Xbox / PlayStation-compatible pad and press a button.';if(next!==lastConnection){lastConnection=next;if(connection)connection.textContent=next}}
    };
  }
  window.StarfighterControlsUI=Object.freeze({create,navigate,activate,focusFirst});
})();
