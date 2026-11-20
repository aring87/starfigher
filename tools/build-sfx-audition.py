"""Native Web Audio check and optional audition for the installed WAV effects."""
from pathlib import Path
import hashlib

root=Path(__file__).resolve().parent.parent
source=(root/'game.js').read_text(encoding='utf-8')
start=source.index('  class SFX{');end=source.index('  const sfx=new SFX();',start)
native=source[start:end]
html=r'''<!doctype html><html lang="en"><head><base href="../"><meta charset="utf-8"><title>Installed sound effects audition</title><style>body{margin:28px;max-width:1060px;background:#07121d;color:#d2e9f4;font:15px/1.6 system-ui}h1{font-size:25px}h2{font-size:18px;color:#a6e9ee}button,a{display:inline-block;margin:5px 6px 5px 0;padding:10px 14px;background:#102f42;color:#b7f7ff;border:1px solid #3e8494;border-radius:3px}audio{display:block;width:min(100%,720px);margin:10px 0}output{display:block;color:#f3d88f;margin:12px 0}small{color:#8ba6b7}#cues{display:flex;flex-wrap:wrap;gap:4px}.compare{display:grid;grid-template-columns:1fr 1fr;gap:22px}li{margin:4px 0}</style></head><body><h1>Installed sound effects audition</h1><p>Actual production SFX methods and local WAVs. Private preview: no game pilot or save is opened. Playback is explicit.</p><div id="cues"></div><output id="cue-status" role="status">Choose a cue to decode and play its installed sample.</output><h2>Core break: source and edited version</h2><div class="compare"><section><b>Original: two separate clusters, 2 seconds</b><audio controls preload="metadata" src="assets/audio/source/core-break.wav"></audio></section><section><b>Edited: fracture, impact, decay, 0.589 seconds</b><audio controls preload="metadata" src="assets/audio/sfx/core-break.wav"></audio></section></div><h2>Combat mix check</h2><button id="render">RENDER MIX CHECK</button><a id="download" hidden download="installed-sfx-v151.wav">DOWNLOAD MIX WAV</a><audio id="mix-audio" controls></audio><output id="render-status" role="status">Not rendered. Rendering does not start playback.</output><ol><li>0.10 s: Force / Bit blocks</li><li>1.00 s: armor hits</li><li>1.80 s: exposed core hits</li><li>3.10 s: shield hit over routine fire</li><li>4.30 s: hull hit over routine fire</li><li>5.60 s: edited core break over routine fire</li><li>6.70 s: favorite tiny sound on gear pickup</li><li>7.40 s: unchanged charge-ready cue; 8.00 s: weak-opening cue</li></ol><p><small>Production class SHA: __SHA__. The offline scheduler exposes its suspended state as running so the unchanged sample bank can schedule at native suspension times. Individual cue buttons use a normal, gesture-created AudioContext. Waveforms and mixing render natively; a subjective listening review still belongs to the player.</small></p><script src="sfx-samples.js?v=151"></script><script>
let muted=false,sfxVolume=.82;
const clamp=(n,a,b)=>Math.min(b,Math.max(a,n)),rand=(a,b)=>a+Math.random()*(b-a);
__SFX__
let liveSound;
const cues=[['Force / Bit block','podBlock'],['Armor hit','armorHit'],['Exposed core hit','coreHit'],['Shield hit','shield'],['Hull hit','hurt'],['Core / weapon break','weakBreak'],['Favorite: gear pickup','pickup']];
for(const[label,method]of cues){const button=document.createElement('button');button.textContent=label;button.id='cue-'+method;button.onclick=async()=>{const status=document.querySelector('#cue-status');button.disabled=true;try{liveSound||=new SFX();liveSound.setMuted(false);liveSound.init();await liveSound.samples.prepare(liveSound.c);let played;const sample=liveSound.sample;liveSound.sample=function(key,gain){const used=sample.call(this,key,gain);played={key,used};return used};try{liveSound[method]()}finally{liveSound.sample=sample}status.textContent=label+' / '+(played?.used?'INSTALLED WAV':'SYNTH FALLBACK')+' / '+(played?.key||'no sample');status.dataset.last=played?.key||'';status.dataset.sampled=String(!!played?.used);status.dataset.count=String(Number(status.dataset.count||0)+(played?.used?1:0))}finally{button.disabled=false}};document.querySelector('#cues').appendChild(button)}
function wav(buffer){
 const channels=buffer.numberOfChannels,length=buffer.length,bytes=new ArrayBuffer(44+length*channels*2),view=new DataView(bytes),rate=buffer.sampleRate;
 const str=(at,text)=>{for(let i=0;i<text.length;i++)view.setUint8(at+i,text.charCodeAt(i))};
 str(0,'RIFF');view.setUint32(4,36+length*channels*2,true);str(8,'WAVE');str(12,'fmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,channels,true);view.setUint32(24,rate,true);view.setUint32(28,rate*channels*2,true);view.setUint16(32,channels*2,true);view.setUint16(34,16,true);str(36,'data');view.setUint32(40,length*channels*2,true);
 let at=44,peak=0,sum=0,clipped=0;for(let i=0;i<length;i++)for(let ch=0;ch<channels;ch++){const raw=buffer.getChannelData(ch)[i];peak=Math.max(peak,Math.abs(raw));sum+=raw*raw;if(Math.abs(raw)>1)clipped++;const value=clamp(raw,-1,1);view.setInt16(at,Math.round(value*(value<0?32768:32767)),true);at+=2}
 let binary='';const array=new Uint8Array(bytes);for(let i=0;i<array.length;i+=16384)binary+=String.fromCharCode(...array.subarray(i,i+16384));
 return{href:'data:audio/wav;base64,'+btoa(binary),peak,rms:Math.sqrt(sum/(length*channels)),clipped};
}
document.querySelector('#render').onclick=async()=>{
 const button=document.querySelector('#render'),status=document.querySelector('#render-status');button.disabled=true;status.textContent='Decoding installed samples and rendering native mix...';
 liveSound?.setMuted(true);const NativeAudio=window.AudioContext,offline=new OfflineAudioContext(1,48000*8.5,48000);Object.defineProperty(offline,'state',{get:()=>'running'});window.AudioContext=function(){return offline};
 try{
  const sound=new SFX();sound.init();await sound.samples.prepare(offline);let used=0,missed=0;const sample=sound.sample;sound.sample=function(key,gain){const ok=sample.call(this,key,gain);if(ok)used++;else missed++;return ok};
  const timeline=[],add=(time,work)=>timeline.push([time,work]);
  for(let i=0;i<4;i++){add(.1+i*.12,()=>sound.podBlock());add(1+i*.12,()=>sound.armorHit());add(1.8+i*.12,()=>sound.coreHit())}
  for(const start of[2.8,4,5.3])for(let i=0;i<17;i++)add(start+i*.05,()=>{sound.impact();sound.enemyShot()});
  add(3.1,()=>sound.shield());add(4.3,()=>sound.hurt());add(5.6,()=>sound.weakBreak());add(6.7,()=>sound.pickup(2));add(7.4,()=>sound.chargeReady());add(8,()=>sound.weakOpen());
  const groups=new Map();for(const[time,work]of timeline){const key=Math.round(time*1000);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(work)}
  const pending=[...groups.entries()].sort((a,b)=>a[0]-b[0]).map(([ms,work])=>offline.suspend(ms/1000).then(()=>{for(const fire of work)fire();return offline.resume()}));
  const buffer=await offline.startRendering();await Promise.all(pending);const result=wav(buffer),audio=document.querySelector('#mix-audio'),download=document.querySelector('#download');audio.src=result.href;download.href=result.href;download.hidden=false;
  status.textContent=`READY / 8.5 s / SAMPLED ${used} / FALLBACK ${missed} / PEAK ${result.peak.toFixed(4)} / RMS ${result.rms.toFixed(4)} / CLIPPED ${result.clipped}. Playback is manual.`;
  status.dataset.ready='true';status.dataset.sampled=String(used);status.dataset.fallback=String(missed);status.dataset.peak=String(result.peak);status.dataset.clipped=String(result.clipped);
 }catch(error){status.textContent='Render failed: '+error.message;throw error}finally{window.AudioContext=NativeAudio;button.disabled=false}
};
</script></body></html>'''
html=html.replace('__SFX__',native).replace('__SHA__',hashlib.sha256(native.encode()).hexdigest())
(root/'artifacts/installed-sfx-preview.html').write_text(html,encoding='utf-8')
print('Built native sample audition and offline combat mix check, with explicit playback/download controls.')
