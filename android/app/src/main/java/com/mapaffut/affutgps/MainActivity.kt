package com.mapaffut.affutgps

import android.Manifest
import android.annotation.SuppressLint
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.view.WindowManager
import android.webkit.GeolocationPermissions
import android.webkit.JavascriptInterface
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import androidx.activity.ComponentActivity
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.webkit.WebViewAssetLoader
import org.json.JSONObject
import java.io.File

class MainActivity : ComponentActivity() {

    private lateinit var web: WebView
    private var fileCallback: ValueCallback<Array<Uri>>? = null
    private var geoOrigin: String? = null
    private var geoCallback: GeolocationPermissions.Callback? = null
    private var startTrackAfterPermission = false

    private val assetLoader by lazy {
        WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()
    }

    private val pickFile = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { r ->
        val uri = r.data?.data
        fileCallback?.onReceiveValue(if (r.resultCode == RESULT_OK && uri != null) arrayOf(uri) else null)
        fileCallback = null
    }

    private val askPermissions = registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) {
        val ok = hasLocation()
        geoCallback?.invoke(geoOrigin, ok, false)
        geoCallback = null; geoOrigin = null
        if (startTrackAfterPermission) {
            startTrackAfterPermission = false
            if (ok) startTrackService(false)
            else js("toast(\"Autorise la localisation pour enregistrer la trace\")")
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        WindowCompat.setDecorFitsSystemWindows(window, false)

        val root = FrameLayout(this)
        root.setBackgroundColor(0xFF0F1314.toInt())
        web = WebView(this)
        root.addView(web, FrameLayout.LayoutParams(-1, -1))
        setContentView(root)

        ViewCompat.setOnApplyWindowInsetsListener(root) { v, insets ->
            val s = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout())
            v.setPadding(s.left, s.top, s.right, s.bottom)
            WindowInsetsCompat.CONSUMED
        }
        WindowCompat.getInsetsController(window, root).apply {
            isAppearanceLightStatusBars = false
            isAppearanceLightNavigationBars = false
        }

        web.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            setGeolocationEnabled(true)
            allowFileAccess = false
            allowContentAccess = false
            mediaPlaybackRequiresUserGesture = true
        }
        web.addJavascriptInterface(Bridge(), "AffutNative")

        web.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? {
                val url = request.url
                val host = url.host ?: return null
                if (host == WebViewAssetLoader.DEFAULT_DOMAIN) return assetLoader.shouldInterceptRequest(url)
                if (request.method == "GET" && Tiles.isTile(host)) return Tiles.get(this@MainActivity, url.toString())
                return null
            }

            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                val url = request.url
                if (url.host == WebViewAssetLoader.DEFAULT_DOMAIN) return false
                // Liens externes : ouvrir dans le navigateur du téléphone
                try { startActivity(Intent(Intent.ACTION_VIEW, url)) } catch (_: Exception) { }
                return true
            }
        }

        web.webChromeClient = object : WebChromeClient() {
            override fun onGeolocationPermissionsShowPrompt(origin: String, callback: GeolocationPermissions.Callback) {
                if (hasLocation()) {
                    callback.invoke(origin, true, false)
                } else {
                    geoOrigin = origin; geoCallback = callback
                    askPermissions.launch(permissionList())
                }
            }

            override fun onShowFileChooser(
                webView: WebView,
                filePathCallback: ValueCallback<Array<Uri>>,
                fileChooserParams: FileChooserParams
            ): Boolean {
                fileCallback?.onReceiveValue(null)
                fileCallback = filePathCallback
                val intent = Intent(Intent.ACTION_GET_CONTENT)
                    .addCategory(Intent.CATEGORY_OPENABLE)
                    .setType("*/*")
                return try { pickFile.launch(intent); true } catch (e: Exception) { fileCallback = null; false }
            }
        }

        if (savedInstanceState == null) {
            web.loadUrl("https://${WebViewAssetLoader.DEFAULT_DOMAIN}/assets/www/index.html")
        } else {
            web.restoreState(savedInstanceState)
        }
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        web.saveState(outState)
    }

    override fun onResume() {
        super.onResume()
        web.onResume()
        js("window.__nativeResume && window.__nativeResume()")
    }

    override fun onPause() {
        web.onPause()
        super.onPause()
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        // Ferme d'abord un panneau ouvert dans l'application, sinon quitte
        web.evaluateJavascript("window.__nativeBack ? window.__nativeBack() : false") { r ->
            if (r != "true") {
                @Suppress("DEPRECATION")
                super.onBackPressed()
            }
        }
    }

    private fun js(code: String) = runOnUiThread { web.evaluateJavascript(code, null) }

    private fun hasLocation() =
        ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED

    private fun permissionList(): Array<String> {
        val p = mutableListOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION)
        if (Build.VERSION.SDK_INT >= 33) p.add(Manifest.permission.POST_NOTIFICATIONS)
        return p.toTypedArray()
    }

    private fun startTrackService(clear: Boolean) {
        if (clear) TrackStore.clear(this)
        val i = Intent(this, TrackService::class.java)
        ContextCompat.startForegroundService(this, i)
    }

    /** Fonctions appelées par app.js (window.AffutNative) */
    inner class Bridge {
        @JavascriptInterface
        fun startTrack(clear: Boolean) {
            runOnUiThread {
                if (clear) TrackStore.clear(this@MainActivity)
                if (hasLocation()) startTrackService(false)
                else { startTrackAfterPermission = true; askPermissions.launch(permissionList()) }
            }
        }

        @JavascriptInterface
        fun stopTrack() {
            runOnUiThread { stopService(Intent(this@MainActivity, TrackService::class.java)) }
        }

        @JavascriptInterface
        fun isTracking(): Boolean = TrackService.running

        @JavascriptInterface
        fun trackPointsSince(n: Int): String = TrackStore.readSince(this@MainActivity, n)

        @JavascriptInterface
        fun setKeepScreenOn(on: Boolean) {
            runOnUiThread {
                if (on) window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
                else window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
            }
        }

        @JavascriptInterface
        fun shareFile(name: String, content: String, mime: String) {
            runOnUiThread {
                try {
                    val dir = File(cacheDir, "share").apply { mkdirs() }
                    val safe = name.replace(Regex("[^A-Za-z0-9._-]"), "_")
                    val f = File(dir, safe).apply { writeText(content) }
                    val uri = FileProvider.getUriForFile(this@MainActivity, "$packageName.files", f)
                    val send = Intent(Intent.ACTION_SEND)
                        .setType(mime)
                        .putExtra(Intent.EXTRA_STREAM, uri)
                        .putExtra(Intent.EXTRA_SUBJECT, safe)
                        .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                    startActivity(Intent.createChooser(send, "Exporter $safe"))
                } catch (e: Exception) {
                    js("toast(" + JSONObject.quote("Export impossible : " + (e.message ?: "erreur")) + ")")
                }
            }
        }

        @JavascriptInterface
        fun clearTiles() = Tiles.clear(this@MainActivity)

        @JavascriptInterface
        fun tileCacheBytes(): String = Tiles.size(this@MainActivity).toString()
    }
}
