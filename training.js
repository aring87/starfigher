/* Flight School presentation and evidence-driven lesson controller.
 * The game bridge supplies a private practice simulation; this module never
 * reads or writes a profile, Garage, campaign checkpoint, or browser storage.
 */
(() => {
  'use strict';
  const LESSONS = [
    {id:'move',chapter:'01 / FLIGHT',title:'Find your flight line',copy:'Move with WASD or the arrow keys. Hold Shift while moving for slower, precise flight and a visible collision boundary.',keys:['WASD / ARROWS','SHIFT + MOVE'],goals:['Move at least 80 pixels','Move 30 pixels with Shift held'],tip:'The fighter’s small collision boundary matters more than the width of its wings.'},
    {id:'fire',chapter:'02 / WAVE CANNON',title:'Tap. Hold. Release.',copy:'Tap Z, Space, or X for a quick shot. Then hold a fire key until the charge meter is nearly full and release it. Holding alone does not fire the charge.',keys:['Z / SPACE / X','HOLD → RELEASE'],goals:['Fire one quick shot','Release a shot at 70% charge or higher'],tip:'You can keep moving while charging. A full charge takes about 1.25 seconds before upgrades.'},
    {id:'force',chapter:'03 / FIRST CRYSTAL',title:'Meet your Force',copy:'Fly into the red crystal. Your first colored crystal equips the detachable Force gun. It shoots when you fire and can intercept ordinary pink hostile shots.',keys:['FLY INTO THE CRYSTAL'],goals:['Collect the red Force crystal'],tip:'Amber shots pierce both Force and Bits. Watch for the amber charge cue and move before it fires.'},
    {id:'mount',chapter:'04 / FORCE HANDLING',title:'Put a barrier in the lane',copy:'Press C to deploy the Force, then let it catch a pink practice shot. Press C to recall it. V switches its front or rear mount; try rear, then return to front.',keys:['C DEPLOY / RECALL','V FRONT / REAR'],goals:['Deploy the Force','Intercept a pink shot after deploying','Recall and dock at the rear','Return to a front dock'],tip:'The rear mount fires backward. Deployment gives the Force reach while you steer the fighter.'},
    {id:'spectrum',chapter:'05 / FORCE COLORS',title:'Choose your firing pattern',copy:'Collect blue and fire its ricocheting lasers. Then collect yellow and fire again: watch its wave rays turn toward the practice target. Crystals change color and raise the Force level until the mission limit.',keys:['COLLECT → FIRE','BLUE → YELLOW'],goals:['Collect a blue crystal','Fire the blue pattern','Collect a yellow crystal','Fire the yellow pattern'],tip:'Red: direct fire, penetrates at Level 3. Blue: ricochets at higher levels. Yellow: guided wave rays. Story unlocks Force 2 in mission 2 and Force 3 in mission 4.'},
    {id:'support',chapter:'06 / SUPPORT PICKUPS',title:'Build your safety net',copy:'Fly into the orange-tipped missile rack for homing missiles, the white-core armored drone for a defensive Bit, and the gold-edged ward for a shield. Pickups equip automatically. Fire normally after collecting the missile rack, then let the practice shots demonstrate a Bit block and a shield impact.',keys:['MISSILE RACK','DEFENSE DRONE','GOLD-EDGED WARD'],goals:['Collect a missile rack, then fire','Collect a defense Bit','Let a Bit block a pink shot','Collect a gold shield ward','Let the shield absorb one hit'],tip:'Missiles launch with your shots. Bits guard above and below; they do not stop amber fire. Shields absorb one hit each, up to four. A second missile launcher and Bit unlock in mission 3.'},
    {id:'delta',chapter:'07 / DOSE',title:'Turn defense into Delta',copy:'Your practice meter starts at 80%. Catch pink shots with the Force to fill it. Destroying enemies and collecting Asterprints also add DOSE. At 100%, press Q to activate Delta.',keys:['FORCE BLOCK → DOSE','Q AT 100%'],goals:['Reach 100% DOSE','Activate the Delta Weapon'],tip:'Delta clears hostile shots, destroys ordinary enemies, and damages active boss cores. It spends the full meter.'},
    {id:'cores',chapter:'08 / BOSS ARMOR',title:'Wait for the opening',copy:'Fire once at the sealed practice target. Armor reduces the damage to a chip. Watch for the bright exposed core, then line up and fire into that opening for full damage.',keys:['FIRE AT ARMOR','FIRE AT EXPOSED CORE'],goals:['See armor reduce a hit','Hit an exposed core'],tip:'Break embedded cores for full damage. Destroying outer weapon assemblies can disable their attacks; smoke shows an enemy is damaged.'},
    {id:'salvage',chapter:'09 / ASTERPRINTS',title:'Recover a future build',copy:'Collect the floating Asterprint crate. It is equipment for the Garage, with a slot, rarity, power, and random stat rolls. Collecting it also grants DOSE and a short flight / charge Surge.',keys:['COLLECT THE CRATE'],goals:['Recover the practice Asterprint'],tip:'Recovered gear is kept at victories, defeat, menu exit, restart and normal page close. Equip it in the Garage between rounds. Practice rewards stay in this isolated school.'},
    {id:'synergy',chapter:'10 / BUILD WORKSHOP',title:'Complete Charged Bastion',copy:'Choose one weapon intrinsic and one armor intrinsic. Match Siege Coil with Capacitor Plating to activate a real equipment synergy.',keys:['SELECT ONE PER SLOT'],goals:['Equip the Charged Bastion pair'],tip:'Named pairs require both listed effects. Gear sets separately activate with two or four matching alignments; four pieces keep the two-piece bonus. Rarity and power alone do not activate a pair. These cards only change the practice workbench.'},
    {id:'progression',chapter:'11 / YOUR NEXT FLIGHT',title:'Know your three rewards',copy:'Gear stays in the Garage. Minibosses offer one immediate recovery service. Main bosses offer a perk for this run. Keep up to three active run perks; replace one when all slots are full. Route all three rewards.',keys:['GEAR / RECOVERY / RUN PERKS'],goals:['Identify all three reward channels'],tip:'During Story, T opens your Run Build. Recovery services apply once. Run perks end with the run; recovered gear stays in the Garage.'}
  ];
  const INTRO_LESSON_IDS=Object.freeze(['move','fire','force','mount','cores']);
  const INTRO_COPY={
    move:{copy:'Move with {move}. Hold {precision} for slower, precise flight.',tip:'Your small collision boundary matters more than the width of your wings.'},
    fire:{copy:'Tap {fire} to fire. Hold it until the charge meter is nearly full, then release for a charged shot.',tip:'Keep moving while you charge. The shot fires when you release the key.'},
    force:{copy:'Collect the red crystal to equip your detachable Force gun. Fire with {fire}; the Force fires with you and stops ordinary pink shots.',tip:'Amber shots pass through the Force. Move out of their path.'},
    mount:{copy:'Press {force} to send the Force forward. Let it catch a pink practice shot, then press {force} to bring it back to the front of your fighter.',keys:['{force} DEPLOY / RECALL'],inputActions:['force'],goals:['Deploy the Force','Intercept a pink shot after deploying','Recall and dock at the front'],tip:'Keep the Force between your fighter and incoming pink shots.'},
    cores:{copy:'Press {fire} to hit the armored practice target. Then line up with its bright exposed core and fire into it for full damage.',tip:'Watch for the opening, line up with the bright core, and fire. Breaking outer weapon assemblies can disable their attacks.'}
  };
  const INTRO_LESSONS=INTRO_LESSON_IDS.map((id,index)=>{const lesson=LESSONS.find(item=>item.id===id);return{...lesson,...INTRO_COPY[id],chapter:`${String(index+1).padStart(2,'0')} / ${lesson.chapter.split(' / ')[1]}`};});
  const WORKSHOP = [
    {slot:'weapon',id:'siege',name:'SIEGE COIL',text:'Charged shots: +12% damage and +10% size.'},
    {slot:'weapon',id:'core',name:'CORE BORER',text:'Exposed weak points take 10% more damage.'},
    {slot:'armor',id:'capacitor',name:'CAPACITOR PLATING',text:'Shield pickups also generate 8% DOSE.'},
    {slot:'armor',id:'recovery',name:'RECOVERY WEAVE',text:'The first Asterprint each stage repairs one hull.'}
  ];
  const REWARDS = [
    {name:'You recover an Asterprint',answer:'garage',explain:'Garage: permanent equipment for your weapon, armor, engine, or pod slot.'},
    {name:'A miniboss offers hull, shield or Delta recovery',answer:'module',explain:'Recovery service: choose one immediate benefit. Each miniboss service can be claimed once.'},
    {name:'A main boss offers a new effect for this run',answer:'doctrine',explain:'Run perk: keep up to three active perks. At three, replace one or keep your current build.'}
  ];
  function injectStyle(doc) {
    if(doc.getElementById('starfighter-training-style'))return;
    const style=doc.createElement('style');style.id='starfighter-training-style';
    style.textContent=`
      .sf-training{--sf-cyan:#4ef5ff;--sf-muted:#9eb3c6;position:absolute;inset:0;z-index:24;pointer-events:none;color:#effaff;font-family:'Chakra Petch',system-ui,sans-serif;text-shadow:none}
      .sf-training *{box-sizing:border-box}.sf-training [hidden]{display:none!important}
      .sf-training button{font:700 10px 'Oxanium',system-ui,sans-serif;letter-spacing:.07em;cursor:pointer;border:1px solid #37546b;background:#101f31;color:#e8faff;padding:9px 12px;line-height:1.3;border-radius:2px;margin:0;transition:background .15s,border-color .15s}
      .sf-training button:hover{background:#17374a;border-color:var(--sf-cyan)}.sf-training button:focus-visible,.sf-training select:focus-visible{outline:2px solid #ffd166;outline-offset:3px}.sf-training button:disabled{cursor:default;opacity:.48}
      .sf-training .sf-primary{background:#174250;border-color:var(--sf-cyan);color:#e9feff}.sf-training .sf-primary:disabled{background:#142330;border-color:#365068;color:#8da4b6}.sf-training .sf-quiet{background:transparent;border-color:#294257;color:#b6c8d7}
      .sf-training-top{position:absolute;left:2.3%;right:2.3%;top:12%;display:flex;justify-content:space-between;align-items:center;gap:12px;pointer-events:auto}
      .sf-training-brand{display:flex;align-items:center;gap:9px;color:var(--sf-cyan);font:700 11px 'Oxanium',system-ui,sans-serif;letter-spacing:.16em}.sf-training-brand:before{content:'◇';font-size:24px;line-height:1;color:#ffd166}.sf-training-safety{display:block;color:#a1b7c7;font:400 10px 'Chakra Petch',system-ui,sans-serif;letter-spacing:.02em;margin-top:3px}
      .sf-training-tools{display:flex;gap:6px}.sf-training-tools button{font-size:9px;padding:7px 9px}
      .sf-training-panel{position:absolute;right:2.3%;top:20%;bottom:9%;width:32%;max-height:71%;display:flex;flex-direction:column;overflow:hidden;pointer-events:auto;padding:17px;border:1px solid #39667a;background:linear-gradient(145deg,#0b1d2af7,#060e1af7);box-shadow:0 15px 40px #0008,inset 0 0 26px #4ef5ff07;border-radius:3px}
      .sf-training-body{flex:1;min-height:0;overflow-x:hidden;overflow-y:auto;padding:0 5px 0 0;scrollbar-width:thin;scrollbar-color:#39667a #091321;overscroll-behavior:contain}.sf-training-body:focus-visible{outline:1px solid #4ef5ff88;outline-offset:2px}
      .sf-training-kicker{color:#74d6df;font:700 9px 'Oxanium',system-ui,sans-serif;letter-spacing:.15em;margin:0 0 8px}.sf-training h2{font:700 clamp(17px,1.9vw,27px)/1.13 'Oxanium',system-ui,sans-serif;letter-spacing:.01em;margin:0 0 10px}.sf-training-copy{font-size:clamp(11px,1.05vw,14px);line-height:1.45;color:#c1d1df;margin:0 0 11px}
      .sf-training-progress{height:3px;background:#20394b;overflow:hidden;margin-bottom:14px}.sf-training-progress i{height:100%;display:block;background:var(--sf-cyan);transition:width .2s}
      .sf-training-keys{display:flex;flex-wrap:wrap;gap:5px;margin:0 0 12px}.sf-training-keys span{padding:4px 5px;background:#142b3a;border:1px solid #2c4e64;color:#e4f9ff;font:600 8px 'Oxanium',system-ui,sans-serif;letter-spacing:.03em}
      .sf-training-goals{list-style:none;padding:0;margin:0 0 12px;display:grid;gap:7px}.sf-training-goals li{display:flex;gap:7px;color:#b4c8d8;font-size:clamp(10px,.97vw,13px);line-height:1.3}.sf-training-goals li:before{content:'○';font-size:12px;line-height:1.1;color:#7493a7}.sf-training-goals li[data-done='true']{color:#9ce7bf}.sf-training-goals li[data-done='true']:before{content:'✓';color:#83eeb2}
      .sf-training-bindings{margin:0 0 12px;padding:10px;border:1px solid #34536a;background:#091b29}.sf-training-bindings h3{margin:0 0 8px;color:#83e5ec;font:700 9px 'Oxanium',system-ui,sans-serif;letter-spacing:.08em}.sf-training-binding-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px}.sf-training-binding-row{min-width:0;display:flex;flex-direction:column;align-items:flex-start;gap:4px}.sf-training-binding-row span{font:600 8px/1.35 'Oxanium',system-ui,sans-serif;letter-spacing:.03em;color:#9fbccd}.sf-training-binding-row kbd{max-width:100%;font:700 11px/1.4 'Oxanium',system-ui,sans-serif;white-space:normal;overflow-wrap:anywhere;color:#f1fcff;border:1px solid #44667c;background:#163044;box-shadow:none;padding:4px 6px}.sf-training-bindings[hidden]{display:none!important}@container(max-width:650px){.sf-training-binding-grid{grid-template-columns:1fr}}
      .sf-training-tip{font-size:clamp(10px,.92vw,12px);line-height:1.4;color:#829eaf;margin:10px 0 13px;padding-top:10px;border-top:1px solid #223d50}.sf-training-feedback{min-height:16px;font-size:11px;line-height:1.4;color:#a7d8e5;margin:9px 0}.sf-training-feedback[data-success='true']{color:#99efb8}
      .sf-training-footer{display:grid;grid-template-columns:minmax(0,1fr) auto auto;flex-shrink:0;align-items:stretch;gap:6px;margin-top:10px;padding-top:10px;border-top:1px solid #2d4c60}.sf-training-footer>.sf-training-feedback{grid-column:1/-1;margin:0 0 2px;min-height:16px}.sf-training-footer button{min-width:0}.sf-training-footer .sf-quiet{font-size:9px}.sf-training-step{display:flex;justify-content:space-between;gap:8px;color:#8fa9bd;font-size:9px;letter-spacing:.06em;margin-bottom:7px}
      .sf-training-paused{background:#3b3019;border:1px solid #8c7130;color:#ffe09a;font-size:11px;padding:9px;margin-bottom:12px}.sf-training-paused button{padding:4px 7px;margin-left:8px;font-size:9px;background:#56451e;border-color:#a58b45}
      .sf-training[data-wide='true'] .sf-training-panel{width:min(690px,88%);right:50%;transform:translateX(50%);top:20%;bottom:8%;max-height:72%}.sf-training-workshop{display:grid;grid-template-columns:1fr 1fr;gap:9px;margin:12px 0}.sf-training-slot-title{font:700 9px 'Oxanium',system-ui,sans-serif;letter-spacing:.14em;color:#8ba9be;margin:0 0 6px}.sf-training-workshop button{display:block;width:100%;text-align:left;margin-bottom:6px;min-height:64px;padding:10px}.sf-training-workshop button b{display:block;color:#dbe9ff;font-size:10px}.sf-training-workshop button small{display:block;color:#90aabd;font:400 11px/1.35 'Chakra Petch',system-ui,sans-serif;margin-top:5px;letter-spacing:0}.sf-training-workshop button[aria-pressed='true']{background:#163b40;border-color:#65e3bd;box-shadow:inset 3px 0 #65e3bd}.sf-training-combo{padding:10px;border:1px solid #79663e;background:#2c2619;color:#e1d3a7;font-size:12px;line-height:1.4}.sf-training-combo b{display:block;color:#ffd166;font:700 10px 'Oxanium',system-ui,sans-serif;margin-bottom:4px;letter-spacing:.08em}
      .sf-training-launch{margin-top:14px;padding:12px;border:1px solid #345368;background:#091925;text-align:left}.sf-training-launch h3{margin:0 0 10px;color:#8de4e9;font:700 11px 'Oxanium',sans-serif;letter-spacing:.08em}.sf-training-launch b{color:#c5edf2;font:700 9px 'Oxanium',sans-serif;letter-spacing:.04em}.sf-training-launch p{color:#aec7d6;font-size:11px;line-height:1.45;margin:5px 0 12px}.sf-training-launch summary{color:#e5cd91;font:700 9px/1.4 'Oxanium',sans-serif;cursor:pointer;padding:8px 0}.sf-training-launch details{border-top:1px solid #284355}.sf-training-launch p:last-child{margin-bottom:0}
      .sf-training-quiz{margin:12px 0;padding:13px;border:1px solid #345368;background:#091723}.sf-training-quiz small{font-size:9px;color:#7da3bb;letter-spacing:.1em}.sf-training-quiz p{margin:8px 0 12px;font-size:15px;color:#e9f7ff}.sf-training-quiz-choices{display:flex;gap:7px}.sf-training-quiz-choices button{flex:1;padding:10px 7px}.sf-training-reward-log{font-size:11px;line-height:1.45;color:#9cdbb8;padding-left:17px;margin:11px 0 0}.sf-training-reward-log li+li{margin-top:5px}
      .sf-training-select{width:100%;flex-shrink:0;font:400 11px 'Chakra Petch',system-ui,sans-serif;padding:7px;color:#d9e9f4;background:#0b1a28;border:1px solid #314d62;margin-top:8px;border-radius:2px}
      .sf-training-offer{position:absolute;inset:0;background:radial-gradient(ellipse at 50% 50%,#10273cef,#020711f2);display:grid;place-items:center;pointer-events:auto;padding:6%;overflow:auto}.sf-training-offer-card{max-width:570px;padding:28px;border:1px solid #43697b;background:linear-gradient(145deg,#102634,#080f1c);box-shadow:0 20px 80px #0008}.sf-training-offer h2{font-size:clamp(26px,4vw,42px);margin-bottom:14px}.sf-training-offer-card>p{color:#abc2d2;font-size:14px;line-height:1.55}.sf-training-offer-card .sf-training-kicker{color:#4ef5ff;font-size:10px}.sf-training-offer-steps{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin:22px 0;color:#dbeef5;font-size:12px}.sf-training-offer-steps span{border-top:1px solid #36566d;padding-top:10px}.sf-training-offer-steps b{display:block;color:#4ef5ff;font:700 10px 'Oxanium',system-ui,sans-serif;margin-bottom:5px}.sf-training-offer-actions{display:flex;gap:10px;flex-wrap:wrap}.sf-training-offer-actions button{padding:12px 18px}
      @media(max-width:800px){.sf-training-panel{width:35%;padding:12px;top:20%;max-height:71%}.sf-training-top{top:12%}.sf-training h2{font-size:17px}.sf-training-copy{font-size:11px}.sf-training-tip{font-size:10px}.sf-training-brand{font-size:9px}.sf-training-safety{font-size:9px}.sf-training-goals{gap:5px}.sf-training-keys{margin-bottom:8px}.sf-training-keys span{font-size:7px}.sf-training button{font-size:9px;padding:7px}.sf-training-panel .sf-training-tip{margin:8px 0}.sf-training-workshop button{min-height:54px;padding:8px}.sf-training-workshop button small{font-size:10px}.sf-training-quiz p{font-size:13px}}
      @media(max-width:540px){.sf-training-panel{width:39%;padding:8px}.sf-training-tools button{font-size:7px;padding:5px}.sf-training-brand{font-size:8px;letter-spacing:.07em}.sf-training-brand:before{font-size:18px}.sf-training-safety{font-size:7px}.sf-training-copy,.sf-training-goals li{font-size:9px}.sf-training h2{font-size:14px}.sf-training-tip{font-size:8px}.sf-training-keys{display:none}.sf-training-kicker{font-size:7px}.sf-training-feedback{font-size:9px}.sf-training-footer{grid-template-columns:1fr 1fr;gap:4px;margin-top:6px;padding-top:6px}.sf-training-footer .sf-primary{grid-column:1/-1}.sf-training-footer button{font-size:8px;padding:6px 4px}.sf-training-select{font-size:9px;padding:5px;margin-top:5px}.sf-training-offer-card{padding:18px}.sf-training-offer-card>p{font-size:12px}.sf-training-offer-steps{font-size:10px}}
      @media(prefers-reduced-motion:reduce){.sf-training *{transition:none!important}}
    `;
    doc.head.appendChild(style);
  }
  function element(doc,tag,className,text) {
    const node=doc.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=text;return node;
  }
  function create(options={}) {
    const root=options.root||document.getElementById('game-shell')||document.body,doc=root.ownerDocument||document;
    injectStyle(doc);
    let host=null,panel=null,body=null,goals=[],nextButton=null,feedback=null,pauseBanner=null,pauseButton=null,progressFill=null,step=-1,live=false,offering=false,done=false,skips=0,continueStory=false,memo={},latest={},lastPoint=null,seenPause=false,offerCallbacks=null,course='full',route=LESSONS;
    const learned=new Set();
    const safeCall=(name,...args)=>typeof options[name]==='function'?options[name](...args):undefined;
    const paused=()=>!!safeCall('isPaused')||latest.paused===true;
    function removeHost(){if(host)host.remove();host=null;panel=null;body=null;goals=[];nextButton=null;feedback=null;pauseBanner=null;pauseButton=null;progressFill=null;offerCallbacks=null;}
    function close(){live=false;offering=false;step=-1;removeHost();}
    function finish(completed){const result={completed:!!completed&&route.every(lesson=>learned.has(lesson.id)),continueStory,skippedLessons:skips};close();safeCall('finish',result);}
    function button(label,action,className='sf-quiet') {
      const node=element(doc,'button',className,label);node.type='button';node.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();action();node.blur?.();});return node;
    }
    function say(text,success=false){if(!feedback)return;feedback.textContent=text;feedback.dataset.success=String(success);}
    function updateProgress(){if(progressFill)progressFill.style.width=`${learned.size/route.length*100}%`;}
    function mark(index){if(!live||done||paused()||index<0||index>=memo.done.length||memo.done[index])return;memo.done[index]=true;if(goals[index])goals[index].dataset.done='true';if(memo.done.every(Boolean)){done=true;learned.add(route[step].id);updateProgress();nextButton.disabled=false;nextButton.textContent=step===route.length-1?(course==='intro'?'CONTINUE TO GARAGE':'GRADUATE'): 'CONTINUE →';if(course==='intro'&&step===route.length-1)renderLaunchNotes();say((safeCall('formatLesson',route[step])||{}).completeCopy||'Practice complete. Continue when you are ready.',true);}}
    function renderBindings(container,lesson){
      container.replaceChildren();container.hidden=!lesson.inputs?.length;if(container.hidden)return;
      container.appendChild(element(doc,'h3','',lesson.inputHeading||'YOUR CONTROLS'));
      const grid=element(doc,'div','sf-training-binding-grid');
      for(const input of lesson.inputs){const row=element(doc,'div','sf-training-binding-row');row.dataset.inputAction=input.action;row.append(element(doc,'span','',input.label),element(doc,'kbd','',input.binding));grid.appendChild(row)}
      container.appendChild(grid);
    }
    function launchInputCopy(){return(safeCall('formatLesson',{copy:'T opens your Run Build. At 100% DOSE, Q clears hostile shots and strikes active boss cores.',tip:'',keys:[],goals:[]})||{}).copy||'Inspect your Run Build and use Delta at 100% DOSE.'}
    function renderLaunchNotes(){
      if(body.querySelector('.sf-training-launch'))return;
      const notes=element(doc,'section','sf-training-launch');notes.setAttribute('aria-label','Your Story flight');
      notes.appendChild(element(doc,'h3','','YOUR STORY FLIGHT'));
      for(const [title,copy]of[
        ['GEAR → GARAGE','Asterprints are lasting equipment with random stat rolls. Equip between rounds. Compare the effect and rolls as well as Power.'],
        ['MINIBOSS → RECOVERY','Choose one repair, shield or Delta recharge. Each service applies once.'],
        ['MAIN BOSS → RUN PERK','Keep up to three active perks. When full, replace one or keep your build. Perks end with the run.']
      ]){const row=element(doc,'div');row.append(element(doc,'b','',title),element(doc,'p','',copy));notes.appendChild(row)}
      const details=element(doc,'details');details.appendChild(element(doc,'summary','','GEAR SETS & SUPPORT WEAPONS'));
      details.appendChild(element(doc,'p','','Two or four matching gear alignments activate set bonuses. Named equipment pairs require both listed effects. Four set pieces keep their two-piece bonus.'));
      details.appendChild(element(doc,'p','','Missiles launch with your shots. Bits guard above and below, blocking pink fire. Amber fire pierces Force and Bits; shields absorb one hit each. Colored crystals change Force patterns. Mission limits keep upgrades in check.'));
      details.appendChild(element(doc,'p','sf-training-next-input',launchInputCopy()));notes.appendChild(details);
      notes.appendChild(element(doc,'p','','Next, visit your Garage for a short equipment walkthrough. You will return to the mission briefing before departing.'));
      body.appendChild(notes);
    }
    function resume(){if(paused())safeCall('pauseToggle');latest.paused=false;updatePause();}
    function updatePause(){if(!live||!pauseBanner)return;const isPaused=paused();pauseBanner.hidden=!isPaused;if(pauseButton)pauseButton.textContent=isPaused?'RESUME':'PAUSE';if(nextButton)nextButton.disabled=!done||isPaused;seenPause=isPaused;}
    function replay(){if(!live)return;resume();load(step);}
    function advance(){if(!live||!done||paused())return;if(step===route.length-1)finish(true);else load(step+1);}
    function skip(){if(!live)return;resume();skips++;if(step===route.length-1)finish(false);else load(step+1);}
    function mount(){removeHost();host=element(doc,'section','sf-training');host.setAttribute('aria-label',course==='intro'?'First Flight guided practice':'Flight School guided practice');root.appendChild(host);}
    function renderWorkshop(){
      const grid=element(doc,'div','sf-training-workshop');
      for(const slot of ['weapon','armor']){
        const group=element(doc,'div');group.appendChild(element(doc,'p','sf-training-slot-title',slot.toUpperCase()+' INTRINSIC'));
        for(const gear of WORKSHOP.filter(item=>item.slot===slot)){
          const card=button('',()=>{if(done||paused())return;memo.selected[slot]=gear.id;for(const sibling of group.querySelectorAll('button'))sibling.setAttribute('aria-pressed',String(sibling===card));if(memo.selected.weapon==='siege'&&memo.selected.armor==='capacitor'){mark(0);combo.dataset.active='true';combo.querySelector('b').textContent='CHARGED BASTION // ACTIVE';say('Charged Bastion active: +6% charged fighter damage while a shield remains.',true);}else if(memo.selected.weapon&&memo.selected.armor)say('This pair does not activate Charged Bastion. Match both named requirements.');else say('One slot selected. Choose the matching intrinsic in the other slot.');});
          card.setAttribute('aria-pressed','false');card.appendChild(element(doc,'b','',gear.name));card.appendChild(element(doc,'small','',gear.text));group.appendChild(card);
        }
        grid.appendChild(group);
      }
      const combo=element(doc,'div','sf-training-combo');combo.appendChild(element(doc,'b','','CHARGED BASTION // REQUIRES BOTH'));combo.appendChild(element(doc,'span','','Siege Coil + Capacitor Plating: charged fighter shots gain another 6% damage while a shield remains.'));
      body.append(grid,combo);
    }
    function renderQuiz(){
      const quiz=element(doc,'div','sf-training-quiz'),counter=element(doc,'small'),question=element(doc,'p'),choices=element(doc,'div','sf-training-quiz-choices'),log=element(doc,'ul','sf-training-reward-log');
      quiz.append(counter,question,choices,log);body.appendChild(quiz);
      function show(){
        choices.replaceChildren();
        if(memo.reward===REWARDS.length){counter.textContent='ALL THREE ROUTED';question.textContent='Gear persists. Recovery applies once. Up to three perks shape this run.';mark(0);return;}
        counter.textContent=`REWARD ${memo.reward+1} / ${REWARDS.length}`;question.textContent=REWARDS[memo.reward].name;
        for(const [id,label] of [['garage','GARAGE'],['module','RECOVERY SERVICE'],['doctrine','RUN PERK']])choices.appendChild(button(label,()=>{
          if(done||paused())return;const reward=REWARDS[memo.reward];if(id!==reward.answer){say(id==='garage'?'Garage stores equipment. This choice applies to the current run.':'Gear goes to the Garage. A recovery service applies once. Run perks fill three slots, then replace an active perk.');return;}
          log.appendChild(element(doc,'li','',reward.explain));memo.reward++;say('Correct. '+reward.explain,true);show();
        }));
      }
      show();
    }
    function load(index){
      if(!Number.isInteger(index)||index<0||index>=route.length)return;
      step=index;done=false;const lesson=safeCall('formatLesson',route[step])||route[step];memo={done:lesson.goals.map(()=>false),distance:0,preciseDistance:0,selected:{},reward:0};latest={};lastPoint=null;seenPause=false;
      if(!host)mount();else host.replaceChildren();host.dataset.course=course;host.dataset.wide=String(['synergy','progression'].includes(lesson.id));host.dataset.lesson=lesson.id;
      const top=element(doc,'div','sf-training-top'),brand=element(doc,'div','sf-training-brand'),brandText=element(doc,'div','',course==='intro'?'FIRST FLIGHT':'FLIGHT SCHOOL');brandText.appendChild(element(doc,'small','sf-training-safety','ISOLATED PRACTICE · YOUR SAVE IS SAFE'));brand.appendChild(brandText);top.appendChild(brand);
      const tools=element(doc,'div','sf-training-tools');pauseButton=button('PAUSE',()=>{safeCall('pauseToggle');latest.paused=!!safeCall('isPaused');updatePause();});tools.append(pauseButton,button('EXIT SCHOOL',()=>finish(false)));top.appendChild(tools);host.appendChild(top);
      panel=element(doc,'div','sf-training-panel');panel.setAttribute('aria-label','Current lesson');host.appendChild(panel);
      body=element(doc,'div','sf-training-body');body.tabIndex=0;body.setAttribute('role','region');body.setAttribute('aria-label','Lesson instructions and objectives');panel.appendChild(body);
      const stepRow=element(doc,'div','sf-training-step');stepRow.append(element(doc,'span','',`LESSON ${step+1} / ${route.length}`),element(doc,'span','','GO AT YOUR PACE'));body.appendChild(stepRow);
      const progress=element(doc,'div','sf-training-progress');progressFill=element(doc,'i');updateProgress();progress.appendChild(progressFill);body.appendChild(progress);
      body.append(element(doc,'p','sf-training-kicker',lesson.chapter),element(doc,'h2','',lesson.title),element(doc,'p','sf-training-copy',lesson.copy));
      pauseBanner=element(doc,'div','sf-training-paused','PRACTICE PAUSED');pauseBanner.hidden=true;pauseBanner.appendChild(button('RESUME',resume));body.appendChild(pauseBanner);
      const keys=element(doc,'div','sf-training-keys');keys.hidden=!!lesson.inputs?.length;lesson.keys.forEach(key=>keys.appendChild(element(doc,'span','',key)));body.appendChild(keys);
      const bindings=element(doc,'section','sf-training-bindings');bindings.setAttribute('aria-label','Current control bindings');renderBindings(bindings,lesson);body.appendChild(bindings);
      goals=lesson.goals.map(text=>{const item=element(doc,'li','',text);item.dataset.done='false';return item;});const goalList=element(doc,'ul','sf-training-goals');goalList.setAttribute('aria-label','Lesson objectives');goalList.append(...goals);body.appendChild(goalList);
      if(lesson.id==='synergy')renderWorkshop();if(lesson.id==='progression')renderQuiz();
      body.appendChild(element(doc,'p','sf-training-tip',lesson.tip));feedback=element(doc,'p','sf-training-feedback','Complete the objectives to unlock Continue.');feedback.setAttribute('role','status');feedback.setAttribute('aria-live','polite');
      const footer=element(doc,'div','sf-training-footer');nextButton=button('COMPLETE OBJECTIVES',advance,'sf-primary');nextButton.disabled=true;footer.append(feedback,nextButton,button('RETRY',replay),button('SKIP LESSON',skip));panel.appendChild(footer);
      const lessonSelect=element(doc,'select','sf-training-select');lessonSelect.setAttribute('aria-label','Replay a lesson');const placeholder=element(doc,'option','','REPLAY A LESSON…');placeholder.value='';lessonSelect.appendChild(placeholder);route.forEach((item,i)=>{const option=element(doc,'option','',`${String(i+1).padStart(2,'0')} · ${item.title}`);option.value=String(i);lessonSelect.appendChild(option);});lessonSelect.addEventListener('change',()=>{if(lessonSelect.value==='')return;const index=Number(lessonSelect.value);if(!Number.isInteger(index)||index<0||index>=route.length)return;resume();load(index);});panel.appendChild(lessonSelect);
      safeCall('setupLesson',lesson.id);updatePause();
      // Never retain button focus: Space belongs to the wave cannon in flight.
      doc.activeElement?.blur?.();
    }
    function start(config={}){close();course=config.course==='intro'?'intro':'full';route=course==='intro'?INTRO_LESSONS:LESSONS;learned.clear();continueStory=!!config.continueStory;skips=0;live=true;const began=safeCall('begin');if(began===false||safeCall('isPractice')===false){close();return}load(0);}
    function offer(config={}){
      close();offering=true;mount();offerCallbacks=config;host.dataset.mode='offer';const intro=config.course==='intro';host.dataset.course=intro?'intro':'full';host.setAttribute('aria-label',intro?'First Flight choice':'Flight School choice');
      const backdrop=element(doc,'div','sf-training-offer'),card=element(doc,'div','sf-training-offer-card');card.setAttribute('role','dialog');card.setAttribute('aria-modal','true');card.setAttribute('aria-labelledby','sf-training-offer-title');
      card.appendChild(element(doc,'p','sf-training-kicker','BEFORE YOUR FIRST STORY FLIGHT'));const title=element(doc,'h2','','Learn the signal.');title.id='sf-training-offer-title';card.appendChild(title);
      card.appendChild(element(doc,'p','',intro?'Try five short lessons: fly, fire, use the Force and strike boss openings. Each lesson waits for you to try it. Retry or leave whenever you like.':'Take a short guided flight through movement, weapons, pickups, boss openings, and equipment synergies. Each lesson waits for you to try it. Retry or leave whenever you like.'));
      const steps=element(doc,'div','sf-training-offer-steps');for(const [number,label] of (intro?[['01','Fly & fire'],['02','Deploy & recall'],['03','Boss openings']]:[['01','Fly & fire'],['02','Force & pickups'],['03','Gear & synergies']])){const item=element(doc,'span','',label);item.prepend(element(doc,'b','',number));steps.appendChild(item);}card.appendChild(steps);
      card.appendChild(element(doc,'p','',intro?'Practice is separate from Story. Your progress stays safe.':'Practice runs in an isolated simulator. Your campaign, checkpoint, and Garage stay safe.'));
      const actions=element(doc,'div','sf-training-offer-actions');actions.append(button(intro?'PLAY FIRST FLIGHT':'ENTER FLIGHT SCHOOL',()=>{const callback=offerCallbacks?.onTrain;close();callback?.();},'sf-primary'),button('SKIP TO STORY',()=>{const callback=offerCallbacks?.onSkip;close();callback?.();}));card.appendChild(actions);backdrop.appendChild(card);host.appendChild(backdrop);
    }
    function note(type,payload={}){
      if(!live||step<0||done||paused())return;const id=route[step].id;
      if(id==='fire'&&type==='shot'){if(Number(payload.charge||0)<.24)mark(0);if(Number(payload.charge||0)>=.7)mark(1);}
      if(id==='force'&&type==='pickup'&&payload.type==='crystal'&&payload.color==='red')mark(0);
      if(id==='mount'&&type==='podBlock'&&memo.done[0]&&(course!=='intro'||memo.podMode==='deployed'))mark(1);
      if(id==='spectrum'){
        if(type==='pickup'&&payload.type==='crystal'){if(payload.color==='blue')mark(0);if(payload.color==='yellow')mark(2);}
        if(type==='shot'){if(payload.color==='blue'&&memo.done[0])mark(1);if(payload.color==='yellow'&&memo.done[2])mark(3);}
      }
      if(id==='support'){
        if(type==='pickup'){if(payload.type==='missile')memo.missile=true;if(payload.type==='bit')mark(1);if(payload.type==='shield')mark(3);}
        if(type==='shot'&&memo.missile)mark(0);if(type==='bitBlock'&&memo.done[1])mark(2);if(type==='shieldHit'&&memo.done[3])mark(4);
      }
      if(id==='delta'&&type==='delta'){mark(0);mark(1);}
      if(id==='cores'){if(type==='armorHit')mark(0);if(type==='weakHit')mark(1);}
      if(id==='salvage'&&(type==='gear'||(type==='pickup'&&payload.type==='gear')))mark(0);
    }
    function tick(dt,state={}){
      if(!live||step<0)return;if(safeCall('isPractice')===false){close();return}latest=state||{};if(paused()!==seenPause)updatePause();if(paused()||done)return;const id=route[step].id;
      if(id==='move'){
        const x=Number(state.x),y=Number(state.y);if(!Number.isFinite(x)||!Number.isFinite(y))return;
        if(lastPoint){const distance=Math.min(30,Math.hypot(x-lastPoint.x,y-lastPoint.y));memo.distance+=distance;if(state.precision||state.focus)memo.preciseDistance+=distance;}
        lastPoint={x,y};if(memo.distance>=80)mark(0);if(memo.preciseDistance>=30)mark(1);
      }
      if(id==='mount'){
        const mode=state.podMode||state.pod?.mode,side=state.dockSide||state.pod?.dockSide;
        memo.podMode=mode;if(mode==='deployed')mark(0);
        if(course==='intro'){if(memo.done[1]&&mode==='docked'&&side==='front')mark(2);}
        else{if(memo.done[0]&&mode==='docked'&&side==='rear')mark(2);if(memo.done[2]&&mode==='docked'&&side==='front')mark(3);}
      }
      if(id==='delta'&&Number(state.dose)>=100)mark(0);
    }
    function refreshInputHints(){
      if(!live||step<0||!body)return;const lesson=safeCall('formatLesson',route[step])||route[step];
      const copy=body.querySelector('.sf-training-copy'),tip=body.querySelector('.sf-training-tip'),keyBox=body.querySelector('.sf-training-keys');
      if(copy)copy.textContent=lesson.copy;if(tip)tip.textContent=lesson.tip;if(keyBox){keyBox.hidden=!!lesson.inputs?.length;keyBox.replaceChildren();for(const key of lesson.keys)keyBox.appendChild(element(doc,'span','',key))}
      goals.forEach((goal,index)=>{goal.textContent=lesson.goals[index]});
      const bindings=body.querySelector('.sf-training-bindings');if(bindings)renderBindings(bindings,lesson);if(done&&lesson.completeCopy)say(lesson.completeCopy,true);
      const nextInputs=body.querySelector('.sf-training-next-input');if(nextInputs)nextInputs.textContent=launchInputCopy();
    }
    return {start,offer,note,tick,close,retry:replay,advance,refreshInputHints,get canContinue(){return live&&done&&!paused()},get active(){return live||offering;},get lessonId(){return live&&step>=0?route[step].id:null;},get course(){return course;}};
  }
  window.StarfighterTraining=Object.freeze({create,lessonIds:Object.freeze(LESSONS.map(lesson=>lesson.id)),introLessonIds:INTRO_LESSON_IDS});
})();
