import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.nanumpay.app',
  appName: 'NanumPay',
  webDir: 'build',
  server: {
    // HTTPS 사용 (프로덕션 환경)
    androidScheme: 'https',
    // 외부 URL로 앱 로드
    url: 'https://www.nanumasset.com',
    // 외부 네트워크 접근 허용
    allowNavigation: ['https://www.nanumasset.com/*', 'https://www.nanumpay.xyz/*']
  }
};

export default config;