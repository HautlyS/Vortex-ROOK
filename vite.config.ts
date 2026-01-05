import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'
import { readFileSync } from 'fs'

const isWeb = process.env.BUILD_TARGET === 'web'
const basePath = process.env.VITE_BASE_PATH || (isWeb ? '/Vortex-ROOK/' : '/')

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    // Handle WASM files properly
    {
      name: 'wasm-handler',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (req.url?.endsWith('.wasm')) {
            res.setHeader('Content-Type', 'application/wasm')
          }
          next()
        })
      },
      generateBundle() {
        if (isWeb) {
          this.emitFile({
            type: 'asset',
            fileName: 'book_creation_wasm_bg.wasm',
            source: readFileSync(resolve(__dirname, 'src-wasm/pkg/book_creation_wasm_bg.wasm')),
          })
        }
      },
    },
  ],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      'book-creation-wasm': resolve(__dirname, 'src-wasm/pkg'),
    },
  },
  base: basePath,
  clearScreen: false,
  server: {
    watch: {
      ignored: ['**/src-tauri/**', '**/src-wasm/target/**'],
    },
    fs: {
      allow: ['..'],
    },
  },
  build: {
    target: isWeb ? 'esnext' : (process.env.TAURI_ENV_PLATFORM === 'windows' ? 'chrome105' : 'safari14'),
    minify: isWeb ? 'esbuild' : (!process.env.TAURI_ENV_DEBUG ? 'esbuild' : false),
    sourcemap: isWeb ? false : !!process.env.TAURI_ENV_DEBUG,
    outDir: isWeb ? 'dist-web' : 'dist',
    assetsInlineLimit: 0,
    rollupOptions: {
      external: isWeb ? [] : ['book-creation-wasm'],
    },
  },
  assetsInclude: ['**/*.wasm'],
  optimizeDeps: {
    exclude: ['book-creation-wasm'],
  },
  esbuild: {
    supported: {
      'top-level-await': true,
    },
  },
})
