package com.mapaffut.affutgps

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.Build
import android.os.Bundle
import android.os.IBinder
import android.os.Looper
import org.json.JSONArray
import java.io.File

/**
 * Service au premier plan : enregistre la trace GPS même écran éteint
 * ou application fermée. Une notification reste visible pendant l'enregistrement.
 */
class TrackService : Service() {

    companion object {
        @Volatile var running = false
        private const val CHANNEL = "trace"
        private const val NOTIF_ID = 42
    }

    private var lm: LocationManager? = null
    private var last: Location? = null

    private val listener = object : LocationListener {
        override fun onLocationChanged(loc: Location) = onLocation(loc)
        @Deprecated("Deprecated in Java")
        override fun onStatusChanged(provider: String?, status: Int, extras: Bundle?) {}
        override fun onProviderEnabled(provider: String) {}
        override fun onProviderDisabled(provider: String) {}
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        createChannel()
        val n = notification()
        try {
            if (Build.VERSION.SDK_INT >= 29) startForeground(NOTIF_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION)
            else startForeground(NOTIF_ID, n)
        } catch (e: Exception) {
            stopSelf(); return START_NOT_STICKY
        }
        if (!running) {
            try {
                val m = getSystemService(Context.LOCATION_SERVICE) as LocationManager
                m.requestLocationUpdates(LocationManager.GPS_PROVIDER, 2000L, 0f, listener, Looper.getMainLooper())
                lm = m
                running = true
                last = TrackStore.lastLocation(this)
            } catch (e: SecurityException) {
                stopSelf(); return START_NOT_STICKY
            } catch (e: Exception) {
                stopSelf(); return START_NOT_STICKY
            }
        }
        return START_STICKY
    }

    private fun onLocation(loc: Location) {
        if (loc.hasAccuracy() && loc.accuracy > 35f) return
        val prev = last
        if (prev != null && prev.distanceTo(loc) < 5f) return
        TrackStore.append(this, loc)
        last = loc
    }

    override fun onDestroy() {
        try { lm?.removeUpdates(listener) } catch (_: Exception) { }
        running = false
        super.onDestroy()
    }

    private fun createChannel() {
        if (Build.VERSION.SDK_INT >= 26) {
            val nm = getSystemService(NotificationManager::class.java)
            if (nm.getNotificationChannel(CHANNEL) == null) {
                nm.createNotificationChannel(
                    NotificationChannel(CHANNEL, "Enregistrement de trace", NotificationManager.IMPORTANCE_LOW)
                )
            }
        }
    }

    private fun notification(): Notification {
        val open = PendingIntent.getActivity(
            this, 0,
            Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )
        val b = if (Build.VERSION.SDK_INT >= 26) Notification.Builder(this, CHANNEL) else @Suppress("DEPRECATION") Notification.Builder(this)
        return b.setSmallIcon(R.drawable.ic_stat_track)
            .setContentTitle("Affût GPS")
            .setContentText("Enregistrement de la trace en cours")
            .setContentIntent(open)
            .setOngoing(true)
            .build()
    }
}

/** Points de la trace en cours, gardés dans un fichier (une ligne JSON par point). */
object TrackStore {
    private fun file(c: Context) = File(c.filesDir, "trace-en-cours.jsonl")

    @Synchronized
    fun clear(c: Context) { file(c).delete() }

    @Synchronized
    fun append(c: Context, l: Location) {
        val alt = if (l.hasAltitude()) Math.round(l.altitude).toString() else "null"
        val line = "[%.6f,%.6f,%d,%s]".format(java.util.Locale.US, l.latitude, l.longitude, l.time, alt)
        file(c).appendText(line + "\n")
    }

    @Synchronized
    fun readSince(c: Context, n: Int): String {
        val f = file(c)
        if (!f.exists()) return "[]"
        val lines = f.readLines().filter { it.isNotBlank() }
        if (n >= lines.size) return "[]"
        return lines.drop(maxOf(0, n)).joinToString(",", "[", "]")
    }

    @Synchronized
    fun lastLocation(c: Context): Location? {
        val f = file(c)
        if (!f.exists()) return null
        val lastLine = f.readLines().lastOrNull { it.isNotBlank() } ?: return null
        return try {
            val a = JSONArray(lastLine)
            Location("store").apply { latitude = a.getDouble(0); longitude = a.getDouble(1) }
        } catch (e: Exception) { null }
    }
}
