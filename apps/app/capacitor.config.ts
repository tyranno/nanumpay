import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.nanumpay.app',
  appName: 'NanumPay',
  webDir: 'www',
  server: {
    androidScheme: 'https'
  }
};

export default config;