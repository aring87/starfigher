"""Freeze the shipping browser game into one Windows executable; no dev tools or saves."""
from pathlib import Path
import hashlib,json,re,subprocess,zipfile,sys
from spotify_strip import strip as strip_spotify
r=Path(__file__).resolve().parent.parent
version=next((arg.split('=',1)[1] for arg in sys.argv if arg.startswith('--version=')),'v'+re.search(r'game.js\?v=(\d+)',(r/'index.html').read_text(encoding='utf-8'))[1])
if not re.fullmatch(r'v[0-9]+',version):raise SystemExit('Use a numeric version such as v159.')
release=r/'releases'/version;release.mkdir(parents=True,exist_ok=True)
exe=release/f'Starfighter-Playtest-{version}.exe'
if exe.exists():raise SystemExit('Frozen executable already exists; choose a new build rather than overwriting it.')
work=r/'artifacts'/f'windows-{version}-build';work.mkdir(parents=True,exist_ok=True)
# Spotify is optional and off the default build: Spotify's Developer Policy restricts games and commercial use (see SPOTIFY.md).
with_spotify='--with-spotify' in sys.argv
entry=['index.html','style.css','levels.js','systems.js','destruction.js','training.js','onboarding.js','input-bindings.js','gamepad.js','controls-ui.js','controls-ui.css','run-progression.js','run-rewards-ui.js','run-rewards-ui.css','encounter-tactics.js','stage-rhythm.js','combat-loss.js','ui-text.js','ui-text.css','sfx-samples.js','diagnostics.js','studio-intro.js','game.js','flight-school.html','flight-school-boot.js']
if with_spotify:entry+=['spotify.js','spotify-callback.html']
files={p:(r/p).read_bytes() for p in entry}
for folder in ['assets','music']:
 for p in sorted((r/folder).rglob('*')):
  if p.is_file() and p.suffix.lower() in (['.mp3'] if folder=='music' else ['.png','.jpg','.jpeg','.webp','.json','.js','.css','.ttf','.woff2','.wav','.ogg','.txt','.svg']):
   if p.name=='google-fonts-source.css':continue
   files[p.relative_to(r).as_posix()]=p.read_bytes()
for name in ['index.html','flight-school.html']:
 text=files[name].decode('utf-8').replace('SIGNAL ONLINE',f'PLAYTEST {version}')
 if not with_spotify:
  text,removed=strip_spotify(text);assert removed==2,'Spotify markers are missing from '+name
 if name=='index.html':
  lifecycle="""<script>(()=>{const key=new URLSearchParams(location.search).get('hostKey');if(!key)return;const root='/__playtest/'+encodeURIComponent(key)+'/';const ping=()=>fetch(root+'ping',{method:'POST',cache:'no-store'}).catch(()=>{});ping();setInterval(ping,2000);addEventListener('pagehide',()=>navigator.sendBeacon(root+'close',''));})();</script>"""
  text=text.replace('</head>',lifecycle+'</head>',1)
 files[name]=text.encode('utf-8')
hashes={name:hashlib.sha256(data).hexdigest() for name,data in sorted(files.items())}
files['content-manifest.json']=json.dumps(hashes,indent=2).encode('utf-8')
payload=work/'content.zip'
if '--relink' in sys.argv:
 with zipfile.ZipFile(payload) as z:assert json.loads(z.read('content-manifest.json'))==hashes,'Payload differs; rebuild fully.'
else:
 with zipfile.ZipFile(payload,'w',zipfile.ZIP_DEFLATED,compresslevel=6) as z:
  for name,data in sorted(files.items()):z.writestr(name,data)
launcher=work/'PlaytestLauncher.cs'
launcher.write_text((r/'tools/PlaytestLauncher.cs').read_text(encoding='utf-8').replace('v157',version),encoding='utf-8')
csc=Path('C:/Windows/Microsoft.NET/Framework64/v4.0.30319/csc.exe')
subprocess.run([str(csc),'/nologo','/optimize+','/target:winexe','/platform:anycpu','/out:'+str(exe),'/resource:'+str(payload)+',Starfighter.Content.zip','/reference:System.Windows.Forms.dll','/reference:System.Drawing.dll','/reference:System.IO.Compression.dll','/reference:System.IO.Compression.FileSystem.dll','/reference:System.Web.Extensions.dll',str(launcher)],check=True)
digest=hashlib.sha256(exe.read_bytes()).hexdigest()
(release/'SHA256.txt').write_text(digest+'  '+exe.name+'\n',encoding='utf-8')
manifest={'build':version,'executable':exe.name,'executableSha256':digest,'executableBytes':exe.stat().st_size,'files':len(hashes),'unpackedBytes':sum(map(len,files.values())),'contentHashes':hashes,'sourceHashes':{n:hashlib.sha256((r/n).read_bytes()).hexdigest() for n in entry},'launcherSourceSha256':hashlib.sha256(launcher.read_bytes()).hexdigest(),'runtime':'Windows 10/11, .NET Framework 4.7.2+ (included on current Windows), Microsoft Edge or Google Chrome. No Python/Node or network needed.','saveLocation':'%LOCALAPPDATA%/StarfighterLastSignal/Playtest/Browser','loopback':'127.0.0.1:18765','frozen':True}
(release/'build-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf-8')
(release/'READ ME FIRST.txt').write_text(('STARFIGHTER: LAST SIGNAL — FRIEND PLAYTEST v157\n\nSend Starfighter-Playtest-v157.exe. Double-click it to play. First launch unpacks the game; give it a moment. Windows 10/11 with Edge or Chrome is required. No Python, Node, account, installer or internet is required. This is an unsigned private playtest, not a store release.\n\nStart Story, choose PLAY SHORT INTRO and finish five drills. Each lesson shows your current keyboard keys or controller buttons. CONTINUE TO GARAGE opens a short guided equipment walkthrough; finish or skip it to return to your mission briefing, then choose DEPART. Settings: Flight Manual / Controls. Keyboard and standard controllers can be rebound. Practice does not award campaign equipment.\n\nPERFORMANCE LOG (optional but very helpful): open the Flight Manual from the main menu, find 04 PERFORMANCE LOG in the right-hand column and tick DIAGNOSTICS LOG before you play. It records only frame timing, error counts and basic system information (screen size, CPU threads, browser version) on this computer. It never records your saves or name and sends nothing anywhere. After playing, open the Flight Manual again and press SAVE FILE (or COPY TEXT if saving does not work), then send that file with your feedback. CLEAR deletes what it recorded. Flight School practice is never logged.\n\nGear has random rolls and set/pair effects. Equip between rounds in the Garage. Minibosses offer one recovery; main bosses offer a perk, with three active slots. Main Menu keeps the checkpoint and collected gear. Restart Run starts again.\n\nClose the game window to quit. If needed, use the Starfighter tray icon > Quit game. Saves stay on this computer under %LOCALAPPDATA%\\StarfighterLastSignal\\Playtest\\Browser, separate from the developer browser game. Keep the same Windows account for later sessions.\n\nPlease use Story for the first playtest. DEV Lab has extra test resources and does not represent Story difficulty. See FEEDBACK.txt for a short test route.\n').replace('v157',version),encoding='utf-8')
(release/'FEEDBACK.txt').write_text(('STARFIGHTER v157 — FRIEND PLAYTEST\n\n1. Start a fresh Story pilot and play the intro and Garage walkthrough without coaching. Did every drill name the controls you actually use?\n2. Return to the briefing, depart, and play missions 1–3 if you can. Use the Garage after a round.\n3. Try Pause > Main Menu > Load Game. Close and reopen the EXE once to check your save.\n4. If you have a controller, try movement, charge/release, Force, menus and one rebind.\n5. Before you play, tick Flight Manual > 04 PERFORMANCE LOG > DIAGNOSTICS LOG. When you finish, press SAVE FILE and send the file.\n\nSend back:\n- Windows version, screen size and keyboard/controller.\n- Where you first felt confused, bored or unfairly hit.\n- Mission and boss name, weapon color, gear/perks and hull/shields.\n- Did a weak point look attached and take damage? Did broken parts look clean?\n- Could you understand drops, gear comparison, recovery and run perks?\n- Were important sounds clear? Any loud, quiet or tiring effect?\n- Any stuck menu, bad scroll, lost item, save failure or slowdown. Say which boss or mission, and roughly when, if the game stuttered.\n- The saved diagnostics file (see READ ME FIRST).\n- A screenshot/video and steps to repeat a problem are ideal.\n\nThis build is frozen. Do not use DEV Lab results to judge Story difficulty. Veteran Campaign, gear levels and elements are not in this playtest.\n').replace('v157',version),encoding='utf-8')
print(json.dumps({'exe':str(exe),'MiB':round(exe.stat().st_size/1024**2,1),'files':len(hashes),'sha256':digest}))
