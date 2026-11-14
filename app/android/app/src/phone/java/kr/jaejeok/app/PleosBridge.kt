package kr.jaejeok.app

import android.content.Context
import org.json.JSONObject

/** phone 버전: Pleos SDK 는 차(Pleos Connect)에만 있다 */
@Suppress("UNUSED_PARAMETER")
class PleosBridge(context: Context, emitVehicle: (String) -> Unit, js: (String) -> Unit) {
    var onTtsFallback: ((String, String) -> Unit)? = null
    fun start() {}
    fun addWaypoint(name: String, lat: Double, lng: Double): String = "in-app"
    fun speak(id: String, text: String): Boolean = false
    fun stopSpeaking() {}
    fun listen(id: String, timeoutMs: Int): Boolean = false
    fun cancelListen() {}
    fun info(o: JSONObject): JSONObject = o
    fun stop() {}
}
