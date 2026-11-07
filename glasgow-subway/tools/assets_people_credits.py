"""Writes models/CREDITS.md and models/credits.json from the asset headers of the MakeHuman assets actually used by tools/assets_people_mpfb.py."""
import os, re, json, glob, sys
D = os.environ.get('MPFB_DATA') or '/tmp/claude-0/-home-user/52020da6-bb97-5dd3-88b8-ef2e78784739/scratchpad/mpfb/home/.config/blender/5.2/extensions/.user/user_default/mpfb/data/'
HERE = os.path.dirname(os.path.abspath(__file__)); OUT = os.path.join(os.path.dirname(HERE), 'models')
src = open(os.path.join(HERE, 'assets_people_mpfb.py')).read()
ns = {}; exec('import os\n' + src[src.index('PEOPLE = ['):src.index('# ------------------------------------------------------------------ helpers: mhmat')], ns)
used = set()
for p in ns['PEOPLE']:
    for c in p['clothes'] + ([p['shoes']] if p.get('shoes') else []): used.add(('clothes', c))
    used.add(('hair', p['hair'])); used.add(('skins', p['skin'])); used.add(('eyebrows', p['brows'])); used.add(('eyes', 'materials/' + p['eye']))
    if p.get('lashes'): used.add(('eyelashes', p['lashes']))
used.add(('eyes', 'high-poly'))
PACKURL = 'https://static.makehumancommunity.org/assets/assetpacks/'
rows = []
for k, n in sorted(used):
    path = D + k + '/' + n
    files = [f for f in glob.glob(path + '/*') if f.endswith(('.mhclo', '.mhmat'))] if os.path.isdir(path) else glob.glob(path + '.mhmat')
    au = li = ''
    for f in sorted(files):
        t = open(f, errors='ignore').read()
        m = re.search(r'^#?\s*author:?\s+(.*)$', t, re.M | re.I)
        if m and not au and m.group(1).strip().lower() != 'unknown': au = m.group(1).strip()
        m = re.search(r'^#?\s*licen[sc]e:?\s+(.*)$', t, re.M | re.I)
        if m and not li: li = m.group(1).strip()
        if 'explicitly released as CC0' in t and not li: li = 'CC0'
    li = re.sub(r'\s+', ' ', li); li = re.sub(r'^cc[ _-]?by', 'CC-BY', li, flags=re.I); li = re.sub(r'^cc[ _-]?0$', 'CC0', li, flags=re.I)
    li = li.replace('CC_by', 'CC-BY').replace('CC BY 4.0', 'CC-BY 4.0').replace('CC BY 3.0', 'CC-BY 3.0')
    li = re.sub(r'\s*\(https?://[^)]*\)', '', li)
    assert li in ('CC0', 'CC-BY', 'CC-BY 4.0', 'CC-BY 3.0'), (k, n, li)
    au = {'04saken': 'O4saken'}.get(au, au)   # the same author; one asset header has a zero for the O
    if not au: au = 'MakeHuman Community (Data Collection AB, J. Palmius, J. Hauquier)' if li == 'CC0' else 'see licence'
    rows.append(dict(name=f'{k}/{n}', author=au, licence=li, url='https://static.makehumancommunity.org/assets.html'))
rows.append(dict(name='MPFB2 2.0.18 (character generator, used as a tool)', author='Joel Palmius and contributors', licence='GPL-3.0-or-later (code only; generated meshes are CC0)', url='https://extensions.blender.org/add-ons/mpfb/'))
rows.append(dict(name='MakeHuman base mesh and targets', author='MakeHuman Community', licence='CC0', url='https://static.makehumancommunity.org/about/license.html'))
# credits.json is shared: the sound recordings (js/sim/audio.js SAMPLES, tools/make_running_audio.py) are credited in it too. Keep every row this
# script does not make, after the people's rows, as it found them.
mine = {r['name'] for r in rows}; kinds = tuple(k + '/' for k, _ in used)
try: old = json.load(open(os.path.join(OUT, 'credits.json')))
except FileNotFoundError: old = []
kept = [r for r in old if r['name'] not in mine and not r['name'].startswith(kinds) and not r['name'].startswith(('MPFB2', 'MakeHuman base mesh'))]
json.dump(rows + kept, open(os.path.join(OUT, 'credits.json'), 'w'), indent=1)
by_authors = sorted({r['author'] for r in rows if r['licence'].startswith('CC-BY') and r['author'] != 'see licence'}, key=str.lower)
BY = ', '.join(by_authors[:-1]) + ' and ' + by_authors[-1] if len(by_authors) > 1 else ''.join(by_authors)
md = '# Credits and licences for models/\n\nOnly CC0 and CC-BY assets are used (no AGPL, NC or share-alike).\n\n## Attribution\nPeople in `people.glb` / `people_lod.glb` were generated with MPFB2 (MakeHuman Plugin For Blender, GPL code used as a tool) from the CC0 MakeHuman base mesh, targets, skins, hair, eyes and clothes, plus CC-BY clothes and hair by ' + BY + ', all from the MakeHuman community asset repository (https://static.makehumancommunity.org/assets.html). CC-BY items: (c) the authors named below, licensed CC BY (3.0 / 4.0), https://creativecommons.org/licenses/by/4.0/ ; textures were resized and re-compressed, meshes decimated and fitted. Tartan kilts, skirts, hose, sporran, sash, trews and all other models are our own work (generic setts, no official clan tartan is claimed).\n\n## Assets\n| asset | author | licence |\n|---|---|---|\n'
for r in rows: md += f"| {r['name']} | {r['author']} | {r['licence']} |\n"
md += ('\nStation and in-train adverts in `adverts.jpg`, `adverts_land.jpg` and `adverts_cards.jpg` were generated with OpenAI image generation (via the Codex CLI) '
       'from our own briefs (`tools/adverts_prompts.md`). Every product, brand, book, author and charity in them is fictional.\n'
       '\nThe T-shirt chest prints in `tee_prints.png` were generated the same way from our own briefs (`tools/tee_prompts.md`) and keyed and packed by '
       '`tools/build_tee_prints.py`. Every name, brand and logo on them is fictional or one of this site\'s own documents.\n')
open(os.path.join(OUT, 'CREDITS.md'), 'w').write(md)
print(len(rows), 'rows')
