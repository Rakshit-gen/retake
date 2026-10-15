package com.margelo.nitro.retake

import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkInfo
import androidx.work.WorkManager
import com.margelo.nitro.NitroModules
import com.margelo.nitro.core.Promise
import java.util.UUID
import kotlinx.coroutines.flow.first
import java.util.concurrent.TimeUnit

class HybridUploadQueue : HybridUploadQueueSpec() {
  private val workManager: WorkManager
    get() = WorkManager.getInstance(
      NitroModules.applicationContext ?: throw IllegalStateException("React context is not ready yet"),
    )

  override fun enqueue(request: UploadRequest): String {
    val work = OneTimeWorkRequestBuilder<UploadWorker>()
      .setInputData(UploadWorker.inputFor(request))
      .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
      .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 10, TimeUnit.SECONDS)
      .addTag(UploadWorker.TAG_ALL)
      .addTag(request.tag)
      .build()
    workManager.enqueue(work)
    return work.id.toString()
  }

  // The Flow APIs, not the ListenableFuture ones: Guava's future type is
  // swapped for an empty stub on React Native's classpath.
  override fun status(id: String): Promise<UploadStatus?> = Promise.async {
    workManager.getWorkInfoByIdFlow(UUID.fromString(id)).first()?.let(::toStatus)
  }

  override fun list(tag: String): Promise<Array<UploadStatus>> = Promise.async {
    workManager.getWorkInfosByTagFlow(tag).first().map(::toStatus).toTypedArray()
  }

  override fun cancel(id: String) {
    workManager.cancelWorkById(UUID.fromString(id))
  }

  private fun toStatus(info: WorkInfo): UploadStatus {
    val state = when (info.state) {
      WorkInfo.State.ENQUEUED, WorkInfo.State.BLOCKED ->
        if (info.runAttemptCount > 0) UploadState.RETRYING else UploadState.QUEUED
      WorkInfo.State.RUNNING -> UploadState.RUNNING
      WorkInfo.State.SUCCEEDED -> UploadState.SUCCEEDED
      WorkInfo.State.FAILED -> UploadState.FAILED
      WorkInfo.State.CANCELLED -> UploadState.CANCELLED
    }
    val out = info.outputData
    return UploadStatus(
      id = info.id.toString(),
      state = state,
      attempts = info.runAttemptCount.toDouble(),
      httpStatus = out.getInt(UploadWorker.OUT_STATUS, 0).toDouble(),
      body = out.getString(UploadWorker.OUT_BODY) ?: "",
    )
  }
}
