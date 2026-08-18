#!/usr/bin/env python3
"""Inline src/engine.js into index.html.

index.html is the shipped game and is committed in built form, so it works when
opened straight from disk. Edit the engine in src/engine.js, then run this.
"""
import pathlib
import re
import sys

here = pathlib.Path(__file__).parent
engine = (here / 'src' / 'engine.js').read_text()
engine = engine.split("if (typeof module !== 'undefined')")[0]   # drop the node-only export
engine = engine.replace("'use strict';\n", '', 1).strip()

page = here / 'index.html'
html = page.read_text()
start, end = '/* ENGINE:START */', '/* ENGINE:END */'
if start not in html:
    sys.exit('engine markers missing from index.html')
html = re.sub(re.escape(start) + '.*?' + re.escape(end),
              lambda m: f'{start}\n{engine}\n{end}', html, flags=re.S)
page.write_text(html)
print(f'inlined {len(engine.splitlines())} lines of engine into index.html')
