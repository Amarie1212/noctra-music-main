import { defineConfig } from 'tsup';
import { copyFileSync, mkdirSync } from 'fs';
import { join } from 'path';

export default defineConfig({
  entry: ['electron/main.ts', 'electron/preload.ts'],
  format: ['cjs'],
  external: ['electron', 'better-sqlite3'],
  clean: true,
  outDir: 'dist-electron',
  noExternal: ['@music/core'],
  esbuildPlugins: [
    {
      name: 'copy-tray-menu-html',
      setup(build) {
        build.onEnd(() => {
          try {
            mkdirSync('dist-electron', { recursive: true });
            copyFileSync(
              join('electron', 'tray-menu.html'),
              join('dist-electron', 'tray-menu.html')
            );
          } catch (_) {}
        });
      },
    },
  ],
});
