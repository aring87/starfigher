"""Package a built friend playtest: self-test the EXE, run the front-end checks, write VERIFICATION.json,
copy the roadmap and create the ZIP plus its hash. Never overwrites an existing ZIP.

Run tools/build-windows-playtest.py first. Usage:
  python tools/package-playtest.py [--version=v168] [--browser-review=review.json]
The optional JSON file is a list of plain-language browser checks performed on the packaged payload.
"""
from pathlib import Path
import hashlib, json, re, shutil, subprocess, sys, zipfile

r = Path(__file__).resolve().parent.parent
arg = lambda name, default=None: next((a.split('=', 1)[1] for a in sys.argv if a.startswith(name + '=')), default)
version = arg('--version') or 'v' + re.search(r'game.js\?v=(\d+)', (r / 'index.html').read_text(encoding='utf-8'))[1]
if not re.fullmatch(r'v[0-9]+', version):
    raise SystemExit('Use a numeric version such as v168.')
release = r / 'releases' / version
exe = release / f'Starfighter-Playtest-{version}.exe'
zip_path = release / f'Starfighter-Playtest-{version}.zip'
if not exe.exists():
    raise SystemExit('Build the executable first: python tools/build-windows-playtest.py')
if zip_path.exists():
    raise SystemExit('The ZIP already exists; choose a new build rather than overwriting it.')
manifest = json.loads((release / 'build-manifest.json').read_text(encoding='utf-8'))
assert manifest['build'] == version and manifest['executable'] == exe.name
assert hashlib.sha256(exe.read_bytes()).hexdigest() == manifest['executableSha256'], 'EXE changed since it was built'

# 1) Run the packaged EXE's own self-test against a scratch data folder (never the real save location).
scratch = r / 'artifacts' / f'windows-{version}-selftest'
if scratch.exists():
    shutil.rmtree(scratch)
done = subprocess.run([str(exe), '--self-test', '--data-root', str(scratch)], timeout=900)
self_test = json.loads((scratch / 'self-test.json').read_text(encoding='utf-8'))
assert done.returncode == 0 and self_test['passed'] is True, 'EXE self-test failed'
assert self_test['files'] == manifest['files'], (self_test['files'], manifest['files'])
shutil.copy2(scratch / 'self-test.json', r / 'artifacts' / f'windows-{version}-self-test.json')
shutil.rmtree(scratch)  # the unpacked copy is ~400 MB and is not evidence

# 2) Front-end check suites: exit status decides pass/fail; the count comes from the suite's own summary.
SUITES = [('game', 'verify-game.cjs'), ('diagnostics', 'verify-diagnostics.cjs'), ('controlsIntegration', 'verify-controls-integration.cjs'),
          ('trainingController', 'verify-training.cjs'), ('trainingIntegration', 'verify-training-integration.cjs'), ('introBindings', 'verify-intro-bindings-v159.cjs'),
          ('introRecap', 'verify-intro-recap.cjs'), ('garageIntro', 'verify-garage-intro-v159.cjs'), ('retryRefit', 'verify-retry-refit.cjs'), ('lossRetry', 'verify-loss-retry.cjs')]
frontend, failures = {}, []
for key, script in SUITES:
    run = subprocess.run(['node', str(r / 'tools' / script)], cwd=r, capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=1800)
    out = run.stdout + run.stderr
    summary = re.search(r'(\d+)\s[^\n]*?passed', out)
    frontend[key] = int(summary[1]) if summary else len(re.findall(r'^PASS\b', out, re.M))
    print(f'{key:22s} exit={run.returncode} count={frontend[key]}')
    if run.returncode != 0:
        failures.append(key)
if failures:
    raise SystemExit('Front-end suites failed: ' + ', '.join(failures))

# 3) Verification report (limits are stated, not implied)
review_path = arg('--browser-review')
review = json.loads(Path(review_path).read_text(encoding='utf-8')) if review_path else []
report = {
    'build': version, 'passed': True, 'files': self_test['files'], 'payloadSha256': self_test['payloadSha256'], 'tests': self_test['tests'],
    'frontendChecks': frontend, 'browserReview': review,
    'limits': [
        'Memory-only temporary pilots and simulated input; no real pilot storage changed.',
        'Controller device is explicitly simulated, not physical gamepad validation.',
        'The EXE loopback self-test is separate from the browser review; the native Windows app window was not inspected.',
        'The diagnostics SAVE FILE download was tested with an injected download hook and in-page storage, not clicked in the packaged window.',
    ],
    'frozenSourceHashes': manifest['sourceHashes'],
}
(release / 'VERIFICATION.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
# The shipped roadmap omits the owner-internal Housekeeping section (repository and Git notes).
roadmap = (r / 'ROADMAP.md').read_text(encoding='utf-8')
start = roadmap.find('### Housekeeping, any time')
if start >= 0:
    end = roadmap.find(chr(10) + '## ', start)
    roadmap = roadmap[:start].rstrip(chr(10)) + chr(10) + chr(10) + (roadmap[end + 1:] if end >= 0 else '')
(release / 'ROADMAP.md').write_text(roadmap, encoding='utf-8', newline='')

# 4) ZIP (same layout as v159: one folder containing the files) and its hash
members = [exe.name, 'READ ME FIRST.txt', 'FEEDBACK.txt', 'SHA256.txt', 'build-manifest.json', 'VERIFICATION.json', 'ROADMAP.md']
with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED, compresslevel=6) as z:
    for name in members:
        z.write(release / name, f'Starfighter-Playtest-{version}/{name}')
digest = hashlib.sha256(zip_path.read_bytes()).hexdigest()
(release / 'ZIP-SHA256.txt').write_text(f'{digest}  {zip_path.name}\n', encoding='utf-8')
print(json.dumps({'zip': str(zip_path), 'MiB': round(zip_path.stat().st_size / 1024 ** 2, 1), 'sha256': digest, 'frontendChecks': frontend}))
