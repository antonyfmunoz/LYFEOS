package net.lyfeos.messagesbridge

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Intent
import android.os.Handler
import android.os.IBinder
import java.util.concurrent.Executors

class BridgeService : Service() {
  private val handler = Handler(); private val executor = Executors.newSingleThreadExecutor()
  private val poll = object : Runnable { override fun run() { executor.execute { try { BridgeClient.executePending(this@BridgeService) } catch (_: Exception) {} }; handler.postDelayed(this, 10_000) } }
  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int { createChannel(); startForeground(1, android.app.Notification.Builder(this, "lyfeos_messages_bridge").setContentTitle("LyfeOS Messages Bridge").setContentText("Syncing your explicitly paired SMS bridge").setSmallIcon(android.R.drawable.stat_notify_sync).build()); handler.post(poll); return START_STICKY }
  override fun onDestroy() { handler.removeCallbacks(poll); executor.shutdownNow(); super.onDestroy() }
  override fun onBind(intent: Intent?): IBinder? = null
  private fun createChannel() { (getSystemService(NotificationManager::class.java)).createNotificationChannel(NotificationChannel("lyfeos_messages_bridge", "LyfeOS Messages Bridge", NotificationManager.IMPORTANCE_LOW)) }
}
