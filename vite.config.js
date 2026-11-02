import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { studioApi } from './server/api.mjs';

const studio = () => ({
  name: 'studio-api',
  configureServer(server) {
    server.middlewares.use(studioApi(server.config.root));
  },
  configurePreviewServer(server) {
    server.middlewares.use(studioApi(server.config.root));
  },
});

export default defineConfig({
  plugins: [react(), studio()],
  server: {
    port: 5173,
    // 에이전트가 studio/ 파일을 고칠 때마다 페이지가 통째로 새로고침되지 않게 한다.
    watch: { ignored: ['**/studio/**'] },
  },
});
