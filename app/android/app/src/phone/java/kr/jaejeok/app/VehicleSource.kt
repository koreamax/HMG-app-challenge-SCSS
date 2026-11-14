package kr.jaejeok.app

import android.content.Context

/** phone 버전: 차량 신호가 없다 (차의 값은 같은 운송장을 통해 내비 버전에서 받는다) */
class VehicleSource(@Suppress("UNUSED_PARAMETER") context: Context, @Suppress("UNUSED_PARAMETER") emit: (String) -> Unit) {
    val hasCar = false
    val hasSpeed = false
    val hasSteering = false
    val hasGear = false
    val hasUxr = false
    fun start() {}
    fun stop() {}
}
