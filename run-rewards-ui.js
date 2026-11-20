/* Presentation for the three-slot run track and one-time recovery services.
 * Resource changes, reward validation and persistence belong to the game.
 */
(function(root,factory){
  'use strict';
  const model=typeof module==='object'&&module.exports?require('./run-progression.js'):root?.StarfighterRunProgression;
  const api=factory(model);
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.StarfighterRunRewardsUI=api;
})(typeof window==='object'?window:null,function(model){
  'use strict';
  const roles={precisionRelay:'CORE PRECISION',coreSurge:'CORE MOBILITY',bitReclaimer:'ACTIVE DEFENSE',secondChance:'EMERGENCY DEFENSE',fieldNanites:'RECOVERY',deltaReserve:'PICKUP ECONOMY'};
  const format=value=>Number(Number(value).toFixed(1)).toString();
  function add(doc,parent,tag,className,text){
    const node=doc.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=text;parent.appendChild(node);return node;
  }
  function button(doc,parent,className,text,action){
    const node=add(doc,parent,'button',className,text);node.type='button';node.onclick=action;return node;
  }
  function perkContext(id,player,owned){
    if(!player)return'';
    if(id==='bitReclaimer'){
      const bits=Math.max(0,Math.floor(Number(player.bits)||0));
      return bits?`ACTIVE · ${bits} Defense Bit${bits===1?'':'s'} equipped.`:'NEEDS A DEFENSE BIT · Collect one to activate this perk.';
    }
    if(id==='fieldNanites')return owned?'NEXT APEX · Repairs one hull if damaged.': 'STARTS AT YOUR NEXT APEX · Selecting this does not repair hull now.';
    if(id==='secondChance')return owned?(player.secondChanceReady?'READY THIS MISSION · One lethal-hit protection charge.':'USED THIS MISSION · Refreshes at the next mission.'):'READY WHEN SELECTED · One protection charge each mission.';
    return'';
  }
  function addPerkContext(doc,parent,id,player,owned){const text=perkContext(id,player,owned);if(text)add(doc,parent,'span','run-perk-context',text)}
  function renderService({container,player,onChoose,onSkip}){
    const doc=container.ownerDocument||document;
    container.replaceChildren();container.classList.remove('retrofit-cards');container.classList.add('run-service-cards');
    const hp=Number(player.hp),maxHp=Number(player.maxHp),shield=Number(player.shield||0),dose=Number(player.dose||0),alive=hp>0;
    const choices=[
      {id:'repair',name:'REPAIR HULL',kind:'repair',effect:'Repair one hull.',context:`Hull ${hp} / ${maxHp}.`,disabled:!alive||hp>=maxHp,unavailable:'HULL FULL'},
      {id:'shield',name:'ADD A SHIELD',kind:'shield',effect:'Add one shield charge, up to four.',context:`Shields ${shield} / 4.`,disabled:!alive||shield>=4,unavailable:'SHIELDS FULL'},
      {id:'dose',name:'CHARGE DELTA',kind:'dose',effect:'Add up to 12% DOSE, up to 100%.',context:`DOSE ${format(dose)}% → ${format(Math.min(100,dose+12))}%.`,disabled:!alive||dose>=100,unavailable:'DELTA READY'}
    ];
    const allFull=choices.every(choice=>choice.disabled);
    if(allFull)add(doc,container,'p','run-service-note','RESERVES FULL · Your hull, shields and Delta charge are ready.');
    const grid=add(doc,container,'div','run-service-grid');let busy=false;
    const commit=choice=>{if(busy)return;busy=true;for(const node of grid.children)node.disabled=true;skip.disabled=true;if(choice)onChoose(choice);else onSkip?.()};
    for(const choice of choices){
      const card=button(doc,grid,'run-service-choice run-service-'+choice.kind,'',()=>commit(choice.id));card.dataset.service=choice.id;card.disabled=choice.disabled;
      add(doc,card,'small','run-reward-label','RECOVERY SERVICE');add(doc,card,'b','run-reward-name',choice.name);add(doc,card,'span','run-reward-effect',choice.effect);add(doc,card,'span','run-reward-context',choice.context);add(doc,card,'em','run-reward-duration','APPLIED ONCE');add(doc,card,'span','run-reward-action',choice.disabled?choice.unavailable:'CHOOSE SERVICE →');
    }
    const skip=button(doc,container,'run-reward-skip',allFull?'CONTINUE':'SKIP RECOVERY',()=>commit(null));skip.dataset.service='skip';skip.disabled=!alive;
    return{allFull};
  }
  function renderPerks({container,progress,player,inspect=false,final=false,onChoose}){
    if(!model?.catalogue)throw new Error('Load run progression before its reward screen.');
    const doc=container.ownerDocument||document,lookup=new Map(model.catalogue.map(perk=>[perk.id,perk])),contextPlayer=final?null:player;
    const owned=progress.perks||[],offered=!inspect&&progress.pending==='perk'?(progress.offer||[]):[];
    let selected=null,busy=false;
    function choose(newId,oldId){if(busy)return;busy=true;for(const node of container.querySelectorAll('button'))node.disabled=true;onChoose(newId,oldId)}
    function render(){
      container.replaceChildren();container.classList.add('run-perk-screen');
      const header=add(doc,container,'div','run-perk-heading');add(doc,header,'b','',`CURRENT BUILD · ${owned.length} / 3 PERKS`);add(doc,header,'span','','LASTS FOR THIS RUN');
      const current=add(doc,container,'div','run-active-perks');
      for(let index=0;index<3;index++){
        const perk=lookup.get(owned[index]),slot=add(doc,current,'article',perk?'run-active-perk filled':'run-active-perk empty');slot.dataset.perkSlot=String(index);
        add(doc,slot,'small','',`SLOT ${index+1}${perk?' · CURRENT':''}`);add(doc,slot,'b','',perk?.name||'OPEN PERK SLOT');
        if(perk&&!selected){add(doc,slot,'p','',perk.description);addPerkContext(doc,slot,perk.id,contextPlayer,true)}
      }
      if(!offered.length){add(doc,container,'p','run-perk-note',final?'This build is complete. Its perks are retained for this run only; recovered gear stays in the Garage.':owned.length?'Your next apex victory offers another perk. Three active perks is the limit; new choices replace an existing perk.':'No run perks chosen yet. Defeat an apex boss to choose your first perk.');return}
      if(selected){
        const incoming=lookup.get(selected),preview=add(doc,container,'div','run-perk-proposal');add(doc,preview,'small','','ADD TO YOUR BUILD');add(doc,preview,'b','',incoming.name);add(doc,preview,'p','',incoming.description);addPerkContext(doc,preview,incoming.id,contextPlayer,false);
        add(doc,container,'p','run-perk-note','Three perks are active. Choose one to replace. Its effect will be removed.');
        const grid=add(doc,container,'div','run-perk-replacements');
        for(const id of owned){const old=lookup.get(id),replacement=button(doc,grid,'run-perk-replace','',()=>choose(selected,id));replacement.dataset.replacePerk=id;replacement.dataset.newPerk=selected;add(doc,replacement,'small','','GIVE UP '+old.name);add(doc,replacement,'span','run-reward-effect',old.description);addPerkContext(doc,replacement,id,contextPlayer,true);add(doc,replacement,'b','run-reward-action',`REPLACE WITH ${incoming.name} →`);replacement.setAttribute('aria-label',`Replace ${old.name} with ${incoming.name}`)}
        const cancel=button(doc,container,'run-reward-skip','BACK TO PERK CHOICES',()=>{const previous=selected;selected=null;render();container.querySelector(`[data-perk="${previous}"]`)?.focus?.({preventScroll:true})});cancel.dataset.cancelReplacement='true';
        return;
      }
      add(doc,container,'p','run-perk-note',owned.length<3?'CHOOSE ONE · Fill an open slot with a new perk.':'CHOOSE ONE · Preview which current perk it would replace.');
      const grid=add(doc,container,'div','run-perk-offers');
      for(const id of offered){
        const perk=lookup.get(id);if(!perk)continue;
        const card=button(doc,grid,'run-perk-choice','',()=>{if(owned.length<3){choose(id);return}selected=id;render();container.querySelector('[data-replace-perk]')?.focus?.({preventScroll:true})});card.dataset.perk=id;
        add(doc,card,'small','run-reward-label',roles[id]||'RUN PERK');add(doc,card,'b','run-reward-name',perk.name);add(doc,card,'span','run-reward-effect',perk.description);addPerkContext(doc,card,id,contextPlayer,false);add(doc,card,'em','run-reward-duration','THIS RUN ONLY');add(doc,card,'span','run-reward-action',owned.length<3?'ADD PERK →':'CHOOSE REPLACEMENT →');
      }
    }
    render();
    return{get selected(){return selected},clearSelection(){selected=null;render()}};
  }
  return Object.freeze({renderService,renderPerks});
});
