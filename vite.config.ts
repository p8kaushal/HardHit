import { defineConfig } from 'vite';

export default defineConfig({
  // Avoid a development-server reload when the tracker is first enabled.
  optimizeDeps: { include: ['@mediapipe/tasks-vision'] },
  server: {
    port: 3000,
    open: true
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          babylon: ['babylonjs']
        }
      }
    }
  }
});
