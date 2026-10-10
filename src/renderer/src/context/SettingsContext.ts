import { createContext } from 'react'
import { ServerConfigInfo } from '@shared/types'

export interface SettingsContextType {
  downloadPath: string
  extractionPath: string
  downloadSpeedLimit: number
  uploadSpeedLimit: number
  colorScheme: 'light' | 'dark'
  serverConfig: ServerConfigInfo
  isLoading: boolean
  error: string | null
  setDownloadPath: (path: string) => Promise<void>
  setExtractionPath: (path: string) => Promise<void>
  setDownloadSpeedLimit: (limit: number) => Promise<void>
  setUploadSpeedLimit: (limit: number) => Promise<void>
  setColorScheme: (scheme: 'light' | 'dark') => Promise<void>
  setServerConfig: (config: ServerConfigInfo) => Promise<void>
}

export const SettingsContext = createContext<SettingsContextType | undefined>(undefined)
