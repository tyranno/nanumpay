import jwt from 'jsonwebtoken';
import { JWT_SECRET, JWT_EXPIRES } from '$env/static/private';
import { redirect } from '@sveltejs/kit';

/** @type {import('@sveltejs/kit').Handle} */
export async function handle({ event, resolve }) {
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
				event.cookies.delete('token', { path: '/' });
				event.locals.user = null;
			}
		}
	}

	// 보호된 경로 체크
	const protectedRoutes = ['/dashboard', '/admin', '/planner'];
	const publicRoutes = ['/login', '/', '/api/auth/login', '/api/auth/refresh'];

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

	// 보호된 페이지에 캐시 방지 헤더 추가 (뒤로가기 시 재인증 강제)
	if (isProtectedRoute) {
		response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
		response.headers.set('Pragma', 'no-cache');
		response.headers.set('Expires', '0');
	}

	return response;
}