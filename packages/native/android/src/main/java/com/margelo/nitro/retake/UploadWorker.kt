package com.margelo.nitro.retake

import android.content.Context
import androidx.work.Data
import androidx.work.Worker
import androidx.work.WorkerParameters
import java.io.ByteArrayOutputStream
import java.io.DataOutputStream
import java.io.File
import java.io.IOException
import java.io.InputStream
import java.net.HttpURLConnection
import java.net.URL

/**
 * Posts one multipart request. Network errors, timeouts, 408, 429 and 5xx
 * are retried with WorkManager's exponential backoff. Other 4xx responses
 * are final: sending the same request again will not change the answer.
 *
 * The WorkManager job id goes out as an Idempotency-Key header, so if a
 * response is lost after the server stored the upload, the retry does not
 * create a second copy.
 */
class UploadWorker(context: Context, params: WorkerParameters) : Worker(context, params) {
  override fun doWork(): Result {
    if (runAttemptCount >= MAX_ATTEMPTS) return Result.failure(output(0, "gave up after $runAttemptCount attempts"))
    val files = filesFrom(inputData)
    val missing = files.firstOrNull { !File(it.path).isFile }
    if (missing != null) return Result.failure(output(0, "file is gone: ${missing.path}"))

    return try {
      val (code, body) = post(
        url = inputData.getString(KEY_URL) ?: return Result.failure(output(0, "no url")),
        fields = fieldsFrom(inputData),
        files = files,
      )
      when {
        code in 200..299 -> Result.success(output(code, body))
        code == 408 || code == 429 || code >= 500 -> Result.retry()
        else -> Result.failure(output(code, body))
      }
    } catch (e: IOException) {
      Result.retry()
    }
  }

  private fun post(url: String, fields: List<UploadField>, files: List<UploadFile>): Pair<Int, String> {
    val boundary = "retake-" + id.toString()
    val conn = URL(url).openConnection() as HttpURLConnection
    try {
      conn.requestMethod = "POST"
      conn.doOutput = true
      conn.connectTimeout = 15_000
      conn.readTimeout = 30_000
      // Stream the body instead of buffering every photo in memory first.
      conn.setChunkedStreamingMode(0)
      conn.setRequestProperty("Content-Type", "multipart/form-data; boundary=$boundary")
      conn.setRequestProperty("Idempotency-Key", id.toString())
      conn.setRequestProperty("X-Attempt", (runAttemptCount + 1).toString())

      DataOutputStream(conn.outputStream).use { out ->
        for (f in fields) {
          out.writeBytes("--$boundary\r\n")
          out.writeBytes("Content-Disposition: form-data; name=\"${f.name}\"\r\n\r\n")
          out.write(f.value.toByteArray(Charsets.UTF_8))
          out.writeBytes("\r\n")
        }
        for (f in files) {
          val file = File(f.path)
          out.writeBytes("--$boundary\r\n")
          out.writeBytes("Content-Disposition: form-data; name=\"${f.name}\"; filename=\"${file.name}\"\r\n")
          out.writeBytes("Content-Type: ${f.contentType}\r\n\r\n")
          file.inputStream().use { it.copyTo(out) }
          out.writeBytes("\r\n")
        }
        out.writeBytes("--$boundary--\r\n")
      }

      val code = conn.responseCode
      val stream = if (code >= 400) conn.errorStream else conn.inputStream
      val body = stream?.use(::readCapped) ?: ""
      return code to body
    } finally {
      conn.disconnect()
    }
  }

  // InputStream.readNBytes needs Android 13, so read in chunks up to the cap.
  private fun readCapped(s: InputStream): String {
    val out = ByteArrayOutputStream()
    val chunk = ByteArray(4096)
    while (out.size() < MAX_BODY) {
      val n = s.read(chunk, 0, minOf(chunk.size, MAX_BODY - out.size()))
      if (n < 0) break
      out.write(chunk, 0, n)
    }
    return out.toString("UTF-8")
  }

  private fun output(code: Int, body: String): Data =
    Data.Builder().putInt(OUT_STATUS, code).putString(OUT_BODY, body.take(MAX_BODY)).build()

  companion object {
    const val TAG_ALL = "retake-upload"
    const val OUT_STATUS = "status"
    const val OUT_BODY = "body"
    private const val MAX_ATTEMPTS = 8
    // WorkManager Data is capped at 10 KB in total.
    private const val MAX_BODY = 8 * 1024
    private const val KEY_URL = "url"
    private const val KEY_FIELD_NAMES = "fieldNames"
    private const val KEY_FIELD_VALUES = "fieldValues"
    private const val KEY_FILE_NAMES = "fileNames"
    private const val KEY_FILE_PATHS = "filePaths"
    private const val KEY_FILE_TYPES = "fileTypes"

    fun inputFor(r: UploadRequest): Data = Data.Builder()
      .putString(KEY_URL, r.url)
      .putStringArray(KEY_FIELD_NAMES, r.fields.map { it.name }.toTypedArray())
      .putStringArray(KEY_FIELD_VALUES, r.fields.map { it.value }.toTypedArray())
      .putStringArray(KEY_FILE_NAMES, r.files.map { it.name }.toTypedArray())
      .putStringArray(KEY_FILE_PATHS, r.files.map { it.path }.toTypedArray())
      .putStringArray(KEY_FILE_TYPES, r.files.map { it.contentType }.toTypedArray())
      .build()

    private fun strings(d: Data, key: String): List<String> =
      d.getNullableStringArray(key)?.map { it ?: "" } ?: emptyList()

    private fun fieldsFrom(d: Data): List<UploadField> {
      val names = strings(d, KEY_FIELD_NAMES)
      val values = strings(d, KEY_FIELD_VALUES)
      return names.indices.map { UploadField(names[it], values[it]) }
    }

    private fun filesFrom(d: Data): List<UploadFile> {
      val names = strings(d, KEY_FILE_NAMES)
      val paths = strings(d, KEY_FILE_PATHS)
      val types = strings(d, KEY_FILE_TYPES)
      return names.indices.map { UploadFile(names[it], paths[it], types[it]) }
    }
  }
}
