"""PNG 프레임 -> MP4 (H.264, yuv420p, 30 fps). imageio-ffmpeg 의 ffmpeg 를 쓴다.

  python encode_video.py <frames_dir> <out.mp4> [fps] [hold_last_s]
"""
import subprocess
import sys
from pathlib import Path

import imageio_ffmpeg

src = Path(sys.argv[1])
out = Path(sys.argv[2])
fps = int(sys.argv[3]) if len(sys.argv) > 3 else 30
hold = float(sys.argv[4]) if len(sys.argv) > 4 else 0.
frames = sorted(src.glob('*.png'))
if not frames:
    raise SystemExit('no frames')
lst = src / '_list.txt'
lines = []
for f in frames:
    lines += [f"file '{f.as_posix()}'", f'duration {1 / fps:.6f}']
lines += [f"file '{frames[-1].as_posix()}'", f'duration {max(hold, 1 / fps):.6f}', f"file '{frames[-1].as_posix()}'"]
lst.write_text('\n'.join(lines), encoding='utf-8')
cmd = [imageio_ffmpeg.get_ffmpeg_exe(), '-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', str(lst),
       '-vf', f'fps={fps},format=yuv420p', '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-movflags', '+faststart', str(out)]
subprocess.run(cmd, check=True)
lst.unlink()
print('MP4', out, round(out.stat().st_size / 1e6, 1), 'MB', len(frames), 'frames')
