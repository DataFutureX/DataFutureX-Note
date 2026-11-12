import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import electron from 'vite-plugin-electron/simple'
import { resolve } from 'path'

export default defineConfig({
  base: './',
  plugins: [
    vue(),
    electron({
      main: {
        entry: 'electron/main/index.ts',
        vite: {
          build: {
            outDir: 'dist-electron/main',
            rollupOptions: {
              external: ['electron', 'adm-zip', 'docx']
            }
          }
        }
      },
      preload: {
        input: 'electron/preload/index.ts',
        vite: {
          build: {
            outDir: 'dist-electron/preload'
          }
        }
      },
      renderer: {}
    })
  ],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src')
    }
  },
  server: {
    port: 5173,
    watch: {
      // resources 下托盘 ico/png 会被 Windows Tray 锁文件，监视会 EBUSY 拖垮 Vite
      ignored: [
        '**/.tmp/**',
        '**/.data/**',
        '**/dist/**',
        '**/dist-electron/**',
        '**/release/**',
        '**/resources/**',
        '**/resources/.tray-debug.log'
      ]
    }
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    minify: false,
    target: 'esnext',
    cssMinify: false
  },
  esbuild: {
    legalComments: 'none'
  },
  optimizeDeps: {
    include: ['vditor']
  }
})
