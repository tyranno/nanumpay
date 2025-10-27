import { CONNECTION_TIMEOUT } from './config.js';

/**
 * Health Check API를 통해 서버 연결 가능 여부 확인
 * @param {string} url - 체크할 서버 URL
 * @returns {Promise<{success: boolean, url: string, error?: string, data?: any}>}
 */
export async function checkServerConnection(url) {
	try {
		// URL 형식 검증
		const serverUrl = new URL(url);

		// Health Check API 엔드포인트
		const healthCheckUrl = new URL('/api/health', serverUrl);

		// fetch로 서버 응답 확인 (타임아웃 설정)
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), CONNECTION_TIMEOUT);

		try {
			const response = await fetch(healthCheckUrl.toString(), {
				method: 'GET',
				signal: controller.signal,
				headers: {
					'Accept': 'application/json'
				}
			});

			clearTimeout(timeoutId);

			if (response.ok) {
				const data = await response.json();

				// Health Check API 응답 검증
				if (data.status === 'ok') {
					return {
						success: true,
						url: serverUrl.toString(),
						data
					};
				}
			}

			return {
				success: false,
				url: serverUrl.toString(),
				error: `서버 응답 오류 (${response.status})`
			};

		} catch (fetchError) {
			clearTimeout(timeoutId);

			if (fetchError.name === 'AbortError') {
				return {
					success: false,
					url: serverUrl.toString(),
					error: '서버 응답 시간 초과'
				};
			}

			return {
				success: false,
				url: serverUrl.toString(),
				error: '서버에 연결할 수 없습니다'
			};
		}
	} catch (error) {
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
