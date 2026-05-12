import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    define: {
      // Baked in at build time from the VRSRC_API_KEY environment variable.
      // Set this via CI secret or a local .env file (see .env.example).
      // The value is embedded in the compiled binary and never stored in source.
      'process.env.VRSRC_API_KEY': JSON.stringify(process.env.VRSRC_API_KEY ?? '')
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
})
