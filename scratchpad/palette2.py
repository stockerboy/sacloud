# -*- coding: utf-8 -*-
"""Clan mark -> up to 3 identifying colours.

Chromatic buckets win over neutral ones: a mark that is 70% grey outline and
20% blue reads as "the blue clan", not "the grey clan".  Neutral marks (black
and white) keep their extremes, which is what the deluxe mark actually is.
"""
import colorsys, io, json, os, sys
from PIL import Image

SRC = 'C:/Users/LG/Desktop/\uc11c\ud50c\ub77c\uc774/apps/web/public/assets/clans'
CHROMA_MIN = 0.055   # share a chromatic bucket must hold to count
NEUTRAL_MIN = 0.07

def hexof(rgb): return '#%02x%02x%02x' % rgb

def buckets_of(path):
    im = Image.open(path).convert('RGBA').resize((48, 48), Image.BILINEAR)
    buckets = {}
    px = list(im.getdata())
    for r, g, b, a in px:
        if a < 140:
            continue
        h, l, s = colorsys.rgb_to_hls(r / 255, g / 255, b / 255)
        neutral = s < 0.18 or l < 0.05 or l > 0.97
        key = ('n', min(4, int(l * 5))) if neutral else ('c', int(h * 18) % 18, min(2, int(l * 3)))
        e = buckets.setdefault(key, [0, 0, 0, 0])
        e[0] += r; e[1] += g; e[2] += b; e[3] += 1
    total = sum(v[3] for v in buckets.values())
    if total == 0:
        return [], []
    chrom, neut = [], []
    for key, (sr, sg, sb, n) in buckets.items():
        rgb = (sr // n, sg // n, sb // n)
        h, l, s = colorsys.rgb_to_hls(*[c / 255 for c in rgb])
        (chrom if key[0] == 'c' else neut).append({'rgb': rgb, 'h': h, 'l': l, 's': s, 'share': n / total})
    chrom.sort(key=lambda d: -d['share'])
    neut.sort(key=lambda d: -d['share'])
    return chrom, neut

def far(cand, taken):
    for t in taken:
        dh = min(abs(cand['h'] - t['h']), 1 - abs(cand['h'] - t['h']))
        if dh < 0.06 and abs(cand['l'] - t['l']) < 0.26:
            return False
    return True

def palette_of(path):
    chrom, neut = buckets_of(path)
    out = []
    for c in chrom:
        if c['share'] < CHROMA_MIN or len(out) == 2:
            break
        if far(c, out):
            out.append(c)
    # neutrals: the extremes read as "black and white", a mid grey reads as nothing
    keep = [d for d in neut if d['share'] >= NEUTRAL_MIN]
    keep.sort(key=lambda d: d['l'])
    for c in ([keep[0], keep[-1]] if len(keep) >= 2 else keep):
        if len(out) == 3:
            break
        if all(abs(c['l'] - t['l']) > 0.18 or t['s'] > 0.18 for t in out):
            out.append(c)
    if not out and (chrom or neut):
        out = [(chrom or neut)[0]]
    return [{'hex': hexof(c['rgb']), 'rgb': '%d,%d,%d' % c['rgb'],
             'share': round(c['share'], 3), 'l': round(c['l'], 3), 's': round(c['s'], 3)}
            for c in out]

res = {}
for name in sorted(os.listdir(SRC)):
    if not name.endswith('.png'):
        continue
    try:
        got = palette_of(os.path.join(SRC, name))
    except Exception as exc:                # noqa: BLE001
        print('SKIP %s %s' % (name, exc), file=sys.stderr); continue
    if got:
        res[name[:-4]] = got
json.dump(res, io.open(sys.argv[1], 'w', encoding='utf-8'), ensure_ascii=False, indent=0)
n = [len(v) for v in res.values()]
print('clans=%d  1색=%d 2색=%d 3색=%d' % (len(res), n.count(1), n.count(2), n.count(3)))
for k in ('deluxe', 'veritasclan'):
    if k in res: print(k, [c['hex'] for c in res[k]])
