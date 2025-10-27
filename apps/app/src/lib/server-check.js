import { CONNECTION_TIMEOUT } from './config.js';

/**
 * Health Check API를 통해 서버 연결 가능 여부 확인
 * @param {string} url - 체크할 서버 URL
 * @returns {Promise<{success: boolean, url: string, error?: string, data?: any}>}
 */
export async function checkServerConnection(url) {
	console.log('[Health Check] 시작:', url);
	try {
		// URL 형식 검증
		const serverUrl = new URL(url);
		console.log('[Health Check] URL 파싱 성공:', serverUrl.toString());

		// Health Check API 엔드포인트
		const healthCheckUrl = new URL('/api/health', serverUrl);
		console.log('[Health Check] API URL:', healthCheckUrl.toString());

		// fetch로 서버 응답 확인 (타임아웃 설정)
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), CONNECTION_TIMEOUT);

		try {
			console.log('[Health Check] fetch 시작...');
			const response = await fetch(healthCheckUrl.toString(), {
				method: 'GET',
				signal: controller.signal,
				headers: {
					'Accept': 'application/json'
				}
			});

			clearTimeout(timeoutId);
			console.log('[Health Check] 응답 받음:', response.status, response.ok);

			if (response.ok) {
				const data = await response.json();
				console.log('[Health Check] 응답 데이터:', data);

				// Health Check API 응답 검증
				if (data.status === 'ok') {
					console.log('[Health Check] 성공!');
					return {
						success: true,
						url: serverUrl.toString(),
						data
					};
				}
			}

			console.log('[Health Check] 실패: 응답 오류');
			return {
				success: false,
				url: serverUrl.toString(),
				error: `서버 응답 오류 (${response.status})`
			};

		} catch (fetchError) {
			clearTimeout(timeoutId);
			console.error('[Health Check] fetch 에러:', fetchError);
			console.error('[Health Check] 에러 이름:', fetchError.name);
			console.error('[Health Check] 에러 메시지:', fetchError.message);
			console.error('[Health Check] 에러 타입:', typeof fetchError);

			if (fetchError.name === 'AbortError') {
				console.log('[Health Check] 실패: 타임아웃');
				return {
					success: false,
					url: serverUrl.toString(),
					error: '서버 응답 시간 초과 (10초)'
				};
			}

			// 더 자세한 에러 정보 수집
			const errorDetails = {
				name: fetchError.name || 'Unknown',
				message: fetchError.message || '알 수 없는 오류',
				type: fetchError.constructor?.name || typeof fetchError
			};

			console.log('[Health Check] 실패: 연결 불가', errorDetails);
			return {
				success: false,
				url: serverUrl.toString(),
				error: `연결 실패 [${errorDetails.name}]: ${errorDetails.message}`
			};
		}
	} catch (error) {
		console.error('[Health Check] URL 파싱 에러:', error);
		return {
			success: false,
			url,
			error: '올바르지 않은 URL 형식입니다'
		};
	}
}

/**
 * 서버가 정상적인 웹 페이지를 반환하는지 확인
 * (iframe 로드 시뮬레이션)
 * @param {string} url
 * @returns {Promise<boolean>}
 */
export async function canLoadInIframe(url) {
	return new Promise((resolve) => {
		const iframe = document.createElement('iframe');
		iframe.style.display = 'none';
		iframe.src = url;

		let resolved = false;

		const timeout = setTimeout(() => {
			if (!resolved) {
				resolved = true;
				document.body.removeChild(iframe);
				resolve(false);
			}
		}, CONNECTION_TIMEOUT);

		iframe.onload = () => {
			if (!resolved) {
				resolved = true;
				clearTimeout(timeout);
				document.body.removeChild(iframe);
				resolve(true);
			}
		};

		iframe.onerror = () => {
			if (!resolved) {
				resolved = true;
				clearTimeout(timeout);
				document.body.removeChild(iframe);
				resolve(false);
			}
		};

		document.body.appendChild(iframe);
	});
}
