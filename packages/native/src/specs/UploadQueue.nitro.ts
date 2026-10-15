import type { HybridObject } from 'react-native-nitro-modules'

export interface UploadField {
  name: string
  value: string
}

export interface UploadFile {
  name: string
  /** Absolute path to a file the app owns (not the cache dir, which Android may clear). */
  path: string
  contentType: string
}

export interface UploadRequest {
  url: string
  fields: UploadField[]
  files: UploadFile[]
  /** Group key, e.g. "claim" or "pickup:42", for listing jobs later. */
  tag: string
}

export type UploadState = 'queued' | 'running' | 'retrying' | 'succeeded' | 'failed' | 'cancelled'

export interface UploadStatus {
  id: string
  state: UploadState
  /** How many times the worker has started this job. */
  attempts: number
  /** HTTP status of the last finished attempt, 0 if none. */
  httpStatus: number
  /** Response body of a finished job, cut to 8 KB. */
  body: string
}

/**
 * Multipart uploads run by Android WorkManager. Jobs are persisted by
 * WorkManager, so they survive the app being killed or the phone restarting,
 * and they wait for a network connection before starting.
 */
export interface UploadQueue extends HybridObject<{ android: 'kotlin' }> {
  enqueue(request: UploadRequest): string
  status(id: string): Promise<UploadStatus | undefined>
  list(tag: string): Promise<UploadStatus[]>
  cancel(id: string): void
}
