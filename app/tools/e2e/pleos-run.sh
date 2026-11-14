#!/usr/bin/env bash
# Pleos Connect 에뮬레이터 시험 한 번: 앱을 새로 띄우고 (기록 지움 · 권한) pleos-drive.mjs 를 돌린다.
#   bash pleos-run.sh        : 우리 앱이 앞에 있을 때
#   BG=1 bash pleos-run.sh   : 내비 지도가 앞에 있을 때 (우리 앱은 뒤)
export PATH="/c/Users/DANHA/tools/node-v22.22.2-win-x64:$PATH"
ADB=/c/Users/DANHA/tools/android-sdk/platform-tools/adb.exe
P=kr.jaejeok.app.debug
cd "$(dirname "$0")" || exit 1
$ADB shell am force-stop --user 10 $P
$ADB shell pm clear --user 10 $P >/dev/null
for perm in android.car.permission.CAR_SPEED android.permission.RECORD_AUDIO android.permission.ACCESS_FINE_LOCATION android.permission.ACCESS_COARSE_LOCATION pleos.car.permission.FUSED_LOCATION android.permission.POST_NOTIFICATIONS; do
  $ADB shell pm grant --user 10 $P $perm 2>/dev/null
done
$ADB shell am start --user 10 -n $P/kr.jaejeok.app.MainActivity >/dev/null 2>&1
sleep 12
pid=$($ADB shell pidof $P | tr -d '\r')
$ADB forward --remove-all
$ADB forward tcp:9333 "localabstract:webview_devtools_remote_$pid" >/dev/null
$ADB forward tcp:8088 tcp:8088 >/dev/null
timeout 170 node pleos-drive.mjs
