import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Relative base so a `dist/` folder can be dropped at any path (or opened from a
// USB stick served by `bunx serve`) without rebuilding.
export default defineConfig({
  base: './',
  // 打包产物放 static/，让 dist/assets/ 只留组织者自己放的视频和 clips.json
  build: { assetsDir: 'static' },
  define: { __PORTABLE__: 'false' },
  plugins: [react()],
  server: { host: true },
  preview: { host: true },
})
