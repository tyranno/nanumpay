import jwt from 'jsonwebtoken';
import { JWT_SECRET, JWT_EXPIRES } from '$env/static/private';
import { redirect } from '@sveltejs/kit';
import { Admin } from '$lib/server/models/Admin.js';
import { connectDB } from '$lib/server/db.js';
import logger from '$lib/server/logger.js';

/** @type {import('@sveltejs/kit').Handle} */
export async function handle({ event, resolve }) {
	const startTime = Date.now();
	const { pathname } = event.url;
	const method = event.request.method;

	// 선택적 로깅: 로그인 및 용역자 등록만 로그 남기기
	const shouldLog =
		pathname.includes('/api/auth/login') || // 로그인
		pathname.includes('/api/planner/login') || // 설계사 로그인
		pathname.includes('/api/admin/login') || // 관리자 로그인
		pathname.includes('/api/admin/users/bulk') || // 용역자 대량 등록
		pathname.includes('/api/admin/registration'); // 용역자 등록 관련

	if (shouldLog) {
		logger.info(`[${method}] ${pathname} 요청 시작`);
	}

	// 로그인 페이지 접근 시 모든 인증 정보 강제 삭제 (보안 강화)
	if (event.url.pathname === '/login') {
		event.cookies.delete('token', {
			path: '/',
			httpOnly: true,
			secure: process.env.NODE_ENV === 'production',
			sameSite: 'strict'
		});
		event.cookies.delete('refreshToken', {
			path: '/',
			httpOnly: true,
			secure: process.env.NODE_ENV === 'production',
			sameSite: 'strict'
		});
		event.locals.user = null;
	}

	// JWT 인증 처리
	const token = event.cookies.get('token');
	const refreshToken = event.cookies.get('refreshToken');

	if (token) {
		try {
			const user = jwt.verify(token, JWT_SECRET);
			// Admin 여부를 명확히 표시
			event.locals.user = {
				...user,
				isAdmin: user.type === 'admin',
				accountType: user.type // v8.0: accountType 추가
			};
		} catch (err) {
			// 토큰이 만료된 경우
			if (err.name === 'TokenExpiredError' && refreshToken) {
				try {
					// 리프레시 토큰 검증
					const decoded = jwt.verify(refreshToken, JWT_SECRET);

					// 새 액세스 토큰 생성
					const newToken = jwt.sign(
						{
							id: decoded.id,
							loginId: decoded.loginId,
							name: decoded.name,
							type: decoded.type
						},
						JWT_SECRET,
						{ expiresIn: JWT_EXPIRES || '1h' }
					);

					// 새 토큰 세션 쿠키로 설정 (브라우저 종료 시 자동 삭제)
					event.cookies.set('token', newToken, {
						httpOnly: true,
						secure: process.env.NODE_ENV === 'production',
						sameSite: 'strict',
						path: '/'
						// maxAge 제거 → 세션 쿠키
					});

					const verifiedUser = jwt.verify(newToken, JWT_SECRET);
					event.locals.user = {
						...verifiedUser,
						isAdmin: verifiedUser.type === 'admin',
						accountType: verifiedUser.type // v8.0: accountType 추가
					};
				} catch (refreshErr) {
					// 리프레시 토큰도 유효하지 않은 경우
					event.cookies.delete('token', { path: '/' });
					event.cookies.delete('refreshToken', { path: '/' });
					event.locals.user = null;
				}
			} else {
				// 리프레시 토큰이 없거나 다른 에러인 경우
				// SSR 시에는 토큰을 바로 삭제하지 않고 user만 null로 설정
				// 클라이언트에서 판단하도록 함
				event.locals.user = null;
			}
		}
	}

	// 유지보수 모드 체크
	if (event.url.pathname !== '/maintenance' &&
	    !event.url.pathname.startsWith('/api/maintenance/status') &&
	    !event.url.pathname.startsWith('/api/auth/') &&
	    event.url.pathname !== '/login') {
		try {
			await connectDB();
			const admin = await Admin.findOne().select('systemSettings.maintenanceMode');
			const isMaintenanceMode = admin?.systemSettings?.maintenanceMode || false;

			if (isMaintenanceMode) {
				// 관리자가 아니면 유지보수 페이지로 리다이렉트
				if (event.locals.user?.type !== 'admin') {
					throw redirect(302, '/maintenance');
				}
			}
		} catch (error) {
			// DB 연결 오류 등은 무시하고 계속 진행
			if (error.status === 302) throw error;
			console.error('[Hooks] 유지보수 모드 체크 오류:', error);
		}
	}

	// 보호된 경로 체크
	const protectedRoutes = ['/dashboard', '/admin', '/planner'];
	const publicRoutes = ['/login', '/', '/api/auth/login', '/api/auth/refresh', '/maintenance', '/api/maintenance/status'];

	const isProtectedRoute = protectedRoutes.some(route => event.url.pathname.startsWith(route));
	const isPublicRoute = publicRoutes.some(route => event.url.pathname.startsWith(route));

	// API 경로는 별도 처리
	if (event.url.pathname.startsWith('/api/')) {
		// API 인증 체크는 각 엔드포인트에서 처리
		const response = await resolve(event);
		return response;
	}

	// 인증이 필요한 경로에 미인증 사용자가 접근하려는 경우
	if (isProtectedRoute && !event.locals.user) {
		throw redirect(302, '/login');
	}

	// 관리자 경로에 일반 사용자가 접근하려는 경우
	if (event.url.pathname.startsWith('/admin') && event.locals.user?.type !== 'admin') {
		throw redirect(302, '/dashboard');
	}

	// 일반 사용자 경로에 관리자가 접근하려는 경우
	if (event.url.pathname.startsWith('/dashboard') && event.locals.user?.type === 'admin') {
		throw redirect(302, '/admin');
	}

	// 로그인 페이지는 항상 접근 허용 (위에서 이미 쿠키 삭제됨)

	const response = await resolve(event);

	// 선택적 로깅: 응답 시간 및 상태 코드 로그
	if (shouldLog) {
		const duration = Date.now() - startTime;
		logger.info(`[${method}] ${pathname} 완료 - ${response.status} (${duration}ms)`);
	}

	// 캐시 방지 헤더 제거 - SSR 문제 유발
	// 필요하면 특정 페이지에서만 적용

	return response;
}

/** @type {import('@sveltejs/kit').HandleFetch} */
export async function handleFetch({ request, fetch, event }) {
	// SSR 시 컴포넌트의 fetch에서도 쿠키가 전달되도록 보장
	if (request.url.startsWith(event.url.origin)) {
		// 같은 오리진의 요청인 경우 쿠키 헤더 복사
		const cookie = event.request.headers.get('cookie');
		if (cookie) {
			// Request 객체는 immutable이므로 새로 생성해야 함
			request = new Request(request, {
				headers: {
					...Object.fromEntries(request.headers.entries()),
					cookie: cookie
				}
			});
		}
	}

	return fetch(request);
}