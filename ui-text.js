/* Text-only accessibility preference. Local font declarations are mirrored so
 * responsive units and newly mounted lesson cards retain their authored size
 * relationships. Canvas geometry and the root rem size are never changed. */
(function(root,factory){
  'use strict';
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.StarfighterUiText=api;
})(typeof window==='object'?window:null,function(){
  'use strict';
  const key='starfighterUiText',styleId='starfighter-ui-text-overrides';
  const choices=Object.freeze(['standard','large']),instances=new WeakMap();
  const normalize=value=>choices.includes(value)?value:'standard';
  function selectors(value){
    const result=[];let start=0,depth=0,quote='';
    for(let i=0;i<value.length;i++){
      const c=value[i];
      if(quote){if(c==='\\')i++;else if(c===quote)quote='';continue}
      if(c==='"'||c==="'"){quote=c;continue}
      if(c==='('||c==='[')depth++;else if(c===')'||c===']')depth--;
      else if(c===','&&!depth){result.push(value.slice(start,i).trim());start=i+1}
    }
    result.push(value.slice(start).trim());return result.filter(Boolean);
  }
  function scalableSelector(selector){
    // Display titles and decorative pseudo-elements keep their original size.
    return !/(?:^|[\s>+~,(])(?:html|:root|h1|h2|h3)(?=[\s.#:[>+~),]|$)/i.test(selector)
      && !/::?(?:before|after|marker)\b/.test(selector)
      && !/\.(?:archive-mark|completion-seal)\b/.test(selector);
  }
  function scalableSize(value){
    // Relative em/% sizes inherit the already enlarged parent. Mirroring them
    // again would compound nested labels and icons on every depth level.
    return typeof value==='string'&&/(?:\d|\.)\s*(?:px|rem|vw|vh|vmin|vmax|cqw|cqh|cqi|cqb)\b/.test(value)
      && !/(?:\d|\.)\s*em\b|%/.test(value);
  }
  function compileRules(rules){
    let css='',count=0;
    for(const rule of Array.from(rules||[])){
      if(rule.selectorText&&rule.style){
        const size=rule.style.getPropertyValue('font-size').trim();
        if(!scalableSize(size))continue;
        const targets=selectors(rule.selectorText).filter(scalableSelector);
        if(!targets.length)continue;
        const priority=rule.style.getPropertyPriority('font-size')?'!important':'';
        css+=targets.map(selector=>'html[data-ui-text="large"] '+selector).join(',')+'{font-size:calc('+size+' * var(--ui-text-scale))'+priority+'}\n';count++;
      }else if(rule.cssRules){
        // Preserve grouping conditions and source order. Import/font-face/
        // keyframe rules do not describe UI typography and are not mirrored.
        const head=String(rule.cssText||'').split('{',1)[0].trim();
        if(!/^@(media|supports|container|layer)\b/i.test(head))continue;
        const nested=compileRules(rule.cssRules);
        if(nested.css){css+=head+'{\n'+nested.css+'}\n';count+=nested.count}
      }
    }
    return{css,count};
  }
  function compileSheets(sheets){
    let css='',count=0;
    for(const sheet of Array.from(sheets||[])){
      if(sheet.disabled||sheet.ownerNode?.id===styleId||/\bui-text\.css(?:[?#]|$)/i.test(sheet.href||''))continue;
      let compiled;
      try{compiled=compileRules(sheet.cssRules)}catch{continue} // External font sheets may be protected by the browser.
      if(!compiled.css)continue;
      const media=sheet.media?.mediaText;
      css+=media&&media!=='all'?'@media '+media+'{\n'+compiled.css+'}\n':compiled.css;count+=compiled.count;
    }
    return{css,count};
  }
  function create(options={}){
    const doc=options.document||(typeof document==='object'?document:null);
    if(!doc?.documentElement||!doc.head)throw new Error('A document is required for UI text preferences.');
    if(instances.has(doc))return instances.get(doc);
    let storage=options.storage;
    if(!storage)try{storage=doc.defaultView?.localStorage}catch{}
    const select=options.select||doc.getElementById('ui-text-size'),status=options.status||doc.getElementById('ui-text-status');
    let value='standard',style=null,observer=null,disposed=false;
    try{value=normalize(storage?.getItem(key))}catch{}
    function rebuild(){
      if(disposed||value!=='large')return;
      const compiled=compileSheets(doc.styleSheets);
      if(!style){style=doc.createElement('style');style.id=styleId;doc.head.appendChild(style)}
      if(style.textContent!==compiled.css)style.textContent=compiled.css;
      style.dataset.ruleCount=String(compiled.count);
    }
    function apply(){
      doc.documentElement.setAttribute('data-ui-text',value);
      if(select)select.value=value;
      if(value==='large')rebuild();else if(style){style.remove();style=null}
    }
    function report(saved,persist=true){
      if(status)status.textContent=(value==='large'?'Large text active.':'Standard text active.')+(persist?(saved?' Saved for this browser.':' Active for this session; browser storage is unavailable.'):'');
    }
    function set(next,{persist=true}={}){
      if(disposed||!choices.includes(next))return{value,saved:false,valid:false};
      value=next;apply();let saved=false;
      if(persist)try{if(storage?.setItem){const result=storage.setItem(key,value);saved=result!==false&&storage.sessionOnly!==true}}catch{}
      report(saved,persist);
      options.onChange?.(value,{saved,persist});return{value,saved,valid:true};
    }
    const change=()=>set(select.value);
    select?.addEventListener('change',change);
    apply();
    const Observer=options.MutationObserver||doc.defaultView?.MutationObserver;
    if(Observer){
      observer=new Observer(records=>{
        if(value!=='large'||disposed)return;
        const relevant=records.some(record=>record.target!==style&&record.target?.parentNode!==style&&
          (record.target===doc.head?Array.from(record.addedNodes||[]).some(node=>node!==style):true));
        if(relevant)rebuild();
      });
      observer.observe(doc.head,{childList:true,subtree:true,characterData:true});
    }
    const load=event=>{if(event.target?.tagName==='LINK')rebuild()};
    doc.addEventListener('load',load,true);
    const api=Object.freeze({get value(){return value},set,refresh:rebuild,
      setSaveResult(result={}){if(disposed||result.value!==undefined&&result.value!==value)return false;report(result.saved===true);return true},
      destroy(){if(disposed)return;disposed=true;observer?.disconnect();select?.removeEventListener('change',change);doc.removeEventListener('load',load,true);if(style)style.remove();doc.documentElement.removeAttribute('data-ui-text');instances.delete(doc)}
    });
    instances.set(doc,api);return api;
  }
  return Object.freeze({key,choices,normalize,compileRules,compileSheets,create});
});
