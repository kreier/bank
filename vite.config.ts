import { defineConfig } from 'vite';

// Repo is served at https://kreier.github.io/bank/ — base must match the repo
// name for the production build. In dev, base is '/' so `npm run dev` serves
// at plain http://localhost:5173/ instead of requiring /bank/ in the URL.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/bank/' : '/',
  build: {
    target: 'es2022',
  },
}));
