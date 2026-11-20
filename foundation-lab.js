/* Disposable designer workbench. Deliberately never reads or writes storage. */
(() => {
  'use strict';
  const F=window.STARFIGHTER_FOUNDATION,C=window.STARFIGHTER_FOUNDATION_COMBAT,$=id=>document.getElementById(id);
  const slotNames={weapon:'Weapon',armor:'Armor',engine:'Engine',pod:'Force Pod'};
  const names=new Map(F.catalogue.map(item=>[item.id,item]));
  const perkNames=new Map(F.perks.map(item=>[item.id,item]));
  const roles={precisionRelay:'CORE PRECISION',coreSurge:'CORE MOBILITY',bitReclaimer:'ACTIVE DEFENSE',secondChance:'EMERGENCY DEFENSE',fieldNanites:'RECOVERY',deltaReserve:'PICKUP ECONOMY'};
  let equipment={},selectedPerks=[],build,run,mission=1,seed=14300,pendingPerk=null;
  const add=(parent,tag,text,className='')=>{const el=document.createElement(tag);el.textContent=text;el.className=className;parent.appendChild(el);return el};
  const option=(select,value,label)=>{const el=add(select,'option',label);el.value=value;return el};
  const fmt=value=>Number(value.toFixed(2)).toString();
  const factor=value=>Number(value.toFixed(6)).toString();
  function roll(slot,intrinsic,alignment,rarity='rare'){return F.rollGear({slot,intrinsic,alignment,rarity,seed:++seed})}
  function preset(name){
    const specs=name==='intercept'?[['sync','AEGIS'],['ablative','AEGIS'],['phase','AEGIS'],['siphon','AEGIS']]:name==='split'?[['core','VANGUARD'],['recovery','VANGUARD'],['scavenger','VECTOR'],['shepherd','VECTOR']]:[['siege','VANGUARD'],['capacitor','VANGUARD'],['vector','VANGUARD'],['relay','VANGUARD']];
    equipment=Object.fromEntries(F.slots.map((slot,i)=>[slot,roll(slot,...specs[i])]));
    selectedPerks=[];pendingPerk=null;renderBuild();$('build-status').textContent='Example loaded. Perks and the test mission were reset.';
  }
  function resetSimulation(){
    mission=1;const base=C.createRunState(build);
    run=C.createRunState(build,{hp:Math.max(1,base.maxHp-1),shields:Math.min(4,1+build.stats.startingShields)});
    renderRun();$('event-result').textContent='Test mission reset. Gear and perk edits restart this temporary example.';
  }
  function renderBuild(focusId){
    build=F.compileBuild({equipment,perks:selectedPerks});renderGear();renderSets();renderPerks();renderReplacement();resetSimulation();renderDamage();
    if(focusId)$(focusId)?.focus();
  }
  function renderGear(){
    const box=$('gear-slots');box.replaceChildren();
    for(const slot of F.slots){
      const item=equipment[slot],card=add(box,'article','','gear-slot'),label=add(card,'label',slotNames[slot]),select=add(card,'select','');select.id='gear-'+slot;label.htmlFor=select.id;
      for(const choice of F.catalogue.filter(item=>item.slot===slot))option(select,choice.intrinsic,choice.name);
      select.value=item.intrinsic;select.onchange=()=>{equipment={...equipment,[slot]:roll(slot,select.value,item.alignment,item.rarity)};renderBuild(select.id);$('build-status').textContent='Gear changed. The temporary test mission restarted.'};
      const setLabel=add(card,'label','Gear set'),setSelect=add(card,'select','');setSelect.id='set-'+slot;setLabel.htmlFor=setSelect.id;for(const set of F.sets)option(setSelect,set.id,set.name);setSelect.value=item.alignment;
      setSelect.onchange=()=>{equipment={...equipment,[slot]:{...item,alignment:setSelect.value}};renderBuild(setSelect.id);$('build-status').textContent='Set changed. Existing stat rolls were kept; the test mission restarted.'};
      const rarityLabel=add(card,'label','Rarity'),raritySelect=add(card,'select','');raritySelect.id='rarity-'+slot;rarityLabel.htmlFor=raritySelect.id;for(const rarity of F.rarities)option(raritySelect,rarity.id,rarity.name);raritySelect.value=item.rarity;
      raritySelect.onchange=()=>{equipment={...equipment,[slot]:roll(slot,item.intrinsic,item.alignment,raritySelect.value)};renderBuild(raritySelect.id);$('build-status').textContent='Rarity changed and new stats rolled. The test mission restarted.'};
      const intrinsic=names.get(slot+':'+item.intrinsic);add(card,'strong',intrinsic.role);add(card,'p',intrinsic.description);
      const rollLine=add(card,'div','','roll-line');for(const[key,value]of Object.entries(item.stats)){const affix=F.affixes[slot].find(a=>a.key===key);add(rollLine,'div',`${affix.label} +${value}${key.endsWith('Pct')?'%':''}`)}
      const reroll=add(card,'button','Roll new stats','reroll');reroll.type='button';reroll.id='roll-'+slot;reroll.setAttribute('aria-label','Roll new '+slotNames[slot].toLowerCase()+' stats');reroll.onclick=()=>{equipment={...equipment,[slot]:roll(slot,item.intrinsic,item.alignment,item.rarity)};renderBuild(reroll.id);$('build-status').textContent=slotNames[slot]+' stats rolled again. The intrinsic and set were kept.'};
    }
  }
  function renderSets(){
    const summary=$('pair-summary');summary.replaceChildren();const active=build.activeSets.filter(set=>set.thresholds.length);
    if(!active.length)add(summary,'p','No set bonus yet. Match two pieces for a first bonus, or four to specialize.');
    for(const state of active){const set=F.sets.find(set=>set.id===state.id);add(summary,'b',`${set.name.toUpperCase()} · ${state.count} PIECES`);for(const threshold of set.thresholds.filter(t=>state.thresholds.includes(t.count)))add(summary,'p',`${threshold.count}-piece: ${threshold.description}`)}
    const catalogue=$('pair-catalogue');catalogue.replaceChildren();
    for(const set of F.sets){const count=Object.values(equipment).filter(item=>item?.alignment===set.id).length,card=add(catalogue,'article','',count>=2?'set-active':'');add(card,'b',`${set.name} · ${count}/4 equipped`);for(const threshold of set.thresholds)add(card,'p',`${count>=threshold.count?'ACTIVE':'NEED '+threshold.count+' PIECES'} · ${threshold.description}`,count>=threshold.count?'threshold-active':'');}
    const limits=$('affix-limits');limits.replaceChildren();for(const slot of F.slots){const col=add(limits,'article','');add(col,'b',slotNames[slot]);for(const affix of F.affixes[slot])add(col,'p',`${affix.label}: ${affix.min===affix.max?affix.max:affix.min+'–'+affix.max}${affix.key.endsWith('Pct')?'%':''}`)}
  }
  function renderPerks(){
    $('perk-count').textContent=`${selectedPerks.length} / ${F.policy.maxActivePerks} ACTIVE`;
    const active=$('active-perks');active.replaceChildren();for(let i=0;i<3;i++){const id=selectedPerks[i],slot=add(active,'div','',id?'perk-slot filled':'perk-slot');add(slot,'span',id?perkNames.get(id).name:'Empty perk slot '+(i+1));if(id){const remove=add(slot,'button','Remove','quiet');remove.type='button';remove.setAttribute('aria-label','Remove '+perkNames.get(id).name);remove.onclick=()=>{selectedPerks=selectedPerks.filter(perk=>perk!==id);pendingPerk=null;renderBuild();$('build-status').textContent='Perk removed in the workbench; test mission reset.'}}}
    const catalogue=$('perk-catalogue');catalogue.replaceChildren();for(const perk of F.perks){const owned=selectedPerks.includes(perk.id),card=add(catalogue,'article','',owned?'perk-card active':'perk-card');add(card,'small',roles[perk.id]);add(card,'h3',perk.name);add(card,'p',perk.description);const button=add(card,'button',owned?'ACTIVE':selectedPerks.length<3?'Add perk':'Replace a perk');button.type='button';button.disabled=owned;button.dataset.perk=perk.id;button.setAttribute('aria-label',(owned?'Active: ':selectedPerks.length<3?'Add ':'Replace with ')+perk.name);button.onclick=()=>{if(selectedPerks.length<3){selectedPerks=[...F.choosePerk(selectedPerks,perk.id)];pendingPerk=null;renderBuild();$('build-status').textContent=perk.name+' added. The temporary test mission restarted.'}else{pendingPerk=perk.id;renderReplacement();$('replace-perk').focus();$('build-status').textContent='Three perks are active. Choose one to replace, or keep the current build.'}}}
  }
  function renderReplacement(){
    $('replacement').hidden=!pendingPerk;if(!pendingPerk)return;$('replace-title').textContent='Add '+perkNames.get(pendingPerk).name;$('replace-perk').replaceChildren();for(const id of selectedPerks)option($('replace-perk'),id,perkNames.get(id).name);
  }
  function renderRun(){
    const box=$('run-readout');box.replaceChildren();for(const[label,value,note]of[['MISSION',mission+' / 10','Once-per-mission guards rearm here'],['HULL',run.hp+' / '+run.maxHp,'SHIELDS '+run.shields+' / 4'],['DELTA CHARGE',fmt(run.dose)+'%','Force blocks add '+fmt(2.5+build.stats.forceBlockDoseBonus)+'%'],['SURGE',run.surgeTime?fmt(run.surgeTime)+'s':'Inactive',run.surgeTime?'+'+fmt(run.surgePower*100)+'% flight and charge':'Timed effects refresh; they do not multiply']]){const el=add(box,'div','');add(el,'span',label);add(el,'b',value);add(el,'small',note)}
    const miniDone=run.rewardIds.includes('mini:'+mission),apexDone=run.rewardIds.includes('apex:'+mission);
    for(const button of document.querySelectorAll('[data-service]'))button.disabled=run.hp<=0||miniDone||(button.dataset.service==='repair'&&run.hp>=run.maxHp)||(button.dataset.service==='shield'&&run.shields>=4);
    for(const button of document.querySelectorAll('[data-event],[data-hit]'))button.disabled=run.hp<=0;
    $('apex-clear').disabled=run.hp<=0||apexDone;$('next-mission').disabled=run.hp<=0||!apexDone||mission>=10;
  }
  function eventSummary(before,after,label){
    if(label.startsWith('Mission '))return label+'. Once-per-mission effects rearmed. Hull, shields and Delta charge were kept.';
    const parts=[];if(after.hp!==before.hp)parts.push(`hull ${before.hp} → ${after.hp}`);if(after.shields!==before.shields)parts.push(`shields ${before.shields} → ${after.shields}`);if(after.dose!==before.dose)parts.push(`Delta charge ${fmt(before.dose)}% → ${fmt(after.dose)}%`);if(after.surgeTime!==before.surgeTime||after.surgePower!==before.surgePower)parts.push(`Surge ${fmt(after.surgeTime)}s at +${fmt(after.surgePower*100)}%`);for(const key of Object.keys(before.guards))if(before.guards[key]&&!after.guards[key])parts.push((key==='phase'?'Contact guard':key==='ablative'?'Hull guard':'Second Chance')+' used');
    if(after.forceSetBlocks!==before.forceSetBlocks)parts.push(`Aegis blocks ${after.forceSetBlocks} / 12`);
    return label+': '+(parts.length?parts.join('; ')+'.':'no reserve change. This effect may be inactive, already spent or at its cap.');
  }
  function dispatch(event,label){
    try{const before=run;run=C.applyRunEvent(build,run,event);$('event-result').textContent=eventSummary(before,run,label);renderRun()}catch(error){$('event-result').textContent=error.message}
  }
  function renderDamage(){
    if(!build)return;
    try{
      const base=$('damage-source').value==='fighter'&&$('damage-charged').checked?800:100;
      const hit=C.resolveHit({amount:base,source:$('damage-source').value,element:$('damage-element').value,charged:$('damage-charged').checked,rear:$('damage-rear').checked,shielded:$('damage-shielded').checked},{region:$('damage-region').value,weakness:$('target-weakness').value==='neutral'?null:$('target-weakness').value,resistance:$('target-resistance').value==='neutral'?null:$('target-resistance').value,protected:$('target-protected').checked},build,{elementsEnabled:$('enable-elements').checked});
      $('damage-readout').replaceChildren();add($('damage-readout'),'strong',`${fmt(hit.amount)} damage${hit.protected?' · protected target':hit.policy==='scripted'?' · scripted Delta policy':''}`);add($('damage-readout'),'small',`Base ${base} · source ×${factor(hit.sourceScale)} · charged equipment ×${factor(hit.chargeScale)} · rear Force ×${factor(hit.rearScale)} · element ×${factor(hit.elementScale)} · region ×${factor(hit.regionScale)} · core equipment ×${factor(hit.coreScale)}`);
    }catch(error){$('damage-readout').textContent=error.message}
  }
  $('replacement').onsubmit=event=>{event.preventDefault();const name=perkNames.get(pendingPerk).name;selectedPerks=[...F.choosePerk(selectedPerks,pendingPerk,$('replace-perk').value)];pendingPerk=null;renderBuild();$('build-status').textContent=name+' installed by replacing one perk. Three remain active.'};
  $('cancel-replace').onclick=()=>{pendingPerk=null;renderReplacement();$('build-status').textContent='Current build kept. No perk changed.'};
  $('reset-build').onclick=()=>preset('charge');for(const button of document.querySelectorAll('[data-preset]'))button.onclick=()=>preset(button.dataset.preset);
  $('reset-mission').onclick=resetSimulation;
  for(const button of document.querySelectorAll('[data-event]'))button.onclick=()=>dispatch({type:button.dataset.event},button.textContent);
  for(const button of document.querySelectorAll('[data-hit]'))button.onclick=()=>dispatch({type:'hit',damage:1,kind:button.dataset.hit},button.textContent);
  for(const button of document.querySelectorAll('[data-service]'))button.onclick=()=>dispatch({type:'miniService',choice:button.dataset.service,id:'mini:'+mission},button.textContent);
  $('apex-clear').onclick=()=>dispatch({type:'apexClear',id:'apex:'+mission},'Apex cleared');$('next-mission').onclick=()=>{if(mission>=10||!run.rewardIds.includes('apex:'+mission))return;mission++;dispatch({type:'missionStart'},'Mission '+mission+' started')};
  const timer=add(document.querySelector('.mission-actions').nextElementSibling,'button','Advance 4 seconds','quiet');timer.type='button';timer.id='advance-time';timer.onclick=()=>dispatch({type:'tick',seconds:4},'Time advanced');
  for(const control of document.querySelectorAll('.elements input,.elements select'))control.onchange=renderDamage;
  preset('charge');
})();
