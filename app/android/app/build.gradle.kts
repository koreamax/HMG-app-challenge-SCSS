// 적재적소 (Pleos Connect / Android Automotive) — 화면은 web/ (React + three.js) 빌드를 WebView 로 띄우고,
// 차량 신호(CarPropertyManager) · 주행 규제(CarUxRestrictions) · 음성(TTS/STT) 은 Kotlin 이 웹에 넘긴다.
plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "kr.jaejeok.app"
    compileSdk = 34

    defaultConfig {
        applicationId = "kr.jaejeok.app"
        minSdk = 28
        targetSdk = 34
        versionCode = 1
        versionName = "1.0.0"
    }

    // 두 버전: nav = Pleos Connect 내비(Android Automotive), phone = 휴대폰 (같은 웹 화면, 버전은 실행 때 고른다)
    flavorDimensions += "device"
    productFlavors {
        create("nav") {
            dimension = "device"
        }
        create("phone") {
            dimension = "device"
            applicationIdSuffix = ".phone"
            versionNameSuffix = "-phone"
        }
    }

    buildTypes {
        debug {
            applicationIdSuffix = ".debug"
            versionNameSuffix = "-debug"
        }
        release {
            isMinifyEnabled = false
            // 공모전 시연용: 디버그 키로 서명 (출시 때 바꾼다)
            signingConfig = signingConfigs.getByName("debug")
        }
    }
    buildFeatures { buildConfig = true }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }

    // AAOS 차량 API (platforms/android-34/optional/android.car.jar)
    useLibrary("android.car")

    // 웹 화면 빌드 결과를 assets/www 로
    sourceSets.getByName("main").assets.srcDir(layout.buildDirectory.dir("generated/webassets"))
}

dependencies {
    val pleos = "ai.pleos.playground"
    "navImplementation"("$pleos:Vehicle:2.3.2")
    "navImplementation"("$pleos:NaviHelper:3.0.5")
    "navImplementation"("$pleos:TextToSpeech:3.3.1")
    "navImplementation"("$pleos:SpeechToText:3.3.1")
    "navImplementation"("$pleos:FusedLocation:1.1.3")
}

val copyWeb by tasks.registering(Copy::class) {
    description = "web/dist 를 assets/www 로 복사 (먼저 web 에서 npm run build)"
    from(rootProject.file("../web/dist"))
    into(layout.buildDirectory.dir("generated/webassets/www"))
}
tasks.named("preBuild") { dependsOn(copyWeb) }
