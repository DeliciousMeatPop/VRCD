import { createContext } from 'react'
import { DownloadItem, DownloadStorageStatus, GameInfo } from '@shared/types'

export interface DownloadContextType {
  queue: DownloadItem[]
  isLoading: boolean
  error: string | null
  storageStatus: DownloadStorageStatus
  retryStorage: () => Promise<DownloadStorageStatus>
  addToQueue: (game: GameInfo) => Promise<boolean>
  removeFromQueue: (releaseName: string) => Promise<void>
  removeFromQueueOnly: (releaseName: string) => Promise<void>
  moveToFront: (releaseName: string) => Promise<boolean>
  moveQueuedUp: (releaseName: string) => Promise<boolean>
  moveQueuedDown: (releaseName: string) => Promise<boolean>
  cancelDownload: (releaseName: string) => void
  retryDownload: (releaseName: string) => void
  pauseDownload: (releaseName: string) => void
  resumeDownload: (releaseName: string) => void
  deleteFiles: (releaseName: string) => Promise<boolean>
}

export const DownloadContext = createContext<DownloadContextType | undefined>(undefined)
