import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rolldownOptions: {
      output: {
        manualChunks(id: string) {
          if (id.includes('node_modules/react-dom') || id.includes('node_modules/react/') || id.includes('node_modules/react-router')) {
            return 'react-vendor'
          }
          if (id.includes('node_modules/recharts') || id.includes('node_modules/d3')) {
            return 'chart-vendor'
          }
          if (id.includes('node_modules/react-markdown') || id.includes('node_modules/remark') || id.includes('node_modules/react-syntax-highlighter')) {
            return 'markdown-vendor'
          }
          if (id.includes('node_modules/lucide-react')) {
            return 'ui-vendor'
          }
        },
      },
    },
  },
})
