import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ command }) => {
  const apiKey = process.env.VRSRC_API_KEY ?? ''
  if (command === 'build' && !apiKey) {
    throw new Error(
      'VRSRC_API_KEY is not set. Production builds require this env var ' +
        '(set it as a GitHub Actions secret in CI, or in .env locally). ' +
        'Without it, every request to the bundled server will return 403.'
    )
  }
  if (!apiKey) {
    console.warn(
      '[electron.vite.config] VRSRC_API_KEY is unset — server requests will 403 at runtime.'
    )
  }

  return {
    main: {
      plugins: [externalizeDepsPlugin()],
      define: {
        'process.env.VRSRC_API_KEY': JSON.stringify(apiKey)
      },
      resolve: {
        alias: {
          '@shared': resolve('src/shared')
        }
      }
    },
    preload: {
      plugins: [externalizeDepsPlugin()],
      resolve: {
        alias: {
          '@shared': resolve('src/shared')
        }
      }
    },
    renderer: {
      resolve: {
        alias: {
          '@renderer': resolve('src/renderer/src'),
          '@shared': resolve('src/shared')
        }
      },
      plugins: [react()]
    }
  }
})
