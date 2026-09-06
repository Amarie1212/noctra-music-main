import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.noctra.music',
  appName: 'NOCTRA',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    cleartext: false,
  },
};

export default config;
