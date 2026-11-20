"""Browser-native OfflineAudioContext audition of the production SFX class."""
from pathlib import Path
import hashlib

root=Path(__file__).resolve().parent.parent
source=(root/'game.js').read_text(encoding='utf-8')
start=source.index('  class SFX{')
end=source.index('  const sfx=new SFX();',start)
native=source[start:end]
html=r'''<!doctype html><html lang="en"><meta charset="utf-8"><title>Private audio clarity audition</title><style>body{margin:36px;max-width:1000px;background:#07121d;color:#d2e9f4;font:16px/1.65 system-ui}h1{font-size:26px}button,a{display:inline-block;margin:12px 12px 12px 0;padding:12px 18px;background:#102f42;color:#b7f7ff;border:1px solid #3e8494}audio{display:block;width:min(100%,720px)}output{display:block;color:#f3d88f}small{color:#8ba6b7}li{margin:5px 0}</style><h1>Private audio clarity audition</h1><p>Production sound effects rendered with the browser's native Web Audio engine. No music, no real pilot save and no external asset service.</p><button id="render">RENDER 8.5 SECOND AUDITION</button><a id="download" hidden download="audio-clarity-v150.wav">DOWNLOAD WAV</a><audio id="audio" controls></audio><output id="status" role="status">Not rendered. Rendering does not start playback.</output><ol><li>0.10–0.50 s: Force / Bit block</li><li>1.00–1.40 s: armored hit</li><li>1.80–2.20 s: exposed core hit</li><li>2.80–3.65 s: routine impacts and enemy fire, shield hit at 3.10 s</li><li>4.00–4.85 s: routine fire, hull hit at 4.30 s</li><li>5.30–6.15 s: routine fire, core break at 5.60 s</li><li>6.75 s: charge-ready cue; 7.40 s: weak-opening cue</li></ol><p><small>Rendered from SFX class SHA: __SHA__. Root volume 82%. A listening review is still needed on actual speakers/headphones.</small></p><script>
let muted=false,sfxVolume=.82;const clamp=(n,a,b)=>Math.min(b,Math.max(a,n)),rand=(a,b)=>a+Math.random()*(b-a);
__SFX__
function wav(buffer){
 const channels=buffer.numberOfChannels,length=buffer.length,bytes=new ArrayBuffer(44+length*channels*2),view=new DataView(bytes),rate=buffer.sampleRate;
 const str=(at,text)=>{for(let i=0;i<text.length;i++)view.setUint8(at+i,text.charCodeAt(i))};
 str(0,'RIFF');view.setUint32(4,36+length*channels*2,true);str(8,'WAVE');str(12,'fmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,channels,true);view.setUint32(24,rate,true);view.setUint32(28,rate*channels*2,true);view.setUint16(32,channels*2,true);view.setUint16(34,16,true);str(36,'data');view.setUint32(40,length*channels*2,true);
 let at=44,peak=0,sum=0,clipped=0;for(let i=0;i<length;i++)for(let ch=0;ch<channels;ch++){const raw=buffer.getChannelData(ch)[i];peak=Math.max(peak,Math.abs(raw));sum+=raw*raw;if(Math.abs(raw)>1)clipped++;const value=clamp(raw,-1,1);view.setInt16(at,Math.round(value*(value<0?32768:32767)),true);at+=2}
 return{blob:new Blob([bytes],{type:'audio/wav'}),peak,rms:Math.sqrt(sum/(length*channels)),clipped};
}
document.querySelector('#render').onclick=async()=>{
 const button=document.querySelector('#render'),status=document.querySelector('#status');button.disabled=true;status.textContent='Rendering actual synthesis and mix graph…';
 const NativeAudio=window.AudioContext,offline=new OfflineAudioContext(1,48000*8.5,48000);window.AudioContext=function(){return offline};
 try{
  const sound=new SFX();sound.init();const timeline=[];
  const add=(time,work)=>timeline.push([time,work]);
  for(let i=0;i<4;i++){add(.1+i*.12,()=>sound.podBlock());add(1+i*.12,()=>sound.armorHit());add(1.8+i*.12,()=>sound.coreHit())}
  for(const start of[2.8,4,5.3])for(let i=0;i<17;i++)add(start+i*.05,()=>{sound.impact();sound.enemyShot()});
  add(3.1,()=>sound.shield());add(4.3,()=>sound.hurt());add(5.6,()=>sound.weakBreak());add(6.75,()=>sound.chargeReady());add(7.4,()=>sound.weakOpen());
  // Offline suspension exposes native context time to the unchanged SFX class.
  const groups=new Map();for(const[time,work]of timeline){const key=Math.round(time*1000);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(work)}
  const pending=[...groups.entries()].sort((a,b)=>a[0]-b[0]).map(([ms,work])=>offline.suspend(ms/1000).then(()=>{for(const fire of work)fire();return offline.resume().catch(()=>{})}));
  const buffer=await offline.startRendering();await Promise.all(pending);const result=wav(buffer),url=URL.createObjectURL(result.blob),audio=document.querySelector('#audio'),download=document.querySelector('#download');
  if(audio.src)URL.revokeObjectURL(audio.src);audio.src=url;download.href=url;download.hidden=false;
  status.textContent=`READY / 8.5 s / 48 kHz mono PCM16 / PEAK ${result.peak.toFixed(4)} / RMS ${result.rms.toFixed(4)} / CLIPPED SAMPLES ${result.clipped}. Playback is manual.`;
  status.dataset.ready='true';status.dataset.peak=String(result.peak);status.dataset.clipped=String(result.clipped);
 }catch(error){status.textContent='Render failed: '+error.message;throw error}finally{window.AudioContext=NativeAudio;button.disabled=false}
};
</script></html>'''
html=html.replace('__SFX__',native).replace('__SHA__',hashlib.sha256(native.encode()).hexdigest())
(root/'artifacts/audio-clarity-preview.html').write_text(html,encoding='utf-8')
print('Built native Web Audio audition with explicit render/download controls.')
