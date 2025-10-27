/**
 * 앱 기본 설정
 */

// 기본 서버 URL (환경에 따라 변경)
export const DEFAULT_SERVER_URL = import.meta.env.VITE_DEFAULT_SERVER_URL || 'http://localhost:3100';

// 서버 연결 타임아웃 (ms)
export const CONNECTION_TIMEOUT = 5000;

// 앱 정보
export const APP_INFO = {
	name: 'NanumPay',
	version: '0.0.1'
};
