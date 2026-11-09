import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';
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

// npm run dev:xr  → 같은 Wi-Fi 의 헤드셋에서 열 수 있게 네트워크에 열고, 자체 서명 https 를 켠다
//                   (WebXR 과 마이크는 보안 연결에서만 동작한다. USB 라면 adb reverse 후 http://localhost 로도 된다)
export default defineConfig(({ mode }) => ({
  plugins: [react(), studio(), ...(mode === 'xr' ? [basicSsl()] : [])],
  server: {
    port: 5173,
    host: mode === 'xr' ? true : undefined,
    // 에이전트가 studio/ 파일을 고칠 때마다 페이지가 통째로 새로고침되지 않게 한다.
    watch: { ignored: ['**/studio/**'] },
  },
  build: {
    rollupOptions: { input: { main: 'index.html', xr: 'xr.html' } },
  },
}));
