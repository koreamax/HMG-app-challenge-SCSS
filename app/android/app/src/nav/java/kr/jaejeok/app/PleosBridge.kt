package kr.jaejeok.app

import ai.pleos.playground.location.fused.FusedLocation
import ai.pleos.playground.location.fused.listener.FusedLocationListener
import ai.pleos.playground.location.fused.listener.ProximityAlertListener
import ai.pleos.playground.location.fused.model.LocationData
import ai.pleos.playground.location.fused.model.ProximityAlertEvent
import ai.pleos.playground.location.fused.model.ProximityAlertRequest
import ai.pleos.playground.location.fused.model.ProximityTransition
import ai.pleos.playground.navi.constants.CautionPointType
import ai.pleos.playground.navi.constants.WaypointIndex
import ai.pleos.playground.navi.data.CautionPoint
import ai.pleos.playground.navi.data.RequestWaypointInfo
import ai.pleos.playground.navi.data.WaypointArrivedInfo
import ai.pleos.playground.navi.helper.NaviHelper
import ai.pleos.playground.navi.helper.listener.NaviHelperEventListener
import ai.pleos.playground.stt.SpeechToText
import ai.pleos.playground.stt.listener.ResultListener
import ai.pleos.playground.tts.TextToSpeech
import ai.pleos.playground.tts.listener.EventListener
import ai.pleos.playground.tts.listener.OnInitializeListener
import ai.pleos.playground.vehicle.Vehicle
import ai.pleos.playground.vehicle.api.model.area.DoorArea
import ai.pleos.playground.vehicle.constant.area.DoorValue
import ai.pleos.playground.vehicle.constant.control.VehicleGear
import ai.pleos.playground.vehicle.listener.BrakePedalStatusListener
import ai.pleos.playground.vehicle.listener.DoorPositionListener
import ai.pleos.playground.vehicle.listener.GearSelectionListener
import ai.pleos.playground.vehicle.listener.SteeringWheelAngleListener
import android.content.Context
import android.os.Handler
import android.os.Looper
import android.util.Log
import org.json.JSONObject
import java.util.Locale

/**
 * Pleos Playground SDK (developers.pleos.ai, Maven nexus-playground.pleos.ai) 연결. Pleos Connect 에서만 서비스가 있으므로
 * 각 SDK 를 따로 시도하고, 실패하면 그 기능만 Android 표준(VehicleSource · Bridge 의 TTS/STT)으로 돌아간다.
 *
 *  Vehicle 2.3.2   : 브레이크 페달(말할 때), 핸들 각(회전 세기), 기어(주행 · 정차), 주행거리(80 km 재점검), 뒷문 열림(상 · 하차 감지)
 *  NaviHelper 3.0.5: 주의 지점(과속방지턱 · 내리막 · 미끄러운 길) 300 m 앞 안내, 졸음쉼터 경유지 추가, 경유지 도착
 *  TextToSpeech 3.3.1 / SpeechToText 3.3.1 (ON_DEVICE): 한 문장 안내, 안내음 뒤 5초 "네" 듣기 (대회 공지: 준비 중 SDK 도 에뮬레이터에서 개발 · 시험 가능)
 *  FusedLocation 1.1.3: 사건 위치 기록, 쉼터 · 거점 근접 알림
 */
class PleosBridge(private val context: Context, private val emitVehicle: (String) -> Unit, private val js: (String) -> Unit) {
    private val main = Handler(Looper.getMainLooper())
    private var vehicle: Vehicle? = null
    private var navi: NaviHelper? = null
    private var tts: TextToSpeech? = null
    private var stt: SpeechToText? = null
    private var location: FusedLocation? = null
    private var listenId: String? = null
    private var speakId: String? = null
    private var speakText: String? = null

    /** Pleos TTS 가 말하다 실패하면 부른다 (id, 문장): Bridge 가 Android TTS 로 이어 말한다 */
    var onTtsFallback: ((String, String) -> Unit)? = null

    var vehicleOk = false; private set
    var naviOk = false; private set
    var ttsOk = false; private set
    var sttOk = false; private set
    var locationOk = false; private set

    fun start() {
        startVehicle()
        startNavi()
        startTts()
        startStt()
        startLocation()
    }

    private fun send(o: JSONObject) = emitVehicle(o.toString())

    private fun startVehicle() {
        val v = try {
            Vehicle(context).also { it.initialize() }
        } catch (t: Throwable) {
            Log.w(TAG, "Pleos Vehicle SDK 없음: ${t.message}")
            return
        }
        vehicle = v
        // 차종마다 되는 API 가 다를 수 있어 (Pleos 문서) API 마다 따로 붙인다. 하나라도 붙으면 vehicleOk
        var any = false
        fun tryApi(name: String, f: () -> Unit) {
            try {
                f()
                any = true
            } catch (t: Throwable) {
                Log.w(TAG, "Pleos Vehicle $name 없음: ${t.message}")
            }
        }
        tryApi("brake") {
            v.getBrake().registerBrakePedalStatus(object : BrakePedalStatusListener {
                override fun onBrakePedalStatusUpdated(p0: Boolean?) {
                    if (p0 != null) send(JSONObject().put("brake", p0))
                }

                override fun onFailed(e: Exception) {}
            })
        }
        tryApi("steering") {
            v.getSteeringWheel().registerSteeringWheelAngle(object : SteeringWheelAngleListener {
                override fun onSteeringWheelAngleUpdated(p0: Float?) {
                    // 핸들 각(Virtual Console -540~540). 웹이 조향비로 나눠 앞바퀴 각으로 쓴다 (steerSource = pleos)
                    if (p0 != null) send(JSONObject().put("steerDeg", p0.toDouble()).put("steerSource", "pleos"))
                }

                override fun onFailed(e: Exception) {}
            })
        }
        tryApi("gear") {
            v.getGear().registerGearSelection(object : GearSelectionListener {
                override fun onSelected(gear: VehicleGear?) {
                    val g = when (gear) {
                        null -> null
                        VehicleGear.GEAR_PARK -> "P"
                        VehicleGear.GEAR_REVERSE -> "R"
                        VehicleGear.GEAR_NEUTRAL -> "N"
                        VehicleGear.GEAR_UNKNOWN -> null
                        else -> "D"
                    }
                    if (g != null) send(JSONObject().put("gear", g))
                }

                override fun onFailed(e: Exception) {}
            })
        }
        tryApi("door") {
            v.getDoor().registerDoorPosition(DoorArea(DoorValue.REAR), object : DoorPositionListener {
                override fun onPositionUpdated(p0: Int?) {
                    if (p0 != null) send(JSONObject().put("rearDoor", p0))
                }

                override fun onFailed(e: Exception) {}
            })
        }
        tryApi("odometer") { pollOdometer(v) }
        vehicleOk = any
    }

    private fun pollOdometer(v: Vehicle) {
        try {
            v.getOdometer().getCurrentDistanceDriven({ km -> if (km != null) send(JSONObject().put("odometerKm", km.toDouble())) }, { })
        } catch (_: Throwable) {
        }
        main.postDelayed({ if (vehicle != null) pollOdometer(v) }, 10_000)
    }

    private fun startNavi() {
        try {
            val n = NaviHelper(context)
            n.initialize()
            n.addListener(object : NaviHelperEventListener {
                override fun onCautionPointInfo(p0: List<CautionPoint>) {
                    val near = p0.filter { it.type in CAUTION_TYPES }.minByOrNull { it.remainDistance }
                    if (near == null) {
                        // 앞에 주의 지점이 없으면 지운다 (웹이 지난 값을 붙들고 있지 않게)
                        send(JSONObject().put("caution", JSONObject.NULL))
                        return
                    }
                    val kind = when (near.type) {
                        CautionPointType.SPEED_BUMP -> "bump"
                        CautionPointType.DOWNHILL_CAUTION_AREA -> "downhill"
                        else -> "slippery"
                    }
                    send(JSONObject().put("caution", JSONObject().put("id", near.id).put("type", kind).put("distM", near.remainDistance)))
                }

                override fun onWayPointArrived(p0: WaypointArrivedInfo) {
                    js("window.jaejeokNative&&window.jaejeokNative.onWaypointArrived&&window.jaejeokNative.onWaypointArrived(${JSONObject.quote(p0.name ?: "")})")
                }
            })
            navi = n
            naviOk = true
        } catch (t: Throwable) {
            Log.w(TAG, "Pleos NaviHelper 없음: ${t.message}")
        }
    }

    /** 졸음쉼터를 경유지로 (NaviHelper.addWaypoint). 안내 중이 아니면 내비가 목적지로 다룬다 */
    fun addWaypoint(name: String, lat: Double, lng: Double): String {
        val n = navi ?: return "in-app"
        return try {
            n.addWaypoint(RequestWaypointInfo(lat, lng, name, WaypointIndex.FIRST, "", "", "", ""))
            addProximity(name, lat, lng)
            "pleos"
        } catch (t: Throwable) {
            Log.w(TAG, "addWaypoint 실패: ${t.message}")
            "in-app"
        }
    }

    private fun startTts() {
        try {
            val t = TextToSpeech(context, ai.pleos.playground.tts.constant.Mode.ON_DEVICE)
            t.initialize(object : OnInitializeListener {
                override fun onSuccess() {
                    t.setLocale(Locale.KOREA)      // ko-KR (지역 없는 ko 는 Pleos TTS 가 받지 않는다)
                    ttsOk = true
                }

                override fun onFailure(p0: ai.pleos.playground.tts.constant.ErrorType) {
                    Log.w(TAG, "Pleos TTS 초기화 실패: $p0")
                }
            })
            t.addEventListener(object : EventListener {
                override fun onStart() {}
                override fun onReady() {}
                override fun onDone() = done(true)
                override fun onError(p0: ai.pleos.playground.tts.constant.ErrorType) {
                    Log.w(TAG, "Pleos TTS 오류: $p0")
                    val id = speakId
                    val text = speakText
                    val fb = onTtsFallback
                    if (id != null && text != null && fb != null) {
                        speakId = null
                        speakText = null
                        fb(id, text)
                    } else done(false)
                }
                override fun onStop() = done(true)
                override fun onUpdatedRms(p0: Double) {}
            })
            tts = t
        } catch (t: Throwable) {
            Log.w(TAG, "Pleos TTS SDK 없음: ${t.message}")
        }
    }

    private fun done(ok: Boolean) {
        val id = speakId ?: return
        speakId = null
        js("window.jaejeokNative&&window.jaejeokNative.onSpeechDone&&window.jaejeokNative.onSpeechDone(${JSONObject.quote(id)},$ok)")
    }

    /** true 면 Pleos TTS 가 말한다 (끝나면 onSpeechDone) */
    fun speak(id: String, text: String): Boolean {
        val t = tts ?: return false
        if (!ttsOk) return false
        return try {
            speakId = id
            speakText = text
            t.speak(text, true)
            true
        } catch (e: Throwable) {
            speakId = null
            false
        }
    }

    fun stopSpeaking() {
        try {
            tts?.stop()
        } catch (_: Throwable) {
        }
    }

    private fun startStt() {
        try {
            val s = SpeechToText(context, ai.pleos.playground.stt.constant.Mode.ON_DEVICE)
            s.initialize(object : ai.pleos.playground.stt.listener.OnInitializeListener {
                override fun onSuccess() {
                    s.setLocale(Locale.KOREA)      // ko-KR
                    sttOk = true
                }

                override fun onFailure(p0: ai.pleos.playground.stt.constant.ErrorType) {
                    Log.w(TAG, "Pleos STT 초기화 실패: $p0")
                }
            })
            s.addListener(object : ResultListener {
                override fun onUpdated(p0: String, p1: Boolean) {
                    val id = listenId ?: return
                    val said = p0.trim()
                    if (p1 || said.startsWith("네") || said.startsWith("예") || said.startsWith("응")) result(id, said)
                }

                override fun onUpdatedEpdData(p0: Long, p1: Long) {}
                override fun onStartedRecognition() {}
                override fun onEndedRecognition() {}
                override fun onError(p0: ai.pleos.playground.stt.constant.ErrorType) {
                    listenId?.let { result(it, null) }
                }

                override fun onReady() {}
                override fun onUpdatedRms(p0: Double) {}
            })
            stt = s
        } catch (t: Throwable) {
            Log.w(TAG, "Pleos STT SDK 없음: ${t.message}")
        }
    }

    /** true 면 Pleos STT 가 듣는다 (안내음 뒤 timeoutMs 만, 결과는 onListenResult) */
    fun listen(id: String, timeoutMs: Int): Boolean {
        val s = stt ?: return false
        if (!sttOk) return false
        return try {
            listenId = id
            s.request()
            main.postDelayed({ if (listenId == id) result(id, null) }, timeoutMs.toLong() + 400)
            true
        } catch (e: Throwable) {
            listenId = null
            false
        }
    }

    fun cancelListen() {
        listenId = null
        try {
            stt?.stop()
        } catch (_: Throwable) {
        }
    }

    private fun result(id: String, heard: String?) {
        if (listenId != id) return
        listenId = null
        try {
            stt?.stop()
        } catch (_: Throwable) {
        }
        val o = JSONObject()
        if (heard != null) o.put("heard", heard)
        js("window.jaejeokNative&&window.jaejeokNative.onListenResult&&window.jaejeokNative.onListenResult(${JSONObject.quote(id)},${JSONObject.quote(o.toString())})")
    }

    private fun startLocation() {
        try {
            val f = FusedLocation(context)
            f.initialize()
            if (!f.isSupported()) return
            f.registerFusedLocationCallback(object : FusedLocationListener {
                override fun onChanged(location: LocationData?) {
                    if (location != null) send(JSONObject().put("lat", location.latitude).put("lng", location.longitude))
                }

                override fun onError(p0: Exception) {}
            })
            location = f
            locationOk = true
        } catch (t: Throwable) {
            Log.w(TAG, "Pleos FusedLocation SDK 없음: ${t.message}")
        }
    }

    /** 쉼터 · 거점 반경 200 m 에 들어오면 웹에 알린다 (도착 -> 정차 화면 준비) */
    private fun addProximity(name: String, lat: Double, lng: Double) {
        val f = location ?: return
        try {
            f.addProximityAlert(ProximityAlertRequest(lat, lng, 200f, setOf(ProximityTransition.ENTER)), object : ProximityAlertListener {
                override fun onRegistered(p0: String) {}
                override fun onTransition(p0: ProximityAlertEvent) {
                    js("window.jaejeokNative&&window.jaejeokNative.onWaypointArrived&&window.jaejeokNative.onWaypointArrived(${JSONObject.quote(name)})")
                }

                override fun onError(p0: Exception) {}
            })
        } catch (_: Throwable) {
        }
    }

    fun info(o: JSONObject): JSONObject = o.put("pleosVehicle", vehicleOk).put("pleosNavi", naviOk).put("pleosTts", ttsOk).put("pleosStt", sttOk).put("pleosLocation", locationOk)

    fun stop() {
        try {
            vehicle?.release()
            navi?.release()
            tts?.release()
            stt?.release()
            location?.release()
        } catch (_: Throwable) {
        }
    }

    companion object {
        const val TAG = "JaejeokPleos"
        val CAUTION_TYPES = setOf(CautionPointType.SPEED_BUMP, CautionPointType.DOWNHILL_CAUTION_AREA, CautionPointType.SLIPPERY_ROAD_ALERT)
    }
}
