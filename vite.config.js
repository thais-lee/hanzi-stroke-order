import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 1600, // tăng giới hạn cảnh báo kích thước gói từ 500KB lên 1600KB
  },
});
