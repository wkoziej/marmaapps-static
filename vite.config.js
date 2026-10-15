import { defineConfig } from 'vite';

// BASE_PATH: "/marmaapps-static/" na tymczasowym adresie GitHub Pages, "/" po podpięciu domeny.
export default defineConfig({
  base: process.env.BASE_PATH || '/',
});
