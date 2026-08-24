import { defineConfig } from 'vite';

// Repo is served at https://kreier.github.io/bank/ — base must match the repo name.
export default defineConfig({
  base: '/bank/',
  build: {
    target: 'es2022',
  },
});
