package kr.jaejeok.app

import android.Manifest
import android.annotation.SuppressLint
import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.net.Uri
import android.os.Bundle
import android.view.View
import android.view.WindowManager
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import org.json.JSONObject

/**
 * 앱 화면: web/ 의 React + three.js 빌드(assets/www)를 WebView 로 띄운다.
 * https://app.jaejeok.local/ 아래 요청을 assets/www 에서 내준다 (보안 문맥, 절대 경로 그대로 동작).
 */
class MainActivity : Activity() {
    private lateinit var web: WebView
    private lateinit var vehicle: VehicleSource
    private lateinit var pleos: PleosBridge
    private lateinit var bridge: Bridge
    private var fileCallback: ValueCallback<Array<Uri>>? = null
    private val tickHandler = android.os.Handler(android.os.Looper.getMainLooper())
    private val tick = object : Runnable {
        override fun run() {
            if (::web.isInitialized) web.evaluateJavascript("window.__jjTick&&window.__jjTick()", null)
            tickHandler.postDelayed(this, 100)
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG)

        web = WebView(this)
        web.setBackgroundColor(Color.parseColor(bgColor()))
        web.overScrollMode = View.OVER_SCROLL_NEVER
        with(web.settings) {
            javaScriptEnabled = true
            domStorageEnabled = true
            mediaPlaybackRequiresUserGesture = false
            allowFileAccess = false
            allowContentAccess = false
            cacheMode = WebSettings.LOAD_NO_CACHE
            textZoom = 100
        }
        val toWeb: (String) -> Unit = { json -> callJs("window.jaejeokNative&&window.jaejeokNative.onVehicle&&window.jaejeokNative.onVehicle(${JSONObject.quote(json)})") }
        vehicle = VehicleSource(this, toWeb)
        pleos = PleosBridge(this, toWeb) { script -> callJs(script) }
        bridge = Bridge(this, vehicle, pleos) { script -> callJs(script) }
        web.addJavascriptInterface(bridge, "JaejeokAndroid")
        web.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? {
                val u = request.url
                if (u.host != HOST) return null
                return asset(u.path ?: "/")
            }

            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean = request.url.host != HOST
        }
        web.webChromeClient = object : WebChromeClient() {
            // '사진 추가': 사진 고르기
            override fun onShowFileChooser(view: WebView, cb: ValueCallback<Array<Uri>>, params: FileChooserParams): Boolean {
                fileCallback?.onReceiveValue(null)
                fileCallback = cb
                return try {
                    startActivityForResult(Intent(Intent.ACTION_GET_CONTENT).setType("image/*").addCategory(Intent.CATEGORY_OPENABLE), REQ_FILE)
                    true
                } catch (_: Throwable) {
                    fileCallback = null
                    false
                }
            }
        }
        setContentView(web)
        vehicle.start()
        pleos.start()
        askPermissions()
        if (BuildConfig.FLAVOR == "nav") {
            // 화면 뒤에서도 감시 · 음성이 이어지게: 프로세스를 포그라운드 서비스로 살려 두고,
            // 판정 루프는 네이티브가 0.1초마다 깨운다 (숨은 WebView 의 타이머는 느려지거나 멈춘다)
            try {
                startForegroundService(Intent(this, MonitorService::class.java))
            } catch (t: Throwable) {
                android.util.Log.w("JaejeokMain", "monitor service not started: ${t.message}")
            }
            tickHandler.postDelayed(tick, 100)
        }
        // 같은 화면 코드, 버전만 다르게: nav = 내비 화면, phone = 휴대폰 화면
        web.loadUrl("https://$HOST/index.html?app=" + (if (BuildConfig.FLAVOR == "nav") "nav" else "phone"))
    }

    private fun callJs(script: String) = runOnUiThread { if (::web.isInitialized) web.evaluateJavascript(script, null) }

    /** 화면 바탕: 폰 · 내비 낮 = 흰 판, 내비 밤 = 남색 판 (웹 화면이 뜨기 전 깜박임을 줄인다) */
    private fun bgColor() = if (BuildConfig.FLAVOR == "nav" && isNight(this)) "#1A2129" else "#FFFFFF"

    // 낮 · 밤이 바뀌면 (manifest configChanges 에 uiMode) 웹에 알린다
    override fun onConfigurationChanged(newConfig: android.content.res.Configuration) {
        super.onConfigurationChanged(newConfig)
        if (::web.isInitialized) web.setBackgroundColor(Color.parseColor(bgColor()))
        callJs("window.jaejeokNative&&window.jaejeokNative.onTheme&&window.jaejeokNative.onTheme(" + isNight(this) + ")")
    }

    private fun asset(path: String): WebResourceResponse? {
        var p = path.trimStart('/')
        if (p.isEmpty()) p = "index.html"
        val mime = when (p.substringAfterLast('.', "").lowercase()) {
            "html" -> "text/html"
            "js", "mjs" -> "text/javascript"
            "css" -> "text/css"
            "json" -> "application/json"
            "png" -> "image/png"
            "jpg", "jpeg" -> "image/jpeg"
            "svg" -> "image/svg+xml"
            "woff2" -> "font/woff2"
            "ttf" -> "font/ttf"
            "wav" -> "audio/wav"
            "mp3" -> "audio/mpeg"
            else -> "application/octet-stream"
        }
        return try {
            val stream = assets.open("www/$p")
            WebResourceResponse(mime, if (mime.startsWith("text/") || mime == "application/json") "utf-8" else null, stream).apply {
                responseHeaders = mapOf("Cache-Control" to "no-cache", "Access-Control-Allow-Origin" to "*")
            }
        } catch (_: Exception) {
            WebResourceResponse("text/plain", "utf-8", 404, "Not Found", emptyMap(), "".byteInputStream())
        }
    }

    /** 속도 · 마이크 · 위치는 목적을 밝히고 동의를 받는다 (정차 중 첫 실행) */
    private fun askPermissions() {
        val want = (if (BuildConfig.FLAVOR == "nav") arrayOf(
            "android.car.permission.CAR_SPEED", "android.car.permission.READ_CAR_STEERING", Manifest.permission.RECORD_AUDIO,
            "pleos.car.permission.TTS_SERVICE", "pleos.car.permission.STT_SERVICE", "pleos.car.permission.FUSED_LOCATION",
        ) else emptyArray()) +
            arrayOf(Manifest.permission.ACCESS_FINE_LOCATION)
        val want2 = want
        val missing = want2.filter { checkSelfPermission(it) != PackageManager.PERMISSION_GRANTED }
        if (missing.isNotEmpty()) requestPermissions(missing.toTypedArray(), REQ_PERM)
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == REQ_PERM) {
            // 속도 권한을 막 받았으면 다시 등록
            vehicle.stop()
            vehicle.start()
            // 마이크 권한을 막 받았으면 서비스 종류에 마이크를 더한다 (화면 뒤에서 "네" 를 들으려면 필요)
            if (BuildConfig.FLAVOR == "nav") {
                try {
                    startForegroundService(Intent(this, MonitorService::class.java))
                } catch (_: Throwable) {
                }
            }
        }
    }

    @Deprecated("Deprecated in Java")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode == REQ_FILE) {
            val uri = data?.data
            fileCallback?.onReceiveValue(if (resultCode == RESULT_OK && uri != null) arrayOf(uri) else null)
            fileCallback = null
        }
    }

    override fun onDestroy() {
        tickHandler.removeCallbacks(tick)
        try {
            stopService(Intent(this, MonitorService::class.java))
        } catch (_: Throwable) {
        }
        vehicle.stop()
        bridge.destroy()
        web.destroy()
        super.onDestroy()
    }

    companion object {
        const val HOST = "app.jaejeok.local"
        const val REQ_PERM = 1
        const val REQ_FILE = 2
    }
}
