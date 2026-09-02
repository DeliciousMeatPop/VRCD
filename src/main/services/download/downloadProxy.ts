import { isIP } from 'node:net'
import type { DownloadProxySettings } from '@shared/types'

export const DEFAULT_DOWNLOAD_PROXY_SETTINGS: DownloadProxySettings = {
  enabled: false,
  protocol: 'http',
  host: '',
  port: 8080
}

type ProxySettingsInput = Partial<DownloadProxySettings> | null | undefined

export function normalizeDownloadProxySettings(value: ProxySettingsInput): DownloadProxySettings {
  if (!value || typeof value !== 'object') return { ...DEFAULT_DOWNLOAD_PROXY_SETTINGS }

  const enabled = value.enabled === true
  const protocol = typeof value.protocol === 'string' ? value.protocol.trim().toLowerCase() : 'http'
  if (protocol !== 'http' && protocol !== 'https') {
    throw new Error('Proxy protocol must be HTTP or HTTPS.')
  }

  const host = typeof value.host === 'string' ? value.host.trim() : ''
  const port = value.port === undefined ? DEFAULT_DOWNLOAD_PROXY_SETTINGS.port : value.port
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('Proxy port must be an integer from 1 through 65535.')
  }
  if (enabled) validateProxyHost(host)

  return { enabled, protocol, host, port }
}

export function buildRcloneDownloadEnvironment(
  proxySettings: DownloadProxySettings,
  inheritedEnvironment: NodeJS.ProcessEnv = process.env
): NodeJS.ProcessEnv {
  const normalized = normalizeDownloadProxySettings(proxySettings)
  const environment = { ...inheritedEnvironment }
  if (!normalized.enabled) return environment

  for (const key of Object.keys(environment)) {
    if (['http_proxy', 'https_proxy', 'no_proxy'].includes(key.toLowerCase())) {
      delete environment[key]
    }
  }

  const proxyUrl = buildProxyUrl(normalized)
  environment.HTTP_PROXY = proxyUrl
  environment.http_proxy = proxyUrl
  environment.HTTPS_PROXY = proxyUrl
  environment.https_proxy = proxyUrl
  environment.NO_PROXY = ''
  environment.no_proxy = ''
  return environment
}

function validateProxyHost(host: string): void {
  if (!host) throw new Error('Proxy host is required when custom proxy routing is enabled.')
  if (host.includes('://') || /[/?#@\[\]]/.test(host)) {
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
  return `${proxySettings.protocol}://${host}:${proxySettings.port}`
}
