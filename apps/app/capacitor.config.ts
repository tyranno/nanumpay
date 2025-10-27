import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.nanumpay.app',
  appName: 'NanumPay',
  webDir: 'build',
  server: {
    // HTTP 허용 (개발 환경)
    androidScheme: 'http',
    // cleartext HTTP 트래픽 허용
    cleartext: true,
    // 외부 네트워크 접근 허용
    allowNavigation: ['*']
  }
};

export default config;