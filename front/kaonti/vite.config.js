// import { defineConfig } from 'vite'
// import react from '@vitejs/plugin-react'

// // https://vitejs.dev/config/
// export default defineConfig({
//   plugins: [react()],
//   base: "/"
// })

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    // Repart d'un pré-bundling propre à chaque `npm run dev` :
    // évite l'erreur "chunk-XXXX.js does not exist" après un switch de branche.
    force: true,
    include: ['@mui/material/Tooltip', '@emotion/styled'],
  },
  base: "/",
  define: {
    'process.env': {},
  },
})