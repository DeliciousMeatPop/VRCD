import assert from 'node:assert/strict'
import test from 'node:test'

const proxy = await import('./downloadProxy.ts').catch(() => ({}))

const DEFAULT_PROXY = { enabled: false, protocol: 'http', host: '', port: 8080 }

test('builds a game-download environment that forces custom proxy routing', () => {
  const environment = proxy.buildRcloneDownloadEnvironment?.(
    { enabled: true, protocol: 'https', host: '2001:db8::7', port: 8443 },
    {
      HTTP_PROXY: 'http://inherited.example:8080',
      https_proxy: 'https://inherited.example:8443',
      No_PrOxY: 'localhost,127.0.0.1',
      RCLONE_HEADER: 'X-API-Key: preserved',
      PATH: '/usr/bin'
    }
  )

  assert.deepEqual(environment, {
    RCLONE_HEADER: 'X-API-Key: preserved',
    PATH: '/usr/bin',
    HTTP_PROXY: 'https://[2001:db8::7]:8443',
    http_proxy: 'https://[2001:db8::7]:8443',
    HTTPS_PROXY: 'https://[2001:db8::7]:8443',
    https_proxy: 'https://[2001:db8::7]:8443',
    NO_PROXY: '',
    no_proxy: ''
  })
})

test('defaults older settings to custom proxy routing disabled', () => {
  assert.deepEqual(proxy.normalizeDownloadProxySettings?.(undefined), DEFAULT_PROXY)
})

test('disables malformed persisted custom proxy settings instead of restoring them', () => {
  assert.deepEqual(
    proxy.readPersistedDownloadProxySettings?.({
      enabled: true,
      protocol: 'socks5',
      host: 'proxy.example.com',
      port: 1080
    }),
    DEFAULT_PROXY
  )
})

test('normalizes valid DNS, IPv4, and IPv6 proxy addresses', () => {
  assert.deepEqual(
    proxy.normalizeDownloadProxySettings?.({
      enabled: true,
      protocol: ' HTTPS ',
      host: ' proxy.example.com ',
      port: 3128
    }),
    { enabled: true, protocol: 'https', host: 'proxy.example.com', port: 3128 }
  )
  assert.deepEqual(
    proxy.normalizeDownloadProxySettings?.({
      enabled: true,
      protocol: 'http',
      host: '192.0.2.10',
      port: 80
    }),
    { enabled: true, protocol: 'http', host: '192.0.2.10', port: 80 }
  )
  assert.deepEqual(
    proxy.normalizeDownloadProxySettings?.({
      enabled: true,
      protocol: 'http',
      host: '2001:db8::1',
      port: 65535
    }),
    { enabled: true, protocol: 'http', host: '2001:db8::1', port: 65535 }
  )
})

test('rejects proxy values that cannot identify an HTTP or HTTPS proxy', () => {
  for (const [value, message] of [
    [{ enabled: true, protocol: 'socks5', host: 'proxy.example.com', port: 1080 }, /HTTP or HTTPS/],
    [{ enabled: true, protocol: 'http', host: 'https://proxy.example.com', port: 8080 }, /host only/],
    [{ enabled: true, protocol: 'http', host: 'proxy.example.com/path', port: 8080 }, /host only/],
    [{ enabled: true, protocol: 'http', host: 'name@example.com', port: 8080 }, /host only/],
    [{ enabled: true, protocol: 'http', host: 'bad_host', port: 8080 }, /DNS name/],
    [{ enabled: true, protocol: 'http', host: '999.0.0.1', port: 8080 }, /DNS name/],
    [{ enabled: true, protocol: 'http', host: 'proxy.example.com', port: 0 }, /integer from 1 through 65535/],
    [{ enabled: true, protocol: 'http', host: 'proxy.example.com', port: 1.5 }, /integer from 1 through 65535/],
    [{ enabled: true, protocol: 'http', host: 'proxy.example.com', port: '8080' }, /integer from 1 through 65535/]
  ]) {
    assert.throws(() => proxy.normalizeDownloadProxySettings?.(value), message)
  }
})

test('preserves inherited process environment when custom proxy routing is disabled', () => {
  const inherited = { HTTP_PROXY: 'http://system.example:8080', NO_PROXY: 'localhost' }
  assert.deepEqual(
    proxy.buildRcloneDownloadEnvironment?.({ ...DEFAULT_PROXY }, inherited),
    inherited
  )
})

test('prevents a custom proxy download from entering an active mirror path', () => {
  const activeMirror = { configFilePath: '/tmp/mirror.conf', remoteName: 'private-mirror' }
  assert.equal(
    proxy.selectGameArchiveMirror?.(
      { enabled: true, protocol: 'http', host: 'proxy.example.com', port: 8080 },
      activeMirror
    ),
    undefined
  )
  assert.deepEqual(
    proxy.selectGameArchiveMirror?.({ ...DEFAULT_PROXY }, activeMirror),
    activeMirror
  )
})

test('gives fresh and resumed game archive launches the same proxy environment', () => {
  const proxySettings = { enabled: true, protocol: 'http', host: 'proxy.example.com', port: 8080 }
  const inherited = { HTTP_PROXY: 'http://system.example:3128', NO_PROXY: 'localhost' }
  const freshEnvironment = proxy.buildGameArchiveRcloneEnvironment?.(
    false,
    proxySettings,
    'api-key',
    inherited
  )
  const resumedEnvironment = proxy.buildGameArchiveRcloneEnvironment?.(
    true,
    proxySettings,
    'api-key',
    inherited
  )

  assert.deepEqual(freshEnvironment, resumedEnvironment)
  assert.equal(freshEnvironment?.RCLONE_HEADER, 'X-API-Key: api-key')
  assert.equal(freshEnvironment?.HTTPS_PROXY, 'http://proxy.example.com:8080')
})
