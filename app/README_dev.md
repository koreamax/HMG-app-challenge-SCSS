# 적재적소 앱 (Pleos Connect · Android Automotive + 휴대폰)

적재적소_기획서 v4 대로 동작하는 앱. 같은 웹 앱이 세 가지로 뜬다 (주소의 `?app=` 값).

| 판 | 어디서 | 화면 |
|---|---|---|
| **내비게이션** `nav` | Pleos Connect 차 화면 (1920 x 720 ~ 1080, 낮 · 밤) | 정차: 3D 확인 + 할 일 하나 / 주행: 색 하나 + 한 줄 + 음성 / 정차 후 다시 묶기 · 기록 |
| **휴대폰** `phone` | 기사 · 운영자 휴대폰 (390 x 844) | 상차 입력 · 3D 확인 · 짐 사진, 사건 → 다시 묶기 · 조인 뒤 사진, 기록 · 내보내기(PDF · JSON), **L4 허브**(무인 XCIENT 점검 정차 요청 · 점검 승인). 운전 중에는 "운전 중입니다"만 |
| **시연 무대** `stage` | 브라우저 기본값 | 내비 + 폰을 나란히, 오른쪽에 발표자 시연 패널. 두 판이 같은 엔진 · 운송장을 쓰므로 바로 맞물린다 |

디자인은 팀 깃허브 화면(`base/display/twin/web`, 흰 판 · 각진 모서리 · 1px 선 · 누를 것만 파랑 · 남색 3D 띠)을 키운 것이다: `design/DESIGN_SPEC.md`.

```
jaejeok-app/
├─ web/                    React 19 + TypeScript + three.js + Tailwind 4 (Vite)
│   └─ src/
│       ├─ engine/         판정 엔진 (부작용 없음, 시험 26개: node --experimental-strip-types --test src/engine/engine.test.ts)
│       │   ├─ limit.ts        한계 = 0.8 x mu x (1 + 2 x 장력합 x sin a / 짐 무게), 기준 앞 0.8 g · 옆뒤 0.5 g, 앞벽, 넘어짐
│       │   ├─ motion.ts       키트 없을 때: 속도 변화 x 1.25, 속도^2 x tan(앞바퀴) / 2.995 m x 1.25, 5 Hz 미만이면 회색
│       │   ├─ monitor.ts      상태 · 말하는 때 · 주의 구간 · 재점검(첫 정차, 80 km: Pleos 누적 주행거리) · 키트 3초 끊김
│       │   ├─ lines.ts        음성 문장
│       │   └─ records.ts      운송장 기록 · 건별 내보내기
│       ├─ runtime/        10 Hz 루프, 말하기 · 듣기, 시연 차량, 키트 입력(Isaac 기록 · PC 서버 · 손으로), Android 다리(native.ts)
│       ├─ nav/            내비게이션 판 화면
│       ├─ phone/          휴대폰 판 화면 (L4 허브 포함, fleet.ts = 시연용 XCIENT L4 트럭 목록)
│       ├─ three/          PV5 오픈베드 3D (bed-scene.ts), 화면 공통 3D 입력(bed-input.ts)
│       ├─ ui/             공통 부품 · 글자 형식 · 화면 맞춤(Fit.tsx)
│       ├─ styles/         디자인 토큰 (tokens.css)
│       └─ data/           isaac-runs.json = Isaac Sim PV5 주행 기록 5개 (키트 재생용)
├─ android/                Kotlin WebView 껍데기, 빌드 둘: nav (AAOS + Pleos SDK) · phone
│   └─ app/src/nav/…/PleosBridge.kt   Pleos Playground SDK: Vehicle 2.3.2 · NaviHelper 3.0.5 · TextToSpeech 3.3.1 · SpeechToText 3.3.1 · FusedLocation 1.1.3
├─ design/DESIGN_SPEC.md   두 판의 디자인 명세
└─ tools/e2e/              화면 없는 Chrome 시험 · 화면 찍기 (nav-shots.mjs, phone-shots.mjs → shots/nav, shots/phone)
```

Isaac Sim 검증(PV5 가상 트럭, 91회)과 앱 재생 기록 만들기: `IsaacTwin/sim_real_truck/` (run_cases.py → analyze.py → export_app_runs.py).

## 실행

브라우저 (시연 무대):

```bash
cd web && npm install && npm run dev      # http://localhost:5173/?app=stage&fresh  (nav · phone 따로: ?app=nav · ?app=phone)
```

APK 두 개 (웹 화면을 먼저 빌드):

```bash
cd web && npm run build
cd ../android && gradle assembleNavDebug assemblePhoneDebug
adb install -r app/build/outputs/apk/nav/debug/app-nav-debug.apk
```

Pleos 에뮬레이터 시연: Virtual Console(기어 · 속도 · 브레이크 · 조향 · 문 · 주행거리)로 차를 움직인다. 키트 없는 흐름은 차량 신호만으로 돈다.

## Pleos Connect 에뮬레이터에서 확인한 것 (2026-11-14, v2.1.0)

공식 이미지(`system-images;android-34;pleos_car_emulator;x86_64`, AVD `pleos_connect`)에 내비 판 APK 를 올려 확인했다.

```bash
emulator -avd pleos_connect -no-window -no-audio -no-snapshot -gpu host     # 창 없이
bash tools/e2e/pleos-run.sh          # 차량 신호만으로 14개 항목 (Virtual Console HTTP API 로 기어 · 속도 · 브레이크 · 핸들 · 주행거리 · 뒷문)
BG=1 bash tools/e2e/pleos-run.sh     # 내비 지도가 앞에 있을 때 (우리 앱은 뒤)
```

- Pleos SDK 다섯 개가 모두 붙는다 (Vehicle · NaviHelper · TextToSpeech · SpeechToText · FusedLocation). 14 / 14 통과, 지도가 앞에 있어도 통과.
- 앱 창은 한 앱일 때 1224 x 880 (dpr 1.375), 두 앱이면 세로 약 611 x 880. 내비 판은 wide(1920 폭) · mid · tall 세 배치로 맞춘다.
- 기어가 P 가 아니면 Pleos 가 서드파티 앱 화면을 가린다 ("주행 중에는 사용할 수 없습니다"). 주행 중 사용 승인 전에는 음성만 (말하기 · 듣기는 가려진 채로 동작).
- 지도가 앞에 오면 Android 가 뒤의 앱을 얼린다 → `MonitorService`(포그라운드 서비스) + 네이티브 0.1초 틱으로 감시 · 음성을 잇는다.
- Pleos TTS 는 `ko-KR` 만 받는다 (`ko` 는 "unsupported locale").
- 아직 못 본 것: 실제 목소리 "네" 인식(마이크 없는 실행), 경로 안내 중 주의 지점, 에뮬레이터의 세로 창, 사용량.

## 시연 흐름

시연 패널의 대본 (②~⑥ 은 Isaac Sim PV5 기록을 키트처럼 재생):

1. **① 키트 없음 · 고속도로 급제동** → 주행 중 색 하나 → 선 뒤 "방금 짐에 큰 힘이 걸렸습니다…" → 쉼터 → 다시 묶기
2. **② 라쳇 2개 급제동 0.89 g** → 짐 11 cm 밀림 → "짐이 밀렸습니다. 다음 졸음쉼터에서 확인하세요. 안내할까요?" → "네" → 경유지 → 정차 후 3D 다시 묶기
3. **③ 라쳇 4개 0.88 g** → 제자리 (사건 없음, 말 없음)
4. **④ 주행 중 앞 바 풀림** → "바가 느슨해졌습니다…" (뒤이은 밀림은 되풀이하지 않음)
5. **⑤ 고무바 0.62 g** → 짐 35 cm 밀림
6. **⑥ 고무바 · 키 큰 짐 램프 회전 0.46 g** → 넘어져 떨어짐 → 짐 이탈 의심 · 신고 번호(1588-2504 / 112)
7. 방지턱 앞 안내, 급한 회전, 속도 신호 2 Hz(회색). 휴대폰은 같은 사건을 알림 · 기록으로 받고, 운영자는 L4 허브에서 점검 정차를 요청한다.

## 임시값 · 남은 일

- 쉼터 좌표 · 마찰계수 · STF 기본값(250 daN) · 앞벽 높이(1.2 m) · 조향비(16)는 임시값 (설정에서 STF 조정).
  Pleos Vehicle SDK 조향 값은 핸들 각이라 조향비로 나눠 앞바퀴 각으로 쓴다 (AAOS PERF_STEERING_ANGLE 은 앞바퀴 각 그대로).
- 휴대폰 알림은 앱 안 알림만 (Android 알림 다리는 아직 없음). L4 허브의 트럭 목록은 시연용 고정 자료다.

### 에뮬레이터 gRPC 시험 (가상 마이크 · 세 손가락 · 주의 지점)

에뮬레이터를 `-no-audio -grpc 8554` 로 띄운다. 도구는 `tools/e2e/`.

- `VOICE=<네.wav> bash pleos-run.sh`: "네"를 손으로 넣지 않고 가상 마이크에 소리를 넣는다. Pleos STT 가 "네"로 알아듣고 경유지가 들어가면 14개 통과.
- `node emu-grpc.mjs swipe3 2547 718 1700 718 500 60 y`: 창 막대를 세 손가락으로 끌어 세로 창(612 x 880)으로 바꾼다. 막대를 한 번 누르면 두 앱 자리가 바뀐다.
- `node pleos-caution.mjs`: 주의 지점(방지턱) 안내. 에뮬레이터 내비는 차 위치가 움직이지 않아 NaviHelper 가 주의 지점을 보내지 않으므로, 앱 쪽 처리만 본다.
