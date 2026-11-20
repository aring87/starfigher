/* Local one-shot samples. The game owns AudioContext, routing, mute and cooldowns. */
(function(root,factory){
  'use strict';
  const api=factory(root);
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.StarfighterSfxSamples=api;
})(typeof window==='object'?window:null,function(browser){
  'use strict';
  const manifest=Object.freeze({
    'hull-hit':'assets/audio/sfx/hull-hit.wav',
    'shield-hit':'assets/audio/sfx/shield-hit.wav',
    'force-block':'assets/audio/sfx/force-block.wav',
    'armor-hit':'assets/audio/sfx/armor-hit.wav',
    'core-hit':'assets/audio/sfx/core-hit.wav',
    'core-break':'assets/audio/sfx/core-break.wav',
    'pickup-confirm':'assets/audio/sfx/pickup-confirm.wav'
  });
  const keys=Object.keys(manifest);
  const voiceLimits=Object.freeze(Object.fromEntries(keys.map(key=>[key,key==='core-break'?3:2])));
  function disconnect(node){try{node?.disconnect?.()}catch(_){/* Already disconnected. */}}
  function usableContext(context){return !!context&&(typeof context==='object'||typeof context==='function')}

  function create(options={}){
    const host=browser||globalThis;
    const fetcher=options.fetcher===undefined?(typeof host.fetch==='function'?host.fetch.bind(host):null):options.fetcher;
    const encoded=new Map(),contexts=new WeakMap(),active=new Set();
    const voices=new Map(keys.map(key=>[key,[]]));
    let prefetched;

    // Only encoded bytes are fetched at startup. There is no audio device or
    // decode work until the caller supplies its gesture-created context.
    function prefetch(){
      if(!prefetched)prefetched=Promise.all(keys.map(key=>{
        const request=Promise.resolve().then(()=>{
          if(typeof fetcher!=='function')return null;
          return fetcher(manifest[key]);
        }).then(response=>{
          if(!response||response.ok===false||typeof response.arrayBuffer!=='function')return null;
          return response.arrayBuffer();
        }).then(bytes=>bytes&&bytes.byteLength>0&&typeof bytes.slice==='function'?bytes:null).catch(()=>null);
        encoded.set(key,request);
        return request;
      })).then(results=>results.some(Boolean));
      return prefetched;
    }

    function decode(context,bytes){
      if(!bytes)return Promise.resolve(null);
      // Support both callback and Promise implementations, and copy because
      // decodeAudioData may detach its argument. Keep the encoded cache intact.
      return new Promise(resolve=>{
        let settled=false;
        const finish=buffer=>{if(!settled){settled=true;resolve(buffer||null)}};
        try{
          const result=context.decodeAudioData(bytes.slice(0),finish,()=>finish(null));
          if(result&&typeof result.then==='function')result.then(finish,()=>finish(null));
        }catch(_){finish(null)}
      });
    }

    function prepare(context){
      if(!usableContext(context)||typeof context.decodeAudioData!=='function'||context.state==='closed')return Promise.resolve(false);
      const prior=contexts.get(context);
      if(prior)return prior.prepared;
      const record={buffers:new Map(),prepared:null};
      contexts.set(context,record);
      prefetch();
      record.prepared=Promise.all(keys.map(key=>encoded.get(key).then(bytes=>decode(context,bytes)).then(buffer=>{
        if(buffer)record.buffers.set(key,buffer);
        return !!buffer;
      }).catch(()=>false))).then(results=>results.some(Boolean));
      return record.prepared;
    }

    function release(voice,stop=false){
      if(!voice.active)return;
      voice.active=false;
      active.delete(voice);
      const list=voices.get(voice.key),index=list.indexOf(voice);
      if(index>=0)list.splice(index,1);
      voice.source.onended=null;
      if(stop){try{voice.source.stop()}catch(_){/* A one-shot may already have ended. */}}
      disconnect(voice.source);
      disconnect(voice.gain);
    }

    // This never queues an event while bytes or decoded buffers are pending.
    // false lets the caller use its existing procedural sound immediately.
    function play(key,options={}){
      if(!Object.prototype.hasOwnProperty.call(manifest,key))return false;
      const {context,output}=options;
      if(!usableContext(context)||!output||context.state&&context.state!=='running'||output.context&&output.context!==context)return false;
      const record=contexts.get(context),buffer=record?.buffers.get(key);
      if(!buffer){prepare(context);return false}
      const level=options.gain===undefined?1:options.gain;
      if(!Number.isFinite(level)||level<=0)return false;
      let source,gain,voice;
      try{
        source=context.createBufferSource();
        gain=context.createGain();
        source.buffer=buffer;
        const value=Math.min(level,2),now=Number.isFinite(context.currentTime)?context.currentTime:0;
        if(typeof gain.gain.setValueAtTime==='function')gain.gain.setValueAtTime(value,now);
        else gain.gain.value=value;
        source.connect(gain);
        gain.connect(output);
        const list=voices.get(key);
        // Retire before replacement so even dense contacts have a hard bound.
        while(list.length>=voiceLimits[key])release(list[0],true);
        voice={key,source,gain,active:true};
        list.push(voice);
        active.add(voice);
        source.onended=()=>release(voice);
        source.start(now);
        return true;
      }catch(_){
        if(voice)release(voice,true);
        else{disconnect(source);disconnect(gain)}
        return false;
      }
    }

    function stopAll(){for(const voice of Array.from(active))release(voice,true)}
    prefetch();
    return Object.freeze({manifest,prefetch,prepare,play,stopAll});
  }
  return Object.freeze({manifest,voiceLimits,create});
});
