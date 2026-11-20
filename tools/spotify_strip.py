"""Remove the optional Spotify controls (and nothing else) from a page.

index.html and flight-school.html wrap the Flight Manual "YOUR MUSIC" group and the AUDIO MIX mini row in
<!-- spotify:start --> ... <!-- spotify:end --> markers. The Windows playtest build strips them unless it is run
with --with-spotify, so a default build contains no Spotify module, callback page, text or controls.

    python tools/spotify_strip.py --check index.html flight-school.html   # prove it on the real files
"""
import re
import sys
from pathlib import Path

START = '<!-- spotify:start -->'
END = '<!-- spotify:end -->'
_BLOCK = re.compile(r'[ \t]*' + re.escape(START) + r'.*?' + re.escape(END) + r'\r?\n?', re.S)


def strip(text):
    """Return (text without the Spotify blocks, number of blocks removed)."""
    return _BLOCK.subn('', text)


def _check(paths):
    for name in paths:
        text = Path(name).read_bytes().decode('utf-8')  # bytes, so CRLF is preserved exactly as in the build
        out, removed = strip(text)
        assert removed == 2, f'{name}: expected 2 Spotify blocks, found {removed}'
        assert 'spotify' not in out.lower(), f'{name}: Spotify text remains outside the markers'
        assert START not in out and END not in out, f'{name}: a marker was left behind'
        assert out.count('\r\n') == out.count('\n'), f'{name}: line endings were damaged'
        print(f'{name}: removed {removed} blocks, {len(text) - len(out)} characters')


def _self_test():
    sample = 'a\r\n  <!-- spotify:start -->\r\n  x Spotify\r\n  <!-- spotify:end -->\r\nb\r\n<!-- spotify:start -->y<!-- spotify:end -->c'
    out, removed = strip(sample)
    assert removed == 2 and out == 'a\r\nb\r\nc', repr(out)
    assert strip('no markers here') == ('no markers here', 0)


if __name__ == '__main__':
    _self_test()
    if '--check' in sys.argv:
        _check([arg for arg in sys.argv[1:] if not arg.startswith('--')])
    else:
        print('spotify_strip self-test passed')
