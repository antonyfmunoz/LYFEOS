package net.lyfeos.messagesbridge

import android.content.Context
import android.telephony.SmsManager
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest

data class BridgeConfig(val server: String, val token: String)

object BridgeClient {
  private const val preferences = "lyfeos_message_bridge"
  fun config(context: Context): BridgeConfig? {
    val prefs = context.getSharedPreferences(preferences, Context.MODE_PRIVATE)
    val server = prefs.getString("server", null); val token = prefs.getString("token", null)
    return if (server.isNullOrBlank() || token.isNullOrBlank()) null else BridgeConfig(server, token)
  }
  fun save(context: Context, config: BridgeConfig) { context.getSharedPreferences(preferences, Context.MODE_PRIVATE).edit().putString("server", config.server).putString("token", config.token).apply() }
  fun claim(context: Context, server: String, code: String, name: String): BridgeConfig {
    val response = request("${server.trimEnd('/')}/api/message-bridge/claim", "POST", null, JSONObject().put("pairingCode", code).put("displayName", name).put("publicKey", JSONObject.NULL))
    return BridgeConfig(server.trimEnd('/'), response.getString("deviceToken")).also { save(context, it) }
  }
  fun importSms(context: Context, address: String, body: String, timestamp: Long) {
    val config = config(context) ?: return
    val eventId = "android-sms:${timestamp}:${address}:${sha256(body)}"
    val payload = JSONObject().put("threadId", "sms:$address").put("title", address).put("recipientHandle", address).put("providerMessageId", eventId).put("direction", "inbound").put("body", body).put("occurredAt", java.time.Instant.ofEpochMilli(timestamp).toString()).put("status", "received")
    request("${config.server}/api/message-bridge/events", "POST", config.token, payload)
  }
  fun executePending(context: Context) {
    val config = config(context) ?: return
    val commands = request("${config.server}/api/message-bridge/commands", "GET", config.token, null).optJSONArray("commands") ?: JSONArray()
    for (index in 0 until commands.length()) {
      val command = commands.getJSONObject(index); if (command.optString("kind") != "send") continue
      val id = command.getString("id"); val payload = command.getJSONObject("payload")
      try {
        @Suppress("DEPRECATION") SmsManager.getDefault().sendTextMessage(payload.getString("recipientHandle"), null, payload.getString("body"), null, null)
        request("${config.server}/api/message-bridge/commands/$id/complete", "POST", config.token, JSONObject().put("state", "sent").put("providerMessageId", JSONObject.NULL).put("failureCode", JSONObject.NULL))
      } catch (_: Exception) {
        request("${config.server}/api/message-bridge/commands/$id/complete", "POST", config.token, JSONObject().put("state", "failed").put("providerMessageId", JSONObject.NULL).put("failureCode", "ANDROID_SMS_SEND_FAILED"))
      }
    }
  }
  private fun request(rawUrl: String, method: String, token: String?, payload: JSONObject?): JSONObject {
    val connection = URL(rawUrl).openConnection() as HttpURLConnection; connection.requestMethod = method; connection.connectTimeout = 15_000; connection.readTimeout = 15_000; connection.setRequestProperty("Accept", "application/json")
    if (token != null) connection.setRequestProperty("Authorization", "Bearer $token")
    if (payload != null) { connection.doOutput = true; connection.setRequestProperty("Content-Type", "application/json"); connection.outputStream.use { it.write(payload.toString().toByteArray()) } }
    val text = (if (connection.responseCode in 200..299) connection.inputStream else connection.errorStream).bufferedReader().use { it.readText() }
    if (connection.responseCode !in 200..299) throw IllegalStateException(JSONObject(text).optString("error", "Bridge request failed"))
    return JSONObject(text)
  }
  private fun sha256(value: String): String = MessageDigest.getInstance("SHA-256").digest(value.toByteArray()).joinToString("") { "%02x".format(it) }
}
