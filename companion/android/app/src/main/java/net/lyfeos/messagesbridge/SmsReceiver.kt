package net.lyfeos.messagesbridge

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.provider.Telephony
import java.util.concurrent.Executors

class SmsReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val pending = goAsync(); val messages = Telephony.Sms.Intents.getMessagesFromIntent(intent)
    Executors.newSingleThreadExecutor().execute {
      try { messages.forEach { BridgeClient.importSms(context, it.originatingAddress ?: "Unknown", it.messageBody ?: "", it.timestampMillis) } } finally { pending.finish() }
    }
  }
}
