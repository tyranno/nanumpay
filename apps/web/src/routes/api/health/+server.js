import { json } from '@sveltejs/kit';

/**
 * Health Check API
 * 앱에서 서버 연결 상태를 확인하기 위한 엔드포인트
 * @type {import('./$types').RequestHandler}
 */
export async function GET() {
	return json({
		status: 'ok',
		timestamp: new Date().toISOString(),
		service: 'nanumpay-web'
	});
}
