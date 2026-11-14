package kr.jaejeok.app

import android.car.Car
import android.car.VehicleGear
import android.car.VehiclePropertyIds
import android.car.drivingstate.CarUxRestrictionsManager
import android.car.hardware.CarPropertyValue
import android.car.hardware.property.CarPropertyManager
import android.content.Context
import android.util.Log
import org.json.JSONObject

/**
 * 차량 신호 층 (기획서 [표 4]).
 *  - 속도: AAOS CarPropertyManager PERF_VEHICLE_SPEED (CAR_SPEED, 사용자 동의). 값이 올 때마다 웹에 넘긴다 (감속 추정)
 *  - 기어: GEAR_SELECTION, 주차 브레이크: PARKING_BRAKE_ON
 *  - 조향: PERF_STEERING_ANGLE (앞바퀴 각, 도). Pleos Vehicle SDK registerSteeringWheelAngle 로 바꿀 자리
 *  - 주행 규제: CarUxRestrictionsManager (주행 중 화면 전환)
 * 지원하지 않는 값은 null 로 두고, 웹의 판정 엔진이 기획서의 대체 방법을 쓴다 (예: 브레이크 신호 없음 -> 감속으로 추정).
 */
class VehicleSource(private val context: Context, private val emit: (String) -> Unit) {
    private var car: Car? = null
    private var props: CarPropertyManager? = null
    private var uxr: CarUxRestrictionsManager? = null
    private val callbacks = mutableListOf<CarPropertyManager.CarPropertyEventCallback>()

    var hasCar = false; private set
    var hasSpeed = false; private set
    var hasSteering = false; private set
    var hasGear = false; private set
    var hasUxr = false; private set

    fun start() {
        try {
            if (!context.packageManager.hasSystemFeature("android.hardware.type.automotive")) return
            car = Car.createCar(context, null, Car.CAR_WAIT_TIMEOUT_DO_NOT_WAIT) { c, ready ->
                if (ready) onCarReady(c) else Log.w(TAG, "car service disconnected")
            }
        } catch (t: Throwable) {
            Log.w(TAG, "Car API 없음: ${t.message}")
        }
    }

    private fun onCarReady(c: Car) {
        hasCar = true
        props = c.getCarManager(Car.PROPERTY_SERVICE) as? CarPropertyManager
        val p = props ?: return
        hasSpeed = listen(p, VehiclePropertyIds.PERF_VEHICLE_SPEED, CarPropertyManager.SENSOR_RATE_FASTEST) { v ->
            val ms = (v.value as? Float) ?: return@listen
            // 값이 생긴 시각 (elapsedRealtime, s): 웹이 전달 지연과 상관없이 감속을 구한다
            send(JSONObject().put("speedKmh", ms * 3.6).put("speedT", v.timestamp / 1e9))
        }
        hasGear = listen(p, VehiclePropertyIds.GEAR_SELECTION, CarPropertyManager.SENSOR_RATE_ONCHANGE) { v ->
            val g = (v.value as? Int) ?: return@listen
            send(JSONObject().put("gear", gearName(g)))
        }
        listen(p, VehiclePropertyIds.PARKING_BRAKE_ON, CarPropertyManager.SENSOR_RATE_ONCHANGE) { v ->
            send(JSONObject().put("parkingBrake", v.value as? Boolean ?: false))
        }
        hasSteering = listen(p, VehiclePropertyIds.PERF_STEERING_ANGLE, CarPropertyManager.SENSOR_RATE_NORMAL) { v ->
            val d = (v.value as? Float) ?: return@listen
            send(JSONObject().put("steerDeg", d.toDouble()))
        }
        try {
            uxr = c.getCarManager(Car.CAR_UX_RESTRICTION_SERVICE) as? CarUxRestrictionsManager
            uxr?.let { m ->
                hasUxr = true
                send(JSONObject().put("uxRestricted", m.currentCarUxRestrictions.isRequiresDistractionOptimization))
                m.registerListener { r -> send(JSONObject().put("uxRestricted", r.isRequiresDistractionOptimization)) }
            }
        } catch (t: Throwable) {
            Log.w(TAG, "UX restrictions 없음: ${t.message}")
        }
    }

    private fun listen(p: CarPropertyManager, id: Int, rate: Float, on: (CarPropertyValue<*>) -> Unit): Boolean {
        return try {
            if (p.getCarPropertyConfig(id) == null) return false
            val cb = object : CarPropertyManager.CarPropertyEventCallback {
                override fun onChangeEvent(value: CarPropertyValue<*>) {
                    if (value.status == CarPropertyValue.STATUS_AVAILABLE) on(value)
                }

                override fun onErrorEvent(propId: Int, zone: Int) {
                    Log.w(TAG, "property error $propId")
                }
            }
            val ok = p.registerCallback(cb, id, rate)
            if (ok) callbacks += cb
            ok
        } catch (t: SecurityException) {
            Log.w(TAG, "권한 없음 ${VehiclePropertyIds.toString(id)}: ${t.message}")
            false
        } catch (t: Throwable) {
            Log.w(TAG, "등록 실패 ${VehiclePropertyIds.toString(id)}: ${t.message}")
            false
        }
    }

    private fun send(o: JSONObject) = emit(o.toString())

    private fun gearName(g: Int): String = when (g) {
        VehicleGear.GEAR_PARK -> "P"
        VehicleGear.GEAR_REVERSE -> "R"
        VehicleGear.GEAR_NEUTRAL -> "N"
        else -> "D"
    }

    fun stop() {
        try {
            props?.let { p -> callbacks.forEach { p.unregisterCallback(it) } }
            uxr?.unregisterListener()
            car?.disconnect()
        } catch (_: Throwable) {
        }
        callbacks.clear()
    }

    companion object {
        const val TAG = "JaejeokVehicle"
    }
}
