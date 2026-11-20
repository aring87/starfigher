"""Private survey: first-part-break draw cost for every main boss (production source, nothing edited).

Reuses the existing focused boss profiler's authored controls and observation code, but:
- runs bosses 0-9 at phase 2 with the same direct part break at 5 s,
- tolerates bosses the late-boss frame helper or the part-break step does not support (recorded as skipped),
- is analysed per frame by whether a palette miss/readback happened, which needs no late-boss pose model.
Draw timings are synchronous Canvas2D submission, not FPS.
"""
from pathlib import Path
import hashlib, json, re

r = Path(__file__).resolve().parent.parent
source_path = r / 'game.js'
source = source_path.read_text(encoding='utf-8')
source_hash = hashlib.sha256(source_path.read_bytes()).hexdigest()
version = int(re.search(r'game.js\?v=(\d+)', (r / 'index.html').read_text(encoding='utf-8'))[1])

profile_builder = (r / 'tools/build-boss-render-profile-preview.py').read_text(encoding='utf-8')
match = re.search(r"controller=r'''([\s\S]*?)'''\nend=", profile_builder)
assert match, 'Expected the existing private profiler controller.'
controller = match[1]


def replace_once(old, new):
    global controller
    assert controller.count(old) == 1, old[:100]
    controller = controller.replace(old, new)


replace_once('PRIVATE BOSS RENDER PROFILE', 'PRIVATE BOSS HITCH SURVEY')
replace_once('READY • Void Leviathan and Prism Warden phase2', 'READY • all ten main bosses phase2') if '•' in controller else None

loop_start = controller.index('try{for(const id of[5,6]){')
loop_end = controller.index("if(profileReport.scenes.length!==2)throw Error('Missing scenes');")
new_loop = (
    "try{for(const id of[0,1,2,3,4,5,6,7,8,9]){"
    "try{await profilePrepare(id,token);"
    "while(token===profileToken&&profileBusy&&profileTime<10)await profileSleep(25);"
    "if(token!==profileToken)throw Error('CANCELLED');"
    "if(!profileBusy)throw Error(profileReport.error||'Stopped');"
    "profileFinishScene()}"
    "catch(error){if(String(error&&error.message||error)==='CANCELLED')throw error;"
    "(profileReport.skipped||(profileReport.skipped=[])).push({id,error:String(error&&error.stack||error).slice(0,400)});"
    "profileScene=null;profileFrame=null;profileReport.status='running';delete profileReport.error;profileBusy=true;profilePaused=false;"
    "profileStatus.textContent='SKIPPED boss'+(id+1);requestAnimationFrame(profileTick)}}"
)
controller = controller[:loop_start] + new_loop + controller[loop_end:]
replace_once("if(profileReport.scenes.length!==2)throw Error('Missing scenes');", "if(!profileReport.scenes.length)throw Error('No scenes completed');")
replace_once('/2 scenes', '/10 scenes')
# The late-boss pose helper is only valid for late bosses; fall back to a neutral key otherwise.
replace_once('const animation=lateBossMaterialFrame(boss),assetId=', 'const animation=profileSafeFrame(boss),assetId=')
replace_once(' function profileBreak(){', " function profileSafeFrame(b){try{return lateBossMaterialFrame(b)}catch(error){return{source:b.def||b,frame:0}}}\n function profileBreak(){")

end = source.rfind('})();')
assert end >= 0
qa = source[:end] + f'\nconst PROFILE_SOURCE_VERSION={version},PROFILE_SOURCE_HASH={json.dumps(source_hash)};\n' + controller + source[end:]
(r / 'artifacts/boss-hitch-survey-preview-game.js').write_text(qa, encoding='utf-8')
html = (r / 'index.html').read_text(encoding='utf-8').replace('<head>', '<head><base href="../">', 1)
html = re.sub(r'<script src="game.js\?v=\d+"></script>', f'<script src="artifacts/boss-hitch-survey-preview-game.js?v={version}-{source_hash[:8]}"></script>', html)
storage = '''<script>const surveyMemory=new Map([['starfighterMuted','true']]);Object.defineProperty(window,'localStorage',{value:{getItem:k=>surveyMemory.get(String(k))??null,setItem:(k,v)=>surveyMemory.set(String(k),String(v)),removeItem:k=>surveyMemory.delete(String(k)),clear:()=>surveyMemory.clear(),key:n=>Array.from(surveyMemory.keys())[n]??null,get length(){return surveyMemory.size}}});</script>'''
(r / 'artifacts/boss-hitch-survey-preview.html').write_text(html.replace('<body>', '<body>' + storage, 1), encoding='utf-8')
print(f'Built boss hitch survey from source v{version}, SHA256 {source_hash}.')
