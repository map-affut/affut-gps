package com.mapaffut.affutgps

import android.content.Context
import android.webkit.WebResourceResponse
import java.io.ByteArrayInputStream
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest

/**
 * Cache disque des tuiles de carte.
 * Toute tuile affichée ou téléchargée est gardée sur le téléphone
 * et resservie sans réseau.
 */
object Tiles {
    private val subdomain = Regex("//[abc]\\.tile\\.opentopomap\\.org")

    fun isTile(host: String) =
        host == "server.arcgisonline.com" || host == "tile.opentopomap.org" || host.endsWith(".tile.opentopomap.org")

    private fun dir(c: Context) = File(c.filesDir, "tiles").apply { mkdirs() }

    private fun keyOf(url: String): String {
        val norm = url.replace(subdomain, "//tile.opentopomap.org")
        val d = MessageDigest.getInstance("SHA-1").digest(norm.toByteArray())
        return d.joinToString("") { "%02x".format(it) }
    }

    private fun mimeOf(url: String) = if (url.endsWith(".png")) "image/png" else "image/jpeg"

    fun get(c: Context, url: String): WebResourceResponse {
        val f = File(dir(c), keyOf(url))
        if (f.exists() && f.length() > 0) {
            return try { response(200, "OK", f.readBytes(), mimeOf(url)) } catch (e: Exception) { response(504, "Lecture impossible", ByteArray(0), "text/plain") }
        }
        return try {
            val con = URL(url).openConnection() as HttpURLConnection
            con.connectTimeout = 15000
            con.readTimeout = 20000
            con.setRequestProperty("User-Agent", "AffutGPS/1.0 (Android; map-affut)")
            val code = con.responseCode
            if (code == 200) {
                val bytes = con.inputStream.use { it.readBytes() }
                val tmp = File(f.path + ".tmp")
                tmp.writeBytes(bytes)
                tmp.renameTo(f)
                response(200, "OK", bytes, (con.contentType ?: mimeOf(url)).substringBefore(';').trim())
            } else {
                con.disconnect()
                response(if (code in 300..399 || code < 100 || code > 599) 502 else code, "Erreur", ByteArray(0), "text/plain")
            }
        } catch (e: Exception) {
            response(504, "Hors ligne", ByteArray(0), "text/plain")
        }
    }

    private fun response(code: Int, reason: String, body: ByteArray, mime: String) =
        WebResourceResponse(
            mime, null, code, reason,
            mapOf("Access-Control-Allow-Origin" to "*", "Cache-Control" to "no-store"),
            ByteArrayInputStream(body)
        )

    fun clear(c: Context) { dir(c).listFiles()?.forEach { it.delete() } }

    fun size(c: Context): Long = dir(c).listFiles()?.sumOf { it.length() } ?: 0L
}
