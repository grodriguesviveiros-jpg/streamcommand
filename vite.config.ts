import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * STREAM COMMAND — configuração do servidor de desenvolvimento.
 * O frontend (porta 3000) encaminha /api e /uploads para o backend interno,
 * mantendo tudo em uma única origem (sessão por cookie, sem CORS).
 */
const previewMode = process.env.BASE44_PREVIEW_MODE === '1';
const sandboxDomain = process.env.BASE44_SANDBOX_HOST_DOMAIN;
const apiTarget = process.env.API_PROXY_TARGET ?? 'http://api:4000';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 3000,
    strictPort: true,
    allowedHosts:
      previewMode && sandboxDomain
        ? [`.${sandboxDomain}`, 'localhost']
        : true,
    proxy: {
      '/api': { target: apiTarget, changeOrigin: false },
      '/uploads': { target: apiTarget, changeOrigin: false },
    },
    watch: { usePolling: true, interval: 300 },
  },
  preview: { host: '0.0.0.0', port: 3000 },
});
