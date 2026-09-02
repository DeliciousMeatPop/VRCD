import { isIP } from 'node:net'
import type { DownloadProxySettings, Settings } from '@shared/types'

export const DEFAULT_DOWNLOAD_PROXY_SETTINGS: DownloadProxySettings = {
  enabled: false,
  protocol: 'http',
  host: '',
  port: 8080
}

type ProxySettingsInput = Partial<DownloadProxySettings> | null | undefined

export interface RcloneMirrorConfig {
  configFilePath: string
  remoteName: string
}

export interface GameArchiveRoutingSnapshot {
  proxySettings: DownloadProxySettings
  usePublicEndpoint: boolean
}

export type SettingsFileWriter = (path: string, contents: string) => void

export function normalizeDownloadProxySettings(value: ProxySettingsInput): DownloadProxySettings {
  if (!value || typeof value !== 'object') return { ...DEFAULT_DOWNLOAD_PROXY_SETTINGS }

  const enabled = value.enabled === true
  const protocol = typeof value.protocol === 'string' ? value.protocol.trim().toLowerCase() : 'http'
  if (protocol !== 'http' && protocol !== 'https' && protocol !== 'socks5') {
    throw new Error('Proxy protocol must be HTTP, HTTPS, or SOCKS5.')
  }

  const host = typeof value.host === 'string' ? value.host.trim() : ''
  const port = value.port === undefined ? DEFAULT_DOWNLOAD_PROXY_SETTINGS.port : value.port
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('Proxy port must be an integer from 1 through 65535.')
  }

  // Credentials are optional. Username is trimmed like a hostname; the password
  // is taken verbatim since it may legitimately contain leading/trailing spaces.
  const username = typeof value.username === 'string' ? value.username.trim() : ''
  const password = typeof value.password === 'string' ? value.password : ''
  if (password && !username) {
    throw new Error('Proxy password requires a username.')
  }

  if (enabled) validateProxyHost(host)

  const normalized: DownloadProxySettings = {
    enabled,
    protocol: protocol as DownloadProxySettings['protocol'],
    host,
    port
  }
  if (username) normalized.username = username
  if (password) normalized.password = password
  return normalized
}

export function readPersistedDownloadProxySettings(value: unknown): DownloadProxySettings {
  try {
    return normalizeDownloadProxySettings(value as ProxySettingsInput)
  } catch {
    return { ...DEFAULT_DOWNLOAD_PROXY_SETTINGS }
  }
}

export function persistDownloadProxySettings(
  settingsPath: string,
  settings: Settings,
  downloadProxy: DownloadProxySettings,
  writeSettingsFile: SettingsFileWriter
): Settings {
  const normalizedProxy = normalizeDownloadProxySettings(downloadProxy)
  const savedSettings = { ...settings, downloadProxy: normalizedProxy }
  try {
    writeSettingsFile(settingsPath, JSON.stringify(savedSettings, null, 2))
  } catch {
    throw new Error('Could not save custom proxy settings. Check that the settings folder is writable.')
  }
  return savedSettings
}

export function buildRcloneDownloadEnvironment(
  proxySettings: DownloadProxySettings,
  inheritedEnvironment: NodeJS.ProcessEnv = process.env
): NodeJS.ProcessEnv {
  const normalized = normalizeDownloadProxySettings(proxySettings)
  const environment = { ...inheritedEnvironment }
  if (!normalized.enabled) return environment

  for (const key of Object.keys(environment)) {
    if (['http_proxy', 'https_proxy', 'all_proxy', 'no_proxy'].includes(key.toLowerCase())) {
      delete environment[key]
    }
  }

  const proxyUrl = buildProxyUrl(normalized)
  environment.HTTP_PROXY = proxyUrl
  environment.http_proxy = proxyUrl
  environment.HTTPS_PROXY = proxyUrl
  environment.https_proxy = proxyUrl
  // SOCKS5 is dialed from ALL_PROXY, which rclone's Go HTTP transport honors for
  // every scheme; it's harmless for HTTP/HTTPS proxies, where the scheme-specific
  // variables above take precedence.
  environment.ALL_PROXY = proxyUrl
  environment.all_proxy = proxyUrl
  environment.NO_PROXY = ''
  environment.no_proxy = ''
  return environment
}

export function buildGameArchiveRcloneEnvironment(
  _isResume: boolean,
  routing: GameArchiveRoutingSnapshot,
  apiKey: string | null,
  inheritedEnvironment: NodeJS.ProcessEnv = process.env
): NodeJS.ProcessEnv {
  const environment = buildRcloneDownloadEnvironment(routing.proxySettings, inheritedEnvironment)
  if (apiKey) environment.RCLONE_HEADER = `X-API-Key: ${apiKey}`
  return environment
}

export function captureGameArchiveRouting(
  proxySettings: DownloadProxySettings
): GameArchiveRoutingSnapshot {
  const normalized = normalizeDownloadProxySettings(proxySettings)
  return {
    proxySettings: normalized,
    usePublicEndpoint: normalized.enabled
  }
}

export function selectGameArchiveMirror(
  routing: GameArchiveRoutingSnapshot,
  activeMirror: RcloneMirrorConfig | undefined
): RcloneMirrorConfig | undefined {
  return routing.usePublicEndpoint ? undefined : activeMirror
}

function validateProxyHost(host: string): void {
  if (!host) throw new Error('Proxy host is required when custom proxy routing is enabled.')
  if (host.includes('://') || /[/?#@[\]]/.test(host)) {
    throw new Error('Proxy host only accepts a DNS name, IPv4 address, or IPv6 address.')
  }
  if (isIP(host) !== 0) return

  if (
    host.length > 253 ||
    /^[0-9.]+$/.test(host) ||
    !host.split('.').every((label) => /^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/.test(label))
  ) {
    throw new Error('Proxy host must be a valid DNS name, IPv4 address, or IPv6 address.')
  }
}

function buildProxyUrl(proxySettings: DownloadProxySettings): string {
  const host = isIP(proxySettings.host) === 6 ? `[${proxySettings.host}]` : proxySettings.host
  // Percent-encode credentials so a ':' or '@' in either can't break the URL.
  const auth = proxySettings.username
    ? `${encodeURIComponent(proxySettings.username)}:${encodeURIComponent(proxySettings.password ?? '')}@`
    : ''
  return `${proxySettings.protocol}://${auth}${host}:${proxySettings.port}`
}
