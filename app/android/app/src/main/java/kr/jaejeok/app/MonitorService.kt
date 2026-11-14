package kr.jaejeok.app

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.util.Log

/**
 * 화면 뒤에서도 짐 감시와 음성을 잇는 포그라운드 서비스 (내비 판).
 * Pleos Connect 에서는 주행 중 내비 지도가 앞에 오고 우리 앱은 뒤로 간다. 서비스가 없으면 Android 가 뒤에 있는 앱을
 * 얼려서 (cached app freezer) 판정 루프와 차량 신호 수신이 멈춘다 (Pleos 에뮬레이터 v2.1.0 에서 확인).
 * 이 서비스는 일을 하지 않는다: 프로세스를 살려 두기만 하고, 판정은 MainActivity 의 WebView 안 엔진이 계속 한다.
 */
class MonitorService : Service() {
    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val nm = getSystemService(NotificationManager::class.java)
        nm.createNotificationChannel(NotificationChannel(CHANNEL, "주행 중 짐 감시", NotificationManager.IMPORTANCE_LOW))
        val open = PendingIntent.getActivity(
            this, 0, Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP), PendingIntent.FLAG_IMMUTABLE,
        )
        val n = Notification.Builder(this, CHANNEL)
            .setContentTitle("적재적소")
            .setContentText("짐 상태를 지켜보는 중 · 필요할 때만 말합니다")
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setOngoing(true)
            .setContentIntent(open)
            .build()
        // "네" 를 듣는 동안 마이크를 쓰므로, 마이크 권한이 있으면 그 종류도 함께 건다 (Android 14: 뒤에서 마이크를 쓰려면 필요)
        val mic = checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED
        try {
            if (Build.VERSION.SDK_INT >= 34) {
                val type = ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE or (if (mic) ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE else 0)
                startForeground(ID, n, type)
            } else startForeground(ID, n)
            Log.i(TAG, "monitor service in foreground (mic=$mic)")
        } catch (t: Throwable) {
            Log.w(TAG, "foreground with mic failed: ${t.message}")
            try {
                if (Build.VERSION.SDK_INT >= 34) startForeground(ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE) else startForeground(ID, n)
            } catch (t2: Throwable) {
                Log.w(TAG, "foreground failed: ${t2.message}")
                stopSelf()
            }
        }
        return START_STICKY
    }

    companion object {
        private const val TAG = "JaejeokMonitor"
        private const val CHANNEL = "monitor"
        private const val ID = 7
    }
}
