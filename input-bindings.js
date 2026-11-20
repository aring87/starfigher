/* Shared keyboard/controller binding rules. No DOM or ambient storage access. */
(function(root,factory){
  'use strict';
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.StarfighterBindings=api;
})(typeof window==='undefined'?null:window,function(){
  'use strict';
  const storageKey='starfighterControls';
  const freeze=value=>{if(value&&typeof value==='object'&&!Object.isFrozen(value)){Object.values(value).forEach(freeze);Object.freeze(value)}return value};
  const clone=value=>JSON.parse(JSON.stringify(value));
  const actions=freeze([
    {id:'up',label:'Move up',devices:['keyboard','controller']},
    {id:'down',label:'Move down',devices:['keyboard','controller']},
    {id:'left',label:'Move left',devices:['keyboard','controller']},
    {id:'right',label:'Move right',devices:['keyboard','controller']},
    {id:'fire',label:'Fire / hold charge',devices:['keyboard','controller']},
    {id:'precision',label:'Precision flight',devices:['keyboard','controller']},
    {id:'force',label:'Deploy / recall Force',devices:['keyboard','controller']},
    {id:'mount',label:'Switch Force mount',devices:['keyboard','controller']},
    {id:'delta',label:'Activate Delta',devices:['keyboard','controller']},
    {id:'pause',label:'Pause / resume',devices:['keyboard','controller']},
    {id:'tree',label:'Inspect skill tree',devices:['keyboard','controller']},
    {id:'mouse',label:'Toggle mouse flight',devices:['keyboard']}
  ]);
  const defaults=freeze({version:1,
    keyboard:{up:['KeyW','ArrowUp'],down:['KeyS','ArrowDown'],left:['KeyA','ArrowLeft'],right:['KeyD','ArrowRight'],fire:['KeyZ','Space','KeyX'],precision:['ShiftLeft','ShiftRight'],force:['KeyC'],mount:['KeyV'],delta:['KeyQ'],pause:['Escape','KeyP'],tree:['KeyT'],mouse:['KeyM']},
    controller:{up:[12],down:[13],left:[14],right:[15],fire:[0,7],precision:[4,6],force:[2],mount:[3],delta:[1],pause:[9],tree:[8]}
  });
  const keyNames={Space:'Space',Escape:'Esc',ArrowUp:'↑',ArrowDown:'↓',ArrowLeft:'←',ArrowRight:'→',ShiftLeft:'Left Shift',ShiftRight:'Right Shift',Backspace:'Backspace',Delete:'Delete',Home:'Home',End:'End',PageUp:'Page Up',PageDown:'Page Down',Insert:'Insert',CapsLock:'Caps Lock',Backquote:'`',Minus:'−',Equal:'=',BracketLeft:'[',BracketRight:']',Backslash:'\\',Semicolon:';',Quote:"'",Comma:',',Period:'.',Slash:'/',NumpadAdd:'Numpad +',NumpadSubtract:'Numpad −',NumpadMultiply:'Numpad ×',NumpadDivide:'Numpad ÷',NumpadDecimal:'Numpad .'};
  const buttonNames=freeze(['A / Cross','B / Circle','X / Square','Y / Triangle','LB / L1','RB / R1','LT / L2','RT / R2','View / Share','Menu / Options','Left stick press','Right stick press','D-pad up','D-pad down','D-pad left','D-pad right']);
  function object(value,name){if(!value||typeof value!=='object'||Array.isArray(value))throw new TypeError(name+' must be an object.');return value}
  const actionLabel=id=>actions.find(action=>action.id===id)?.label||String(id);
  function validKey(code){return typeof code==='string'&&(/^(?:Key[A-Z]|Digit[0-9]|Numpad[0-9])$/.test(code)||Object.hasOwn(keyNames,code))}
  function validateValue(device,action,value){
    if(device==='keyboard'){
      if(!validKey(value))throw new RangeError('Choose a gameplay key. Tab, Enter, browser shortcuts and modifier commands stay reserved.');
      if(value==='Escape'&&action!=='pause')throw new RangeError('Escape stays reserved for Pause.');
    }else if(!Number.isInteger(value)||value<0||value>15)throw new RangeError('Choose a standard controller button (0–15).');
  }
  function validated(raw){
    object(raw,'Bindings');
    if(raw.version!==1||Object.keys(raw).some(key=>!['version','keyboard','controller'].includes(key)))throw new RangeError('Unsupported controls version or fields.');
    const output={version:1};
    for(const device of['keyboard','controller']){
      const incoming=object(raw[device],device+' bindings'),expected=Object.keys(defaults[device]),seen=new Set();
      if(Object.keys(incoming).length!==expected.length||Object.keys(incoming).some(key=>!expected.includes(key)))throw new RangeError('Unknown or missing '+device+' action.');
      output[device]={};
      for(const action of expected){
        const values=incoming[action];
        if(!Array.isArray(values)||values.length<1||values.length>3)throw new RangeError(actionLabel(action)+' needs one to three bindings.');
        output[device][action]=[];
        for(let index=0;index<values.length;index++){
          if(!Object.hasOwn(values,index))throw new RangeError('Binding slots cannot have gaps.');
          const value=values[index];validateValue(device,action,value);
          if(seen.has(value))throw new RangeError('A '+device+' input cannot trigger two actions.');
          seen.add(value);output[device][action].push(value);
        }
      }
    }
    return output;
  }
  function normalize(raw){try{return freeze(validated(raw))}catch{return freeze(clone(defaults))}}
  function load(storage){
    try{
      if(!storage||typeof storage.getItem!=='function')return normalize(defaults);
      const raw=storage.getItem(storageKey);return raw===null||raw===undefined?normalize(defaults):normalize(JSON.parse(raw));
    }catch{return normalize(defaults)}
  }
  function save(storage,bindings){
    try{
      const value=validated(bindings);
      if(!storage||typeof storage.setItem!=='function')throw new Error('Browser storage is unavailable.');
      if(storage.setItem(storageKey,JSON.stringify(value))===false)throw new Error('Browser storage could not save the controls.');
      return{saved:true};
    }catch(error){return{saved:false,error:error?.message||'Controls could not be saved.'}}
  }
  function rebind(config,device,action,slotIndex,value){
    const bindings=validated(config);
    if(!['keyboard','controller'].includes(device))throw new RangeError('Choose keyboard or controller.');
    if(!Object.hasOwn(bindings[device],action))throw new RangeError('Unknown '+device+' action.');
    if(!Number.isInteger(slotIndex)||slotIndex<0||slotIndex>2)throw new RangeError('Choose binding slot 0, 1 or 2.');
    const current=bindings[device][action],oldValue=current[slotIndex];let swapped=null;
    if(value===null){
      if(slotIndex>=current.length)throw new RangeError('This binding slot is already empty.');
      if(current.length===1)throw new RangeError(actionLabel(action)+' must keep at least one binding.');
      current.splice(slotIndex,1);
    }else{
      validateValue(device,action,value);
      if(oldValue!==value){
        let conflict=null;
        for(const[other,values]of Object.entries(bindings[device])){
          const index=values.indexOf(value);if(index!==-1){conflict={action:other,slot:index};break}
        }
        if(conflict){
          if(oldValue===undefined)throw new RangeError((device==='keyboard'?labelKey(value):labelButton(value))+' is already assigned to '+actionLabel(conflict.action)+'. Replace an occupied slot to swap them.');
          validateValue(device,conflict.action,oldValue);
          bindings[device][conflict.action][conflict.slot]=oldValue;
          swapped={action:conflict.action,slot:conflict.slot,previous:value,replacement:oldValue};
        }
        if(slotIndex>=current.length)current.push(value);else current[slotIndex]=value;
      }
    }
    return freeze({bindings:validated(bindings),swapped});
  }
  function actionsForKey(config,code){
    const keyboard=config?.keyboard;if(!keyboard||typeof code!=='string')return[];
    return actions.filter(action=>Array.isArray(keyboard[action.id])&&keyboard[action.id].includes(code)).map(action=>action.id);
  }
  function labelKey(code){
    if(Object.hasOwn(keyNames,code))return keyNames[code];
    if(typeof code==='string'&&/^Key[A-Z]$/.test(code))return code.slice(3);
    if(typeof code==='string'&&/^Digit[0-9]$/.test(code))return code.slice(5);
    if(typeof code==='string'&&/^Numpad[0-9]$/.test(code))return'Numpad '+code.slice(6);
    return String(code??'Unassigned');
  }
  function labelButton(index){return buttonNames[index]||'Button '+String(index)}
  return freeze({storageKey,defaults,actions,normalize,load,save,rebind,actionsForKey,labelKey,labelButton});
});
