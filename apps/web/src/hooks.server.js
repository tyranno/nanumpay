import jwt from 'jsonwebtoken';
import { JWT_SECRET, JWT_EXPIRES } from '$env/static/private';
import { redirect } from '@sveltejs/kit';

export async function handle({ event, resolve }) {
	const token = event.cookies.get('token');
	const refreshToken = event.cookies.get('refreshToken');

	if (token) {
		try {
			const user = jwt.verify(token, JWT_SECRET);
			// Admin 여부를 명확히 표시
			event.locals.user = {
				...user,
				isAdmin: user.type === 'admin'
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

					// 새 토큰 쿠키 설정
					event.cookies.set('token', newToken, {
						httpOnly: true,
						secure: process.env.NODE_ENV === 'production',
						sameSite: 'strict',
						maxAge: 60 * 60, // 1시간
						path: '/'
					});

					const verifiedUser = jwt.verify(newToken, JWT_SECRET);
					event.locals.user = {
						...verifiedUser,
						isAdmin: verifiedUser.type === 'admin'
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
	const protectedRoutes = ['/dashboard', '/admin'];
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

	// 이미 로그인한 사용자가 로그인 페이지에 접근하려는 경우
	if (event.url.pathname === '/login' && event.locals.user) {
		const redirectTo = event.locals.user.type === 'admin' ? '/admin' : '/dashboard';
		throw redirect(302, redirectTo);
	}

	const response = await resolve(event);
	return response;
}