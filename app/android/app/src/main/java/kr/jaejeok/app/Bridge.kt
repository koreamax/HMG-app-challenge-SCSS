package kr.jaejeok.app

import android.content.Context
import android.content.pm.PackageManager
import android.os.Bundle
import android.os.Environment
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import android.util.Log
import android.webkit.JavascriptInterface
import org.json.JSONObject
import java.io.File
import java.util.Locale

/**
 * 웹(판정 엔진 · 화면) <-> Android 다리. 웹은 window.JaejeokAndroid 로 부르고, 결과는 window.jaejeokNative.on*() 로 받는다.
 *  - 말하기: Pleos TextToSpeech SDK 가 있으면 그것, 없으면 Android TextToSpeech (ko-KR), 그것도 없으면 웹이 녹음한 문장을 튼다
 *  - 듣기: Pleos SpeechToText SDK 만 쓴다 (대회 공지: 외부 음성 인식 금지). 없으면 웹이 정차 후 화면에서 고르게 한다
 *  - 경유지: Pleos NaviHelper addWaypoint (없으면 앱 안 경유지)
 */
class Bridge(private val context: Context, private val vehicle: VehicleSource, private val pleos: PleosBridge, private val js: (String) -> Unit) {
    private var tts: TextToSpeech? = null
    @Volatile private var ttsReady = false

    init {
        tts = TextToSpeech(context) { status ->
            if (status == TextToSpeech.SUCCESS) {
                val r = tts?.setLanguage(Locale.KOREAN) ?: TextToSpeech.LANG_NOT_SUPPORTED
                ttsReady = r != TextToSpeech.LANG_MISSING_DATA && r != TextToSpeech.LANG_NOT_SUPPORTED
                tts?.setSpeechRate(1.02f)
                tts?.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
                    override fun onStart(id: String?) {}
                    override fun onDone(id: String?) = done(id, true)
                    @Deprecated("Deprecated in Java")
                    override fun onError(id: String?) = done(id, false)
                })
            }
            Log.i(TAG, "Android TTS ready=$ttsReady")
        }
        // Pleos TTS 가 말하다 실패하면 같은 문장을 기본 음성으로 이어 말한다
        pleos.onTtsFallback = { id, text -> speakAndroid(id, text) }
    }

    private fun done(id: String?, ok: Boolean) {
        if (id == null) return
        js("window.jaejeokNative&&window.jaejeokNative.onSpeechDone&&window.jaejeokNative.onSpeechDone(${JSONObject.quote(id)},$ok)")
    }

    @JavascriptInterface
    fun info(): String {
        val pm = context.packageManager
        val o = JSONObject()
            .put("platform", if (pm.hasSystemFeature("android.hardware.type.automotive")) "aaos" else "android")
            .put("device", BuildConfig.FLAVOR)
            .put("debug", BuildConfig.DEBUG)
            .put("car", vehicle.hasCar)
            .put("speed", vehicle.hasSpeed)
            .put("steering", vehicle.hasSteering)
            .put("gear", vehicle.hasGear)
            .put("uxr", vehicle.hasUxr)
            .put("tts", ttsReady)
            .put("stt", false)
            .put("camera", pm.hasSystemFeature(PackageManager.FEATURE_CAMERA_ANY))
            // 밤 화면 (내비 판): 시스템 밤 모드를 그대로 따른다
            .put("night", isNight(context))
            .put("version", BuildConfig.VERSION_NAME)
        pleos.info(o)
        // Pleos 음성이 있으면 그쪽이 우선
        if (o.optBoolean("pleosTts")) o.put("tts", true)
        if (o.optBoolean("pleosStt")) o.put("stt", true)
        return o.toString()
    }

    @JavascriptInterface
    fun speak(id: String, text: String) {
        if (pleos.speak(id, text)) return
        speakAndroid(id, text)
    }

    /** 기본 음성 (Android TextToSpeech). Pleos TTS 가 없거나 말하다 실패했을 때 */
    private fun speakAndroid(id: String, text: String) {
        val t = tts
        if (t == null || !ttsReady) {
            done(id, false)
            return
        }
        val p = Bundle()
        p.putString(TextToSpeech.Engine.KEY_PARAM_UTTERANCE_ID, id)
        t.speak(text, TextToSpeech.QUEUE_FLUSH, p, id)
    }

    @JavascriptInterface
    fun stopSpeaking() {
        pleos.stopSpeaking()
        tts?.stop()
    }

    @JavascriptInterface
    fun listen(id: String, timeoutMs: Int) {
        if (pleos.listen(id, timeoutMs)) return
        // Pleos STT 가 없으면 듣지 않는다 (외부 음성 인식은 쓰지 않음): 웹은 정차 후 화면에서 쉼터를 고르게 한다
        js("window.jaejeokNative&&window.jaejeokNative.onListenResult&&window.jaejeokNative.onListenResult(${JSONObject.quote(id)},'{}')")
    }

    @JavascriptInterface
    fun cancelListen() = pleos.cancelListen()

    /** 운송장 한 건 내보내기: 앱 문서 폴더에 저장하고 경로를 돌려준다 */
    @JavascriptInterface
    fun saveFile(name: String, mime: String, text: String): String {
        return try {
            val dir = context.getExternalFilesDir(Environment.DIRECTORY_DOCUMENTS) ?: context.filesDir
            val safe = name.replace(Regex("[^\\w.\\-가-힣]"), "_")
            val f = File(dir, safe)
            f.writeText(text, Charsets.UTF_8)
            Log.i(TAG, "saved $mime ${f.absolutePath}")
            f.absolutePath
        } catch (t: Throwable) {
            Log.w(TAG, "save failed: ${t.message}")
            ""
        }
    }

    /** 졸음쉼터 경유지 (Pleos NaviHelper addWaypoint, 없으면 앱 안 경유지) */
    @JavascriptInterface
    fun addWaypoint(name: String, lat: Double, lng: Double): String = pleos.addWaypoint(name, lat, lng)

    @JavascriptInterface
    fun log(msg: String) {
        Log.i(TAG, msg)
    }

    fun destroy() {
        tts?.shutdown()
        pleos.stop()
    }

    companion object {
        const val TAG = "JaejeokBridge"
    }
}

/** 시스템이 밤 모드인가 (Pleos Connect 는 낮 · 밤 화면을 시스템 uiMode 로 바꾼다) */
fun isNight(ctx: android.content.Context): Boolean =
    (ctx.resources.configuration.uiMode and android.content.res.Configuration.UI_MODE_NIGHT_MASK) == android.content.res.Configuration.UI_MODE_NIGHT_YES
