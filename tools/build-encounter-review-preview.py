"""All 22 encounters and secret rituals with isolated, ordinary Story rules."""
from pathlib import Path
import importlib.util
import re

root=Path(__file__).resolve().parent.parent
spec=importlib.util.spec_from_file_location('balance_preview',root/'tools/build-campaign-balance-preview.py')
preview=importlib.util.module_from_spec(spec)
spec.loader.exec_module(preview)
version=int(re.search(r'game.js\?v=(\d+)',(root/'index.html').read_text(encoding='utf-8'))[1])
preview.build_preview('encounter-review-preview',root/'game.js',f'CURRENT v{version}','v153 baseline',f'artifacts/encounter-review-baseline.html?v={version}',version)
preview.build_preview('encounter-review-baseline',root/'artifacts/boss-fairness-v154-baseline-game.js','BASELINE v153','current',f'artifacts/encounter-review-preview.html?v={version}',version)
print('Built private all-roster encounter review and ritual starts; normal Story resources, no real pilot writes.')
