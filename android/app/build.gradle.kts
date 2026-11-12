plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

val vc = (System.getenv("VERSION_CODE") ?: "1").toInt()

android {
    namespace = "com.mapaffut.affutgps"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.mapaffut.affutgps"
        minSdk = 24
        targetSdk = 35
        versionCode = vc
        versionName = "1.0.$vc"
    }

    // Clé de TEST pour installer l'APK directement sur un téléphone.
    // Pour le Play Store, une clé privée distincte sera utilisée (jamais publiée).
    signingConfigs {
        create("test") {
            storeFile = file("../affut-test.keystore")
            storePassword = "affut-test"
            keyAlias = "affut"
            keyPassword = "affut-test"
        }
    }

    buildTypes {
        getByName("debug") { signingConfig = signingConfigs.getByName("test") }
        getByName("release") {
            isMinifyEnabled = false
            signingConfig = signingConfigs.getByName("test")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
    lint { checkReleaseBuilds = false; abortOnError = false }
}

dependencies {
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.activity:activity-ktx:1.9.3")
    implementation("androidx.webkit:webkit:1.12.1")
}
