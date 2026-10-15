import { NitroModules } from 'react-native-nitro-modules'
import type { FrameScorer } from './specs/FrameScorer.nitro'
import type { UploadQueue } from './specs/UploadQueue.nitro'

export type { NativeFrameMetrics, FrameScorer } from './specs/FrameScorer.nitro'
export type { UploadField, UploadFile, UploadQueue, UploadRequest, UploadState, UploadStatus } from './specs/UploadQueue.nitro'

export function createFrameScorer(): FrameScorer {
  return NitroModules.createHybridObject<FrameScorer>('FrameScorer')
}

export function createUploadQueue(): UploadQueue {
  return NitroModules.createHybridObject<UploadQueue>('UploadQueue')
}
