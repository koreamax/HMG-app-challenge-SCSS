"""앱 아이콘: 현대 블루 바탕에 적재함 위 상자 + 벨트 (청록) 를 그린다."""
import os
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def icon(size):
    s = size * 4
    im = Image.new('RGBA', (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    r = int(s * 0.22)
    d.rounded_rectangle([0, 0, s - 1, s - 1], radius=r, fill=(0, 44, 95, 255))
    # 적재함 바닥
    d.rounded_rectangle([s * 0.16, s * 0.66, s * 0.84, s * 0.74], radius=int(s * 0.02), fill=(147, 160, 179, 255))
    # 상자
    d.rounded_rectangle([s * 0.3, s * 0.3, s * 0.7, s * 0.66], radius=int(s * 0.03), fill=(228, 220, 211, 255))
    d.rectangle([s * 0.47, s * 0.3, s * 0.53, s * 0.66], fill=(201, 168, 130, 255))
    # 벨트 (청록) 위로 넘겨 묶기
    w = int(s * 0.045)
    d.line([(s * 0.2, s * 0.66), (s * 0.3, s * 0.36), (s * 0.7, s * 0.36), (s * 0.8, s * 0.66)], fill=(0, 170, 210, 255), width=w, joint='curve')
    # 상태 점 (초록)
    d.ellipse([s * 0.7, s * 0.12, s * 0.86, s * 0.28], fill=(51, 214, 159, 255))
    return im.resize((size, size), Image.LANCZOS)

dens = {'mdpi': 48, 'hdpi': 72, 'xhdpi': 96, 'xxhdpi': 144, 'xxxhdpi': 192}
for k, px in dens.items():
    out = os.path.join(ROOT, 'android', 'app', 'src', 'main', 'res', 'mipmap-' + k)
    os.makedirs(out, exist_ok=True)
    icon(px).save(os.path.join(out, 'ic_launcher.png'))
icon(256).save(os.path.join(ROOT, 'web', 'public', 'icon.png'))
print('icons ok')
