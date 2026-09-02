import {
  Settings,
  SettingsAPI,
  ServerConfigInfo,
  ExistingDownloadAction,
  WindowBounds,
  DownloadProxySettings
} from '@shared/types'
import { sanitizeBaseUri } from '@shared/serverConfig'
import { app, nativeTheme } from 'electron'
import { join } from 'path'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import EventEmitter from 'events'
import {
  DEFAULT_DOWNLOAD_PROXY_SETTINGS,
  normalizeDownloadProxySettings,
  readPersistedDownloadProxySettings,
  persistDownloadProxySettings
} from './download/downloadProxy'

class SettingsService extends EventEmitter implements SettingsAPI {
  private settings: Settings
  private settingsPath: string

  constructor() {
    super()
    this.settingsPath = join(app.getPath('userData'), 'settings.json')

    // Default settings
    this.settings = {
      downloadPath: join(app.getPath('userData'), 'downloads'),
      downloadSpeedLimit: 0,
      uploadSpeedLimit: 0,
      hideAdultContent: true,
      colorScheme: nativeTheme.shouldUseDarkColors ? 'dark' : 'light',
      serverConfig: { baseUri: '', password: '' },
      maxConcurrentDownloads: 3,
      existingDownloadAction: 'ask',
      downloadProxy: { ...DEFAULT_DOWNLOAD_PROXY_SETTINGS }
    }

    // Load settings from disk
    this.loadSettings()
  }

  getDownloadPath(): string {
    return this.settings.downloadPath
  }

  setDownloadPath(path: string): void {
    this.settings.downloadPath = path
    this.saveSettings()
    this.emit('download-path-changed', path)
  }

  getDownloadSpeedLimit(): number {
    return this.settings.downloadSpeedLimit
  }

  setDownloadSpeedLimit(limit: number): void {
    this.settings.downloadSpeedLimit = limit
    this.saveSettings()
    this.emit('download-speed-limit-changed', limit)
  }

  getUploadSpeedLimit(): number {
    return this.settings.uploadSpeedLimit
  }

  setUploadSpeedLimit(limit: number): void {
    this.settings.uploadSpeedLimit = limit
    this.saveSettings()
    this.emit('upload-speed-limit-changed', limit)
  }

  getColorScheme(): 'light' | 'dark' {
    return this.settings.colorScheme
  }

  setColorScheme(scheme: 'light' | 'dark'): void {
    this.settings.colorScheme = scheme
    this.saveSettings()
    this.emit('color-scheme-changed', scheme)
  }

  getServerConfig(): ServerConfigInfo {
    // No bundled/hardcoded server. When nothing has been configured the app
    // runs as a pure sideloader; a server (public vrSrc JSON or an rclone
    // config) only comes into play once the user adds one via Manage Remotes.
    // Sanitize on read so a previously-saved bad value (e.g. a URL with
    // wrapping quotes) is healed before it ever reaches rclone.
    const uri = sanitizeBaseUri(this.settings.serverConfig?.baseUri ?? '')
    const pwd = this.settings.serverConfig?.password ?? ''
    return { baseUri: uri, password: pwd }
  }

  setServerConfig(config: ServerConfigInfo): void {
    this.settings.serverConfig = {
      baseUri: sanitizeBaseUri(config.baseUri ?? ''),
      password: config.password ?? ''
    }
    this.saveSettings()
    this.emit('server-config-changed', this.settings.serverConfig)
  }

  getMaxConcurrentDownloads(): number {
    const n = this.settings.maxConcurrentDownloads ?? 3
    return Math.max(1, Math.min(6, n))
  }

  setMaxConcurrentDownloads(n: number): void {
    this.settings.maxConcurrentDownloads = Math.max(1, Math.min(6, n))
    this.saveSettings()
    this.emit('max-concurrent-downloads-changed', this.settings.maxConcurrentDownloads)
  }

  getExistingDownloadAction(): ExistingDownloadAction {
    return this.settings.existingDownloadAction ?? 'ask'
  }

  setExistingDownloadAction(v: ExistingDownloadAction): void {
    this.settings.existingDownloadAction = v
    this.saveSettings()
    this.emit('existing-download-action-changed', v)
  }

  getDownloadProxy(): DownloadProxySettings {
    return { ...this.settings.downloadProxy }
  }

  setDownloadProxy(settings: DownloadProxySettings): DownloadProxySettings {
    const normalized = normalizeDownloadProxySettings(settings)
    this.settings = persistDownloadProxySettings(
      this.settingsPath,
      this.settings,
      normalized,
      (settingsPath, contents) => writeFileSync(settingsPath, contents, 'utf-8')
    )
    return { ...normalized }
  }

  getWindowBounds(): WindowBounds | undefined {
    return this.settings.windowBounds
  }

  setWindowBounds(bounds: WindowBounds): void {
    this.settings.windowBounds = bounds
    this.saveSettings()
  }

  private loadSettings(): void {
    try {
      const exists = existsSync(this.settingsPath)
      if (exists) {
        const data = readFileSync(this.settingsPath, 'utf-8')
        const loadedSettings = JSON.parse(data)
        this.settings = { ...this.settings, ...loadedSettings }
        this.settings.downloadProxy = readPersistedDownloadProxySettings(loadedSettings.downloadProxy)
        console.log('Settings loaded successfully')
      } else {
        console.log('No settings file found, using defaults')
        // Create the settings file with default values
        this.saveSettings()
      }
    } catch (error) {
      console.error('Error loading settings:', error)
    }
  }

  private saveSettings(): void {
    try {
      writeFileSync(this.settingsPath, JSON.stringify(this.settings, null, 2), 'utf-8')
      console.log('Settings saved successfully')
    } catch (error) {
      console.error('Error saving settings:', error)
    }
  }
}

export default new SettingsService()
