import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    // In dev, send /api calls to the API container published by docker-compose.dev.yml
    proxy: { '/api': 'http://127.0.0.1:3000' },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})