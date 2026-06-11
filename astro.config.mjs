// @ts-check
import { defineConfig } from 'astro/config';

// Static site (default). The stack detector runs as a Netlify function in
// netlify/functions, so no Astro adapter is needed.
export default defineConfig({
  site: 'https://lilstack.netlify.app',
});
