/* Browser-standard gamepad input. No DOM, storage or keyboard emulation. */
(function(root,factory){
  'use strict';
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.StarfighterGamepad=api;
})(typeof window==='undefined'?null:window,function(){
  'use strict';
  const DEFAULT_BINDINGS=Object.freeze(Object.fromEntries(Object.entries({
    fire:[0,7],precision:[4,6],force:[2],mount:[3],delta:[1],pause:[9],tree:[8],up:[12],down:[13],left:[14],right:[15]
  }).map(([action,buttons])=>[action,Object.freeze(buttons)])));
  const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
  const finite=value=>Number.isFinite(value)?value:0;
  function create(options={}){
    const read=typeof options.getGamepads==='function'?options.getGamepads:null;
    const deadzone=options.deadzone===undefined?.18:options.deadzone;
    if(!Number.isFinite(deadzone)||deadzone<0||deadzone>=1)throw new RangeError('Gamepad deadzone must be between 0 and 1.');
    let selected=null,armed=false,previousButtons=[],supported=!!read;
    function cleared(rawButtons=[]){
      return{connected:!!selected,supported,index:selected?.index??null,id:selected?.id||'',moveX:0,moveY:0,fire:false,precision:false,
        pressed:{confirm:false,back:false,force:false,mount:false,delta:false,pause:false,tree:false,menuPause:false},nav:{x:0,y:0},rawButtons};
    }
    function requireNeutral(){armed=false;previousButtons=[];return cleared()}
    function disconnect(){
      const previous=selected;selected=null;armed=false;previousButtons=[];
      if(previous&&typeof options.onDisconnect==='function')try{options.onDisconnect({...previous})}catch{}
    }
    function value(button){return clamp(finite(typeof button==='number'?button:button?.value),0,1)}
    function down(button){return button?.pressed===true||value(button)>.5}
    function bindings(){
      let incoming;try{incoming=options.getBindings?.()}catch{}
      const valid=list=>Array.isArray(list)&&list.every(index=>Number.isInteger(index)&&index>=0&&index<=31);
      return Object.fromEntries(Object.entries(DEFAULT_BINDINGS).map(([action,defaults])=>[action,valid(incoming?.[action])?incoming[action]:defaults]));
    }
    function poll(){
      let pads=[];
      if(read){try{pads=Array.from(read()||[]);supported=true}catch{supported=false}}
      const available=pads.map((pad,index)=>({pad,index:Number.isInteger(pad?.index)&&pad.index>=0?pad.index:index,id:String(pad?.id||'Controller')})).filter(item=>item.pad&&item.pad.connected!==false&&item.pad.mapping==='standard');
      let device=selected?available.find(item=>item.index===selected.index&&item.id===selected.id):null;
      if(selected&&!device)disconnect();
      if(!device&&available.length){device=available[0];selected={index:device.index,id:device.id};armed=false;previousButtons=[]}
      if(!device){const output=cleared();output.unsupported=pads.some(pad=>pad&&pad.connected!==false&&pad.mapping!=='standard');return output}
      const buttons=Array.from(device.pad.buttons||[]),current=buttons.map(down),rawButtons=current.flatMap((pressed,index)=>pressed?[index]:[]);
      const rawX=clamp(finite(device.pad.axes?.[0]),-1,1),rawY=clamp(finite(device.pad.axes?.[1]),-1,1),magnitude=Math.hypot(rawX,rawY);
      if(!armed){
        // Keep capture data available, but do not carry a held menu button into
        // flight, charge release, or a newly connected controller session.
        if(magnitude<=deadzone&&!buttons.some(button=>button?.pressed===true||value(button)>.1))armed=true;
        previousButtons=current;return cleared(rawButtons);
      }
      const map=bindings(),held=action=>map[action].some(index=>current[index]),edge=action=>map[action].some(index=>current[index]&&!previousButtons[index]);
      let moveX=0,moveY=0;
      if(magnitude>deadzone){const strength=clamp((magnitude-deadzone)/(1-deadzone),0,1);moveX=rawX/magnitude*strength;moveY=rawY/magnitude*strength}
      const dpadX=Number(held('right'))-Number(held('left')),dpadY=Number(held('down'))-Number(held('up'));
      if(['up','down','left','right'].some(held)){const length=Math.hypot(dpadX,dpadY);moveX=length?dpadX/length:0;moveY=length?dpadY/length:0}
      const navX=Number(!!current[15])-Number(!!current[14]),navY=Number(!!current[13])-Number(!!current[12]);
      const nav=navX||navY?{x:navX,y:navY}:{x:Math.abs(rawX)>=.55?Math.sign(rawX):0,y:Math.abs(rawY)>=.55?Math.sign(rawY):0};
      const output={connected:true,supported,index:selected.index,id:selected.id,moveX,moveY,fire:held('fire'),precision:held('precision'),
        pressed:{confirm:!!current[0]&&!previousButtons[0],back:!!current[1]&&!previousButtons[1],force:edge('force'),mount:edge('mount'),delta:edge('delta'),pause:edge('pause'),tree:edge('tree'),menuPause:!!current[9]&&!previousButtons[9]},nav,rawButtons};
      previousButtons=current;return output;
    }
    return Object.freeze({poll,requireNeutral});
  }
  return Object.freeze({create,DEFAULT_BINDINGS});
});
