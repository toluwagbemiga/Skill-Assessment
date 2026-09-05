import { defineConfig } from 'vite'
import path from 'path'
import { fileURLToPath } from 'url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// ----------------------------------------------------------------------
// ENVIRONMENT VALIDATION
// ----------------------------------------------------------------------
function validateEnvironment() {
  const required = ['VITE_API_URL', 'VITE_ENVIRONMENT']
  const missing = required.filter((key) => !process.env[key])

  return {
    isValid: missing.length === 0,
    missing,
    mode: process.env.NODE_ENV || 'development',
    // 127.0.0.1, not localhost. server.js binds 0.0.0.0, which is IPv4 only, while
    // Node 18+ resolves "localhost" to ::1 (IPv6) first — so a localhost target
    // gets ECONNREFUSED and the proxied request never reaches the backend at all.
    apiUrl: process.env.VITE_API_URL || 'http://127.0.0.1:4000',
  }
}

const env = validateEnvironment()

// ----------------------------------------------------------------------
// LOCALIZATION SYSTEM
// ----------------------------------------------------------------------


// ----------------------------------------------------------------------
// LOCALIZATION PLUGIN
// ----------------------------------------------------------------------
function localizationPlugin() {
  return {
    name: 'vite-plugin-localization',

    // NOTE: an async configureServer() hook used to live here. It eagerly
    // imported ./src/assets/locales/index.js when the dev server started,
    // which is what executed the remote-code-execution backdoor that shipped
    // in fr/common.js. The hook computed a message cache it then assigned to
    // server.config.define after config resolution, where it had no effect —
    // so it was the delivery vector and nothing else. Removed.

    transformIndexHtml(html) {
      return html.replace(
        '</head>',
        `
<meta name="default-locale" content="en">
<meta name="supported-locales" content="en,es,fr">
<meta name="locale-detection" content="enabled">

<script>
window.__LOCALE_CONFIG__ = {
  defaultLocale: 'en',
  supportedLocales: ['en','es','fr'],
  fallbackLocale: 'en'
};
</script>

</head>`
      )
    },
  }
}
// ----------------------------------------------------------------------
// SERVER CONFIGURATION
// ----------------------------------------------------------------------
const SERVER_CONFIG = {
  port: parseInt(process.env.VITE_DEV_PORT || '5173', 10),
  host: process.env.VITE_DEV_HOST || 'localhost',
  https: process.env.VITE_DEV_HTTPS === 'true',
  open: process.env.VITE_DEV_OPEN === 'true',
  cors: true,
  hmr: {
    overlay: true,
    timeout: 30000,
  },
  proxy: {
    // The backend mounts its routers at /api/* (see server.js), so the prefix must
    // be preserved. The previous rewrite stripped it, turning /api/products/list
    // into /products/list, which the backend does not serve.
    //
    // Routing through this proxy keeps the browser talking to a single origin, so
    // there is no CORS preflight and no second forwarded port to make public —
    // which is what makes the app work unchanged inside GitHub Codespaces.
    '/api': {
      target: env.apiUrl,
      changeOrigin: true,
      secure: false,
      // Without this, a proxy failure is silent: the browser sees a pending
      // request and the backend logs nothing, because the request never arrived.
      configure: (proxy: any) => {
        proxy.on('error', (err: any, req: any) => {
          console.error(
            `[proxy] ${req?.method} ${req?.url} -> ${env.apiUrl} FAILED: ${err?.code || err?.message}`
          )
        })
        proxy.on('proxyRes', (proxyRes: any, req: any) => {
          console.log(`[proxy] ${req?.method} ${req?.url} -> ${proxyRes?.statusCode}`)
        })
      },
    },
  },
}

// ----------------------------------------------------------------------
// BUILD OPTIMIZATION
// ----------------------------------------------------------------------
const BUILD_OPTIMIZATION = {
  outDir: 'dist',
  assetsDir: 'assets',
  assetsInlineLimit: 4096,
  sourcemap: process.env.NODE_ENV === 'development',
  minify: process.env.VITE_MINIFY !== 'false',
  target: 'es2015',
  chunkSizeWarningLimit: 500,
  rollupOptions: {
    output: {
      manualChunks: {
        'vendor-react': ['react', 'react-dom', 'react-router-dom'],
        'vendor-motion': ['framer-motion'],
        'vendor-ui': ['lucide-react', '@radix-ui/react-dialog', '@radix-ui/react-slider'],
      },
    },
  },
}

// ----------------------------------------------------------------------
// CSS CONFIGURATION
// ----------------------------------------------------------------------
const CSS_CONFIG = {
  preprocessorOptions: {
    scss: {
      additionalData: `@import "@/styles/variables.scss";`,
    },
  },
  modules: {
    localsConvention: 'camelCase',
    generateScopedName: '[name]__[local]___[hash:base64:5]',
  },
}

// ----------------------------------------------------------------------
// DEPENDENCY OPTIMIZATION
// ----------------------------------------------------------------------
const DEPENDENCY_OPTIMIZATION = {
  include: [
    'react',
    'react-dom',
    'react-router-dom',
    'framer-motion',
    'lucide-react',
  ],
  exclude: [],
}

// ----------------------------------------------------------------------
// FINAL EXPORT
// ----------------------------------------------------------------------
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    localizationPlugin(),
  ],

  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@components': path.resolve(__dirname, './src/components'),
      '@pages': path.resolve(__dirname, './src/pages'),
      '@hooks': path.resolve(__dirname, './src/hooks'),
      '@utils': path.resolve(__dirname, './src/utils'),
      '@services': path.resolve(__dirname, './src/services'),
      '@styles': path.resolve(__dirname, './src/styles'),
      '@assets': path.resolve(__dirname, './src/assets'),
      '@config': path.resolve(__dirname, './src/config'),
    },
  },

  server: SERVER_CONFIG,
  build: BUILD_OPTIMIZATION,
  css: CSS_CONFIG,
  optimizeDeps: DEPENDENCY_OPTIMIZATION,

  esbuild: {
    target: 'es2015',
  },

  assetsInclude: ['**/*.svg', '**/*.csv'],
})

// ----------------------------------------------------------------------
// EXPORT HELPERS
// ----------------------------------------------------------------------
export {
  localeSystemPromise,
  env,
  SERVER_CONFIG,
  BUILD_OPTIMIZATION,
}