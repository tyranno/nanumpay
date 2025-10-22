import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db.js';
import { User } from '$lib/server/models/User.js';
import { UserAccount } from '$lib/server/models/UserAccount.js';
import { PlannerAccount } from '$lib/server/models/PlannerAccount.js';
import { MonthlyRegistrations } from '$lib/server/models/MonthlyRegistrations.js';
import { MonthlyTreeSnapshots } from '$lib/server/models/MonthlyTreeSnapshots.js';
import { WeeklyPaymentPlans } from '$lib/server/models/WeeklyPaymentPlans.js';
import { WeeklyPaymentSummary } from '$lib/server/models/WeeklyPaymentSummary.js';
import bcrypt from 'bcryptjs';

export async function POST({ request, locals }) {
	try {
		// 개발 환경에서만 허용
		if (process.env.NODE_ENV === 'production') {
			return json({ error: '프로덕션 환경에서는 사용할 수 없습니다.' }, { status: 403 });
		}

		// 관리자 권한 확인
		if (!locals.user || locals.user.role !== 'admin') {
			return json({ error: '관리자 권한이 필요합니다.' }, { status: 401 });
		}

		await db();

		console.log('[DB Initialize] 데이터베이스 초기화 시작...');

		// 1. 모든 컬렉션 삭제 (관리자 제외)
		await User.deleteMany({});
		await UserAccount.deleteMany({ role: { $ne: 'admin' } });
		await PlannerAccount.deleteMany({});
		await MonthlyRegistrations.deleteMany({});
		await MonthlyTreeSnapshots.deleteMany({});
		await WeeklyPaymentPlans.deleteMany({});
		await WeeklyPaymentSummary.deleteMany({});

		console.log('[DB Initialize] 모든 데이터 삭제 완료');

		// 2. 기본 관리자 확인 및 생성
		const adminExists = await UserAccount.findOne({ loginId: '관리자' });
		if (!adminExists) {
			const hashedPassword = await bcrypt.hash('admin1234!!', 10);
			await UserAccount.create({
				loginId: '관리자',
				password: hashedPassword,
				name: '시스템 관리자',
				phone: '010-0000-0000',
				role: 'admin'
			});
			console.log('[DB Initialize] 기본 관리자 계정 생성 완료');
		}

		console.log('[DB Initialize] 데이터베이스 초기화 완료');

		return json({
			success: true,
			message: '데이터베이스가 초기화되었습니다.'
		});
	} catch (error) {
		console.error('Initialize database error:', error);
		return json({ error: '데이터베이스 초기화 중 오류가 발생했습니다.' }, { status: 500 });
	}
}