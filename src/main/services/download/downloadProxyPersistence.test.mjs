import assert from 'node:assert/strict'
import test from 'node:test'

const persistence = await import('./downloadProxy.ts').catch(() => ({}))

test('writes normalized custom proxy settings and exposes write failures', () => {
  const settings = {
    downloadPath: '/downloads',
    downloadProxy: { enabled: false, protocol: 'http', host: '', port: 8080 }
  }
  const proxySettings = { enabled: true, protocol: ' HTTPS ', host: ' proxy.example.com ', port: 8443 }
  const normalizedProxySettings = {
    enabled: true,
    protocol: 'https',
    host: 'proxy.example.com',
    port: 8443
  }
  let written = null

  const saved = persistence.persistDownloadProxySettings?.(
    '/settings.json',
    settings,
    proxySettings,
    (_path, contents) => {
      written = contents
    }
  )

  assert.deepEqual(saved?.downloadProxy, normalizedProxySettings)
  assert.deepEqual(JSON.parse(written ?? '{}').downloadProxy, normalizedProxySettings)
  assert.throws(
    () =>
      persistence.persistDownloadProxySettings?.('/settings.json', settings, proxySettings, () => {
        throw new Error('EACCES')
      }),
    /Could not save custom proxy settings/
  )
})
