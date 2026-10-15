import { resolve } from 'node:path';
import { defineConfig } from 'vite';

// BASE_PATH: "/marmaapps-static/" na tymczasowym adresie GitHub Pages, "/" po podpięciu domeny.
export default defineConfig({
  base: process.env.BASE_PATH || '/',
  build: {
    rolldownOptions: {
      // Strony aplikacji (multi-page).
      input: {
        index: resolve(import.meta.dirname, 'index.html'),
        points: resolve(import.meta.dirname, 'points.html'),
        login: resolve(import.meta.dirname, 'login.html'),
      },
    },
  },
});
