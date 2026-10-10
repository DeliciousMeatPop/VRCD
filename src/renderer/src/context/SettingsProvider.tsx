import React, { ReactNode, useEffect, useState, useCallback, useMemo } from 'react'
import { ServerConfigInfo } from '@shared/types'
import { SettingsContext, SettingsContextType } from './SettingsContext'

interface SettingsProviderProps {
  children: ReactNode
}

export const SettingsProvider: React.FC<SettingsProviderProps> = ({ children }) => {
  const [downloadPath, setDownloadPathState] = useState<string>('')
  const [extractionPath, setExtractionPathState] = useState<string>('')
  const [downloadSpeedLimit, setDownloadSpeedLimitState] = useState<number>(0)
  const [uploadSpeedLimit, setUploadSpeedLimitState] = useState<number>(0)
  const [colorScheme, setColorSchemeState] = useState<'light' | 'dark'>(
    window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  )
  const [serverConfig, setServerConfigState] = useState<ServerConfigInfo>({
    baseUri: '',
    password: ''
  })
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)

  // Load initial settings when component mounts
  useEffect(() => {
    let isMounted = true

    const loadSettings = async (): Promise<void> => {
      try {
        const [path, extraction, downloadLimit, uploadLimit, colorScheme, server] =
          await Promise.all([
            window.api.settings.getDownloadPath(),
            window.api.settings.getExtractionPath(),
            window.api.settings.getDownloadSpeedLimit(),
            window.api.settings.getUploadSpeedLimit(),
            window.api.settings.getColorScheme(),
            window.api.settings.getServerConfig()
          ])

        if (isMounted) {
          console.log('Fetched initial download path:', path)
          console.log('Fetched initial download speed limit:', downloadLimit)
          console.log('Fetched initial upload speed limit:', uploadLimit)
          setDownloadPathState(path)
          setExtractionPathState(extraction)
          setDownloadSpeedLimitState(downloadLimit)
          setUploadSpeedLimitState(uploadLimit)
          setColorSchemeState(colorScheme)
          setServerConfigState(server)
        }
      } catch (err) {
        console.error('Error fetching settings:', err)
        if (isMounted) {
          setError('Failed to load settings')
        }
      } finally {
        if (isMounted) {
          setIsLoading(false)
        }
      }
    }

    loadSettings()

    return () => {
      isMounted = false
    }
  }, [])

  const setExtractionPath = useCallback(async (path: string): Promise<void> => {
    try {
      await window.api.settings.setExtractionPath(path)
      setExtractionPathState(path)
      setError(null)
    } catch (err) {
      console.error('Error setting extraction path:', err)
      setError('Failed to update extraction path')
      throw err
    }
  }, [])

  // Function to update download path
  const setDownloadPath = useCallback(async (path: string): Promise<void> => {
    try {
      setIsLoading(true)
      await window.api.settings.setDownloadPath(path)
      setDownloadPathState(path)
      setError(null)
    } catch (err) {
      console.error('Error setting download path:', err)
      setError('Failed to update download path')
      throw err
    } finally {
      setIsLoading(false)
    }
  }, [])

  // Function to update download speed limit
  const setDownloadSpeedLimit = useCallback(async (limit: number): Promise<void> => {
    try {
      setIsLoading(true)
      await window.api.settings.setDownloadSpeedLimit(limit)
      setDownloadSpeedLimitState(limit)
      setError(null)
    } catch (err) {
      console.error('Error setting download speed limit:', err)
      setError('Failed to update download speed limit')
      throw err
    } finally {
      setIsLoading(false)
    }
  }, [])

  // Function to update upload speed limit
  const setUploadSpeedLimit = useCallback(async (limit: number): Promise<void> => {
    try {
      setIsLoading(true)
      await window.api.settings.setUploadSpeedLimit(limit)
      setUploadSpeedLimitState(limit)
      setError(null)
    } catch (err) {
      console.error('Error setting upload speed limit:', err)
      setError('Failed to update upload speed limit')
      throw err
    } finally {
      setIsLoading(false)
    }
  }, [])

  const setColorScheme = useCallback(async (scheme: 'light' | 'dark'): Promise<void> => {
    try {
      setIsLoading(true)
      await window.api.settings.setColorScheme(scheme)
      setColorSchemeState(scheme)
      setError(null)
    } catch (err) {
      console.error('Error setting color scheme:', err)
      setError('Failed to update color scheme')
      throw err
    } finally {
      setIsLoading(false)
    }
  }, [])

  const setServerConfig = useCallback(async (config: ServerConfigInfo): Promise<void> => {
    try {
      setIsLoading(true)
      await window.api.settings.setServerConfig(config)
      setServerConfigState(config)
      setError(null)
    } catch (err) {
      console.error('Error setting server config:', err)
      setError('Failed to update server configuration')
      throw err
    } finally {
      setIsLoading(false)
    }
  }, [])

  const value = useMemo<SettingsContextType>(
    () => ({
      downloadPath,
      extractionPath,
      downloadSpeedLimit,
      uploadSpeedLimit,
      colorScheme,
      serverConfig,
      isLoading,
      error,
      setDownloadPath,
      setExtractionPath,
      setDownloadSpeedLimit,
      setUploadSpeedLimit,
      setColorScheme,
      setServerConfig
    }),
    [
      downloadPath,
      extractionPath,
      downloadSpeedLimit,
      uploadSpeedLimit,
      colorScheme,
      serverConfig,
      isLoading,
      error,
      setDownloadPath,
      setExtractionPath,
      setDownloadSpeedLimit,
      setUploadSpeedLimit,
      setColorScheme,
      setServerConfig
    ]
  )

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>
}
