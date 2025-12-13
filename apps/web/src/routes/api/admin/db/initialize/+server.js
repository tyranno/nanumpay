import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db.js';
import User from '$lib/server/models/User.js';
import UserAccount from '$lib/server/models/UserAccount.js';
import PlannerAccount from '$lib/server/models/PlannerAccount.js';
import PlannerCommission from '$lib/server/models/PlannerCommission.js';
import PlannerCommissionPlan from '$lib/server/models/PlannerCommissionPlan.js';
import MonthlyRegistrations from '$lib/server/models/MonthlyRegistrations.js';
import WeeklyPaymentPlans from '$lib/server/models/WeeklyPaymentPlans.js';
import UploadHistory from '$lib/server/models/UploadHistory.js';
import bcrypt from 'bcryptjs';
import fs from 'fs/promises';
import path from 'path';

export async function POST({ request, locals }) {
	try {
		// 개발 환경에서만 허용
		if (process.env.NODE_ENV === 'production') {
			return json({ error: '프로덕션 환경에서는 사용할 수 없습니다.' }, { status: 403 });
		}

		// 관리자 권한 확인
		if (!locals.user || locals.user.type !== 'admin') {
			return json({ error: '관리자 권한이 필요합니다.' }, { status: 401 });
		}

		await db();

		console.log('[DB Initialize] 데이터베이스 초기화 시작...');

		// 1. 모든 컬렉션 삭제 (관리자 제외)
		await User.deleteMany({});
		await UserAccount.deleteMany({ role: { $ne: 'admin' } });
		await PlannerAccount.deleteMany({});
		await PlannerCommission.deleteMany({});
		await PlannerCommissionPlan.deleteMany({});
		await MonthlyRegistrations.deleteMany({});
		await WeeklyPaymentPlans.deleteMany({});
		await UploadHistory.deleteMany({});

		console.log('[DB Initialize] 모든 데이터 삭제 완료');

		// 2. uploads 폴더 삭제
		const uploadsDir = path.resolve('uploads');
		try {
			const files = await fs.readdir(uploadsDir);
			for (const file of files) {
				await fs.unlink(path.join(uploadsDir, file));
			}
			console.log('[DB Initialize] uploads 폴더 삭제 완료');
		} catch (err) {
			// 폴더가 없으면 무시
			if (err.code !== 'ENOENT') {
				console.warn('[DB Initialize] uploads 폴더 삭제 실패:', err.message);
			}
		}

		// v8.0: Admin 컬렉션은 db_init.sh에서 별도 관리
		// UserAccount에 관리자 생성하지 않음

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