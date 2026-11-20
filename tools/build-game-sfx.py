"""Prepare the supplied WAV masters for immediate, bounded gameplay feedback.

Only workspace copies are read. Downloads and source masters remain untouched.
Standard-library PCM editing keeps the asset build reproducible without codecs.
"""
from pathlib import Path
from array import array
import hashlib
import json
import math
import sys
import wave

ROOT=Path(__file__).resolve().parent.parent
SOURCE=ROOT/'assets/audio/source'
OUTPUT=ROOT/'assets/audio/sfx'
RATE=48000
PEAK=.8

def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def read_mono(path):
    with wave.open(str(path),'rb') as audio:
        channels,width,rate,frames=audio.getnchannels(),audio.getsampwidth(),audio.getframerate(),audio.getnframes()
        assert width==2 and channels==2 and rate==RATE,(path,channels,width,rate)
        raw=array('h',audio.readframes(frames))
    if sys.byteorder!='little':raw.byteswap()
    samples=[(raw[i]+raw[i+1])/65536 for i in range(0,len(raw),2)]
    return samples,{'channels':channels,'sampleRate':rate,'duration':frames/rate,'frames':frames,'sha256':digest(path)}

def cut(samples,start,end,gain=1):
    return [value*gain for value in samples[round(start*RATE):round(end*RATE)]]

def join(left,right,seconds):
    count=min(round(seconds*RATE),len(left),len(right))
    if count<2:return left+right
    blend=[left[len(left)-count+i]*math.cos(i/(count-1)*math.pi/2)+right[i]*math.sin(i/(count-1)*math.pi/2) for i in range(count)]
    return left[:-count]+blend+right[count:]

def finish(samples,fade_in,fade_out):
    # Remove a static offset before fading joins/endpoints; no pitch alteration.
    mean=sum(samples)/len(samples)
    samples=[value-mean for value in samples]
    for index in range(min(round(fade_in*RATE),len(samples))):
        count=max(2,round(fade_in*RATE))
        samples[index]*=.5-.5*math.cos(math.pi*index/(count-1))
    count=min(round(fade_out*RATE),len(samples))
    for index in range(count):samples[len(samples)-count+index]*=.5+.5*math.cos(math.pi*index/max(1,count-1))
    maximum=max(abs(value) for value in samples)
    assert maximum>1e-6,'An output must contain an audible event'
    return [value*PEAK/maximum for value in samples]

def stats(samples):
    windows=[math.sqrt(sum(value*value for value in samples[i:i+48])/len(samples[i:i+48])) for i in range(0,len(samples),48)]
    threshold=max(windows)*.1
    return {'duration':round(len(samples)/RATE,6),'frames':len(samples),'peak':round(max(abs(value) for value in samples),6),
        'rms':round(math.sqrt(sum(value*value for value in samples)/len(samples)),6),
        'onset10PercentRmsMs':next((i for i,value in enumerate(windows) if value>=threshold),None),
        'firstSample':round(samples[0],9),'lastSample':round(samples[-1],9)}

def write(path,samples):
    pcm=array('h',(round(max(-1,min(1,value))*32767) for value in samples))
    if sys.byteorder!='little':pcm.byteswap()
    with wave.open(str(path),'wb') as audio:
        audio.setnchannels(1);audio.setsampwidth(2);audio.setframerate(RATE);audio.writeframes(pcm.tobytes())

def main():
    OUTPUT.mkdir(parents=True,exist_ok=True)
    edits={
        'core-hit':{'trim':[.341,.555],'fadeIn':.001,'fadeOut':.025},
        'armor-hit':{'trim':[.362,.555],'fadeIn':.001,'fadeOut':.025},
        'force-block':{'trim':[.365,.585],'fadeIn':.001,'fadeOut':.030},
        'hull-hit':{'trim':[.353,.603],'fadeIn':.001,'fadeOut':.030},
        'shield-hit':{'trim':[.134,.415],'fadeIn':.002,'fadeOut':.050},
        'pickup-confirm':{'trim':[.036,.130],'fadeIn':.001,'fadeOut':.020},
        'core-break':{'segments':[[1.184,1.245,1],[1.784,1.858,.85],[.130,.620,.85]],'crossfades':[.012,.024],'fadeIn':.001,'fadeOut':.055}
    }
    report={'sampleRate':RATE,'channels':1,'format':'PCM16 WAV','normalizedPeak':PEAK,'processing':'Mono average, static DC removal, cosine endpoint fades; equal-power reassembly for core break; no pitch changes','assets':{}}
    for name,edit in edits.items():
        source=SOURCE/(name+'.wav');samples,original=read_mono(source)
        if 'trim' in edit:prepared=cut(samples,*edit['trim'])
        else:
            prepared=cut(samples,*edit['segments'][0])
            for segment,fade in zip(edit['segments'][1:],edit['crossfades']):prepared=join(prepared,cut(samples,*segment),fade)
        prepared=finish(prepared,edit['fadeIn'],edit['fadeOut'])
        output=OUTPUT/(name+'.wav');write(output,prepared)
        metrics=stats(prepared)
        assert metrics['peak']<=PEAK+1e-6 and metrics['onset10PercentRmsMs']<=18,(name,metrics)
        assert prepared[0]==prepared[-1]==0,name
        report['assets'][name]={'source':source.relative_to(ROOT).as_posix(),'sourceInfo':original,'edit':edit,'output':output.relative_to(ROOT).as_posix(),'outputInfo':metrics,'bytes':output.stat().st_size,'sha256':digest(output)}
        assert digest(source)==original['sha256'],'Source master changed'
        print(f"{name}: {metrics['duration']:.3f}s, onset {metrics['onset10PercentRmsMs']}ms, peak {metrics['peak']}")
    (ROOT/'artifacts/game-sfx-assets-v151.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')

if __name__=='__main__':main()
