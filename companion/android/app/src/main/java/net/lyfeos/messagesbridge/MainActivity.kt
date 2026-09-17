package net.lyfeos.messagesbridge

import android.Manifest
import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Bundle
import android.widget.*
import java.util.concurrent.Executors

class MainActivity : Activity() {
  private val executor = Executors.newSingleThreadExecutor()
  override fun onCreate(savedInstanceState: Bundle?) { super.onCreate(savedInstanceState)
    val box = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(48, 48, 48, 48) }
    val title = TextView(this).apply { text = "LyfeOS Android Messages Bridge"; textSize = 22f }; val server = EditText(this).apply { hint = "https://lyfeos.net"; setText("https://lyfeos.net") }; val code = EditText(this).apply { hint = "Pairing code from LyfeOS" }; val status = TextView(this); val button = Button(this).apply { text = "Pair this Android phone" }
    box.addView(title); box.addView(TextView(this).apply { text = "This bridge can send and receive SMS only after you approve Android’s permissions. It does not claim access to RCS." }); box.addView(server); box.addView(code); box.addView(button); box.addView(status); setContentView(box)
    button.setOnClickListener { executor.execute { try { BridgeClient.claim(this, server.text.toString(), code.text.toString(), android.os.Build.MODEL); runOnUiThread { status.text = "Paired. Approve SMS permissions to start the bridge."; requestPermissions(arrayOf(Manifest.permission.READ_SMS, Manifest.permission.RECEIVE_SMS, Manifest.permission.SEND_SMS, Manifest.permission.POST_NOTIFICATIONS), 1); startForegroundService(Intent(this, BridgeService::class.java)) } } catch (error: Exception) { runOnUiThread { status.text = error.message ?: "Pairing failed." } } } }
  }
  override fun onDestroy() { executor.shutdownNow(); super.onDestroy() }
}
