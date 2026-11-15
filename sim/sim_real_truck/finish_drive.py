"""render_drive.py 가 만든 프레임으로 장면별 mp4 (24 fps), sheet.jpg (장면마다 4장), notes.json 을 만든다. Isaac 없이 돈다.

  python sim_real_truck/finish_drive.py            # base anaconda python (imageio-ffmpeg 필요)
"""
import json
import subprocess
import sys
from pathlib import Path

from PIL import Image

HERE = Path(__file__).resolve().parent
OUT = HERE / 'results' / 'hero_drive'
ORDER = ['S1', 'S2', 'S3', 'S4', 'S5']
TITLE = {'S1': '출발 전', 'S2': '차 안', 'S3': '주행 중 급제동 (벨트 4개)', 'S4': '쉼터에서 다시 조이기', 'S5': '반례: 벨트 2개'}

shots = [s for s in ORDER if (OUT / s / 'values.json').exists()]
notes = {'what': 'Photoreal clips for the contest short: driver checks the load -> app on the dash -> hard brake, cargo holds -> re-tighten at the rest area. '
                 'NVIDIA Isaac Sim 4.2 / Omniverse RTX path tracing, PhysX 5 vehicle at 240 Hz, 1920x1080, 24 fps, no text in the pictures.',
         'script': 'sim_real_truck/render_drive.py <S1..S5>  (then sim_real_truck/finish_drive.py)',
         'rerender_app_screen': 'APP_SCREEN_PNG=<new png> OMNI_KIT_ACCEPT_EULA=YES PYTHONUTF8=1 <env_isaacsim42 python> sim_real_truck/render_drive.py S2 && python sim_real_truck/finish_drive.py',
         'shots': {}}
thumbs = []
for s in shots:
    v = json.loads((OUT / s / 'values.json').read_text(encoding='utf-8'))
    frames = sorted((OUT / s).glob('f*.png'))
    mp4 = OUT / s / f'{s}.mp4'
    subprocess.run([sys.executable, str(HERE / 'encode_video.py'), str(OUT / s), str(mp4), '24'], check=True)
    v['title_ko'] = TITLE[s]
    v['frames_rendered'] = len(frames)
    v['mp4'] = str(mp4.relative_to(HERE.parent)).replace('\\', '/')
    fv = v.pop('frame_values', None)
    if fv:
        v['frame_values_file'] = f'results/hero_drive/{s}/values.json'
        v['speed_kmh_first_last'] = [fv[0]['kmh'], fv[-1]['kmh']]
    notes['shots'][s] = v
    pick = [frames[round(k * (len(frames) - 1) / 3)] for k in range(4)]
    thumbs.append([Image.open(p).convert('RGB').resize((480, 270), Image.LANCZOS) for p in pick])
if thumbs:
    gap = 6
    sheet = Image.new('RGB', (4 * 480 + 5 * gap, len(thumbs) * 270 + (len(thumbs) + 1) * gap), (12, 12, 14))
    for r, row in enumerate(thumbs):
        for c, im in enumerate(row):
            sheet.paste(im, (gap + c * (480 + gap), gap + r * (270 + gap)))
    sheet.save(OUT / 'sheet.jpg', quality=90)
notes['total_frames'] = sum(notes['shots'][s]['frames_rendered'] for s in shots)
(OUT / 'notes.json').write_text(json.dumps(notes, ensure_ascii=False, indent=1), encoding='utf-8')
print('FINISHED', shots, notes['total_frames'], 'frames')
