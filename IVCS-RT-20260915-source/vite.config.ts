import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';
import { libraryRouter } from './server/library.mjs';
import {revisionForDate} from './src/appInfo';
import {projectCredits} from './scripts/projectCredits.mjs';

export default defineConfig(() => {
  const {credits,notices}=projectCredits();
  return {
    define:{__IVCS_REVISION__:JSON.stringify(revisionForDate()),__IVCS_CREDITS__:JSON.stringify(credits)},
    plugins: [react(), tailwindcss(), {name:'project-notices',generateBundle(){this.emitFile({type:'asset',fileName:'third-party-notices.txt',source:notices});},configureServer(server){server.middlewares.use('/third-party-notices.txt',(_req,res)=>{res.setHeader('Content-Type','text/plain; charset=utf-8');res.end(notices);});}}, {name:'local-library', configureServer(server) { server.middlewares.use('/api/library', libraryRouter(path.resolve('data'))); }}],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      host: '127.0.0.1',
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {ignored:['**/data/**','**/RadContour-portable/**','**/tests/**','**/library-preview.png']},
    },
  };
});
