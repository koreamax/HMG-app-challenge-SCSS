"""실사 렌더용 질감 그림 (상자 골판지, 운송장, 취급 표시, 테이프). 브랜드 · 로고 없음.

  python sim_real_truck/make_textures.py      -> results/tex/*.png
"""
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

OUT = Path(__file__).resolve().parent / 'results' / 'tex'
OUT.mkdir(parents=True, exist_ok=True)
FONT_DIR = Path(r'C:\Users\DANHA\AppData\Local\Microsoft\Windows\Fonts')
rng = np.random.default_rng(7)


def font(weight, size):
    return ImageFont.truetype(str(FONT_DIR / f'Pretendard-{weight}.ttf'), size)


def kraft(n=1024):
    """이음매 없이 반복되는 골판지 (섬유 결 + 옅은 골 줄 + 얼룩)"""
    base = np.array([186, 146, 102], float)
    f = np.fft.fft2(rng.normal(size=(n, n)))
    ky = np.fft.fftfreq(n)[:, None]
    kx = np.fft.fftfreq(n)[None, :]
    # 가로로 긴 섬유 (x 방향 저주파, y 방향 고주파)
    fib = np.real(np.fft.ifft2(f * np.exp(-((kx * 9) ** 2 + (ky * 3) ** 2) * 60)))
    blot = np.real(np.fft.ifft2(np.fft.fft2(rng.normal(size=(n, n))) * np.exp(-((kx ** 2 + ky ** 2) * 900 ** 2 / 4))))
    fib = (fib - fib.mean()) / fib.std()
    blot = (blot - blot.mean()) / blot.std()
    flute = np.sin(np.arange(n)[:, None] / n * 2 * np.pi * 96) * np.ones((1, n))
    v = fib * 2.2 + blot * 6 + flute * 0.8 + rng.normal(size=(n, n)) * 5
    img = np.clip(base[None, None, :] + v[:, :, None] * np.array([1., .85, .7]), 0, 255).astype(np.uint8)
    Image.fromarray(img).save(OUT / 'kraft.png')
    return Image.fromarray(img)


def side_print(k):
    """상자 옆면 인쇄: 위 방향 화살표 · 깨짐 주의 · 무게 (검정 잉크, 골판지 위)"""
    W, H = 1600, 1280
    img = k.resize((W, H)).copy()
    d = ImageDraw.Draw(img)
    ink = (34, 30, 28)
    # 위 방향 화살표 두 개 (ISO 780)
    def arrows(x, y, s):
        for dx in (0, s * .55):
            cx = x + dx
            d.rectangle([cx - s * .06, y + s * .25, cx + s * .06, y + s], fill=ink)
            d.polygon([(cx - s * .2, y + s * .3), (cx, y), (cx + s * .2, y + s * .3)], fill=ink)
        d.rectangle([x - s * .22, y + s * 1.05, x + s * .77, y + s * 1.12], fill=ink)
    d.rectangle([90, 90, 430, 470], outline=ink, width=8)
    arrows(170, 140, 260)
    # 깨짐 주의 (유리잔)
    d.rectangle([470, 90, 810, 470], outline=ink, width=8)
    d.polygon([(560, 150), (720, 150), (690, 290), (590, 290)], outline=ink, width=12)
    d.rectangle([634, 290, 646, 400], fill=ink)
    d.rectangle([580, 400, 700, 414], fill=ink)
    d.line([(620, 160), (650, 220), (630, 260)], fill=ink, width=7)
    big = font('Bold', 120)
    mid = font('SemiBold', 64)
    d.text((90, 560), '취급주의', font=big, fill=ink)
    d.text((90, 720), '총중량 300 kg', font=mid, fill=ink)
    d.text((90, 810), '2단 이상 쌓지 마세요', font=mid, fill=ink)
    d.text((90, 1100), 'NO. 26-1114-0300', font=font('Medium', 52), fill=ink)
    img = img.filter(ImageFilter.GaussianBlur(.6))
    img.save(OUT / 'side_print.png')


def waybill():
    """운송장 (흰 종이, 바코드, 칸). 이름 · 주소는 가짜 값만"""
    W, H = 900, 1200
    img = Image.new('RGB', (W, H), (244, 244, 240))
    d = ImageDraw.Draw(img)
    ink = (20, 20, 22)
    d.rectangle([20, 20, W - 20, H - 20], outline=ink, width=5)
    d.text((50, 45), '화물 운송장', font=font('Bold', 70), fill=ink)
    d.text((50, 140), 'KR-2611-1185', font=font('SemiBold', 52), fill=ink)
    x = 50
    bars = rng.integers(1, 5, 70)
    for i, w in enumerate(bars):
        if i % 2 == 0:
            d.rectangle([x, 230, x + w * 4, 450], fill=ink)
        x += w * 4 + 3
        if x > W - 60:
            break
    rows = [('받는 곳', '물류센터 3번 도크'), ('품목', '가전 · 박스'), ('무게', '300 kg'), ('결박', '라쳇 2개')]
    y = 500
    for k, v in rows:
        d.line([(40, y), (W - 40, y)], fill=ink, width=3)
        d.text((60, y + 25), k, font=font('Medium', 44), fill=ink)
        d.text((300, y + 25), v, font=font('SemiBold', 48), fill=ink)
        y += 130
    d.line([(40, y), (W - 40, y)], fill=ink, width=3)
    img.filter(ImageFilter.GaussianBlur(.5)).save(OUT / 'waybill.png')


def tape():
    n = 512
    v = rng.normal(size=(n, n)) * 4
    img = np.clip(np.array([196, 160, 112], float)[None, None, :] + v[:, :, None], 0, 255).astype(np.uint8)
    Image.fromarray(img).filter(ImageFilter.GaussianBlur(1.2)).save(OUT / 'tape.png')


def webbing():
    """라쳇 벨트 웨빙 (짠 결 + 가장자리 줄)"""
    W, H = 256, 1024
    y = np.arange(H)[:, None]
    x = np.arange(W)[None, :]
    weave = (np.sin(y / 3.0) * np.sin(x / 2.0)) * 10
    edge = ((x < 18) | (x > W - 18)) * -28
    stripe = ((abs(x - W / 2) < 6)) * -18
    base = np.array([232, 140, 18], float)
    v = weave + edge + stripe + rng.normal(size=(H, W)) * 4
    img = np.clip(base[None, None, :] + v[:, :, None] * np.array([1, .8, .4]), 0, 255).astype(np.uint8)
    Image.fromarray(img).save(OUT / 'webbing.png')


if __name__ == '__main__':
    k = kraft()
    side_print(k)
    waybill()
    tape()
    webbing()
    print('TEX', sorted(p.name for p in OUT.iterdir()))
