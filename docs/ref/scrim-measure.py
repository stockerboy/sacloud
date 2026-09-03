# 히어로 사진 위에서 글자가 읽히는지 재는 스크립트.
# 사장님이 사진을 바꾸시면 이걸로 다시 재고 `--hero-scrim` 한 줄만 고친다.
#   python docs/ref/scrim-measure.py docs/ref/2026-09-03_hero-night-original.png
#
# 2026-09-03 · O-041. 「사진을 재지 마라」(윤서)의 예외가 여기다 —
# 사진마다 한 번은 재야 α 를 정할 수 있다. 그 뒤로는 CSS 값만 읽으면 된다.
import sys
from PIL import Image

def lin(c):
    c = c / 255
    return c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4

def L(rgb):
    r, g, b = rgb
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)

def white_on(bg):  return 1.05 / (L(bg) + 0.05)
def black_on(bg):  return (L(bg) + 0.05) / 0.05

BANDS = [(0.00, 0.20, '맨위 (햄버거·로그인)'),
         (0.20, 0.40, '로고 자리'),
         (0.40, 0.60, '검색창 자리'),
         (0.60, 0.80, '리그버튼 자리'),
         (0.80, 1.00, '맨아래')]

def main(path):
    im = Image.open(path).convert('RGB')
    W, H = im.size
    print(f'{path}  {W}x{H}')
    print()
    print('띠마다 ★제일 밝은 픽셀★ 에서 흰 글자가 몇 대 1 인가')
    print('(평균이 아니라 최악을 본다. 달이 그 자리에 있으면 평균은 거짓말을 한다)')
    print()
    worst_overall = None
    for y0, y1, label in BANDS:
        band = im.crop((0, int(H * y0), W, int(H * y1))).resize((160, 40), Image.LANCZOS)
        px = list(band.getdata())
        bright = max(px, key=L)
        dark = min(px, key=L)
        print(f'  {label:20s} 흰글자 최악 {white_on(bright):5.2f}:1   '
              f'검은글자 최악 {black_on(dark):5.2f}:1   rgb{bright}')
        if 0.20 <= y0 < 0.60:  # 글자가 놓이는 띠만
            if worst_overall is None or L(bright) > L(worst_overall):
                worst_overall = bright
    print()
    print('★글자가 놓이는 띠(20~60%)에서 필요한 검은 막 진하기★')
    for target, what in ((3.0, '로고·큰 글자 3:1'), (4.5, '본문 4.5:1'), (7.0, '여유 7:1')):
        a = 0.0
        while a < 1:
            c = tuple(v * (1 - a) for v in worst_overall)
            if white_on(c) >= target:
                break
            a += 0.005
        print(f'  {what:18s} → α {a:.2f}')
    print()
    print('★막을 전면에 깔지 마라.★ 글자가 놓인 띠에만, 위아래로 사라지게 한다.')
    print('★backdrop-filter: blur 는 대체가 안 된다.★ 흐릴 뿐 밝기를 안 낮춘다.')

if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else 'docs/ref/2026-09-03_hero-night-original.png')
