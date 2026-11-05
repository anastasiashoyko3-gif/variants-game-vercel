import { defineConfig } from 'vite';
import { resolve } from 'path';
export default defineConfig({
  build:{rollupOptions:{input:{
    main:resolve(__dirname,'index.html'),
    admin:resolve(__dirname,'admin.html'),
    game:resolve(__dirname,'game.html'),
    viewer:resolve(__dirname,'viewer.html'),
    teamSetup:resolve(__dirname,'team-game-setup.html'),
    teamLive:resolve(__dirname,'team-game-live.html'),
    teamAdminPreview:resolve(__dirname,'team-game-admin-preview.html'),
    teamViewerPreview:resolve(__dirname,'team-game-preview.html')
  }}}
});
