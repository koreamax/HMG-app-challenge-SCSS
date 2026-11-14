"""PC 시연 스크립트: Isaac Sim 급제동 기록을 센서 키트 형식(SSE)으로 앱에 보낸다 (기획서: 디버그 빌드에서만).

  python tools/kit_feed_server.py                 # 40 N 급제동 (짐 밀림)
  python tools/kit_feed_server.py --run lost15    # 15 N (짐 이탈), hold60 = 60 N (제자리)
  python tools/kit_feed_server.py --no-speed      # 속도 · 기어는 보내지 않는다 (차량 신호를 따로 넣을 때)

앱: 설정 -> 키트 서버 주소 (에뮬레이터는 http://10.0.2.2:8787/kit, 같은 PC 브라우저는 http://localhost:8787/kit) -> 연결.
처음 연결되면 정차(P) 3초 -> 기록 재생(D) -> 선 뒤 기어 P 로 끝난다. http://localhost:8787/start 로 다시 재생.
"""
import argparse, json, math, os, threading, time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, '..', 'web', 'src', 'data', 'isaac-runs.json')

ap = argparse.ArgumentParser()
ap.add_argument('--run', default='slide40', choices=['slide40', 'lost15', 'hold60'])
ap.add_argument('--port', type=int, default=8787)
ap.add_argument('--hz', type=float, default=10.0)
ap.add_argument('--no-speed', action='store_true')
args = ap.parse_args()

runs = {r['key']: r for r in json.load(open(DATA, encoding='utf-8'))['runs']}
state = {'run': args.run, 't0': None, 'lead': 3.0}
lock = threading.Lock()


def frame_at(t):
    rows = runs[state['run']]['rows']
    if t <= rows[0][0]:
        r, phase = rows[0], 'P'
    elif t >= rows[-1][0]:
        r, phase = rows[-1], 'P'
    else:
        i = next(k for k in range(1, len(rows)) if rows[k][0] >= t)
        a, b = rows[i - 1], rows[i]
        u = (t - a[0]) / max(1e-6, b[0] - a[0])
        r = [x + (y - x) * u for x, y in zip(a, b)]
        r[8] = a[8] if u < 0.5 else b[8]
        phase = 'D'
    t_, kmh, c1, c2, ax, ay, sx, sy, on = r[:9]
    mm = math.hypot(sx, sy)
    d = None
    if mm >= 1:
        d = ('front' if sy < 0 else 'rear') if abs(sy) >= abs(sx) else ('left' if sx < 0 else 'right')
    out = {'v': 1, 't': time.time(), 'belts': {'c1': round(c1, 2), 'c2': round(c2, 2)}, 'ax': round(ax, 4), 'ay': round(ay, 4),
           'shift': {'x': round(sx, 1), 'y': round(sy, 1), 'mm': round(mm, 1), 'dir': d}, 'tag': {'shock': on < 0.5, 'lost': on < 0.5},
           'fault': False, 'loads': {'NW': r[9], 'NE': r[10], 'SW': r[11], 'SE': r[12]}}
    if not args.no_speed:
        out['kmh'] = round(kmh, 2)
        out['gear'] = phase
    return out


class H(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def head(self, ctype):
        self.send_response(200)
        self.send_header('Content-Type', ctype)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Cache-Control', 'no-cache')
        self.end_headers()

    def do_GET(self):
        if self.path.startswith('/start'):
            with lock:
                state['t0'] = time.time() + state['lead']
            self.head('application/json')
            self.wfile.write(b'{"ok":true}')
            return
        if self.path.startswith('/run/'):
            key = self.path.split('/')[-1]
            if key in runs:
                with lock:
                    state['run'] = key
                    state['t0'] = time.time() + state['lead']
            self.head('application/json')
            self.wfile.write(json.dumps({'run': state['run']}).encode())
            return
        if not self.path.startswith('/kit'):
            self.head('application/json')
            self.wfile.write(json.dumps({'runs': list(runs), 'run': state['run']}).encode())
            return
        self.head('text/event-stream')
        with lock:
            if state['t0'] is None:
                state['t0'] = time.time() + state['lead']
        print('앱이 연결됨:', self.client_address[0], '재생', runs[state['run']]['label'])
        try:
            while True:
                t = time.time() - state['t0'] + runs[state['run']]['rows'][0][0]
                self.wfile.write(('data: ' + json.dumps(frame_at(t), ensure_ascii=False) + '\n\n').encode('utf-8'))
                self.wfile.flush()
                time.sleep(1 / args.hz)
        except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
            print('연결 끊김')


print(f'키트 서버 http://0.0.0.0:{args.port}/kit  (재생: {runs[args.run]["label"]})')
ThreadingHTTPServer(('0.0.0.0', args.port), H).serve_forever()
