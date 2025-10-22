import { db } from '$lib/server/db.js';
import MonthlyRegistrations from '$lib/server/models/MonthlyRegistrations.js';
import WeeklyPaymentPlans from '$lib/server/models/WeeklyPaymentPlans.js';
import UserAccount from '$lib/server/models/UserAccount.js';
import User from '$lib/server/models/User.js';
import PlannerAccount from '$lib/server/models/PlannerAccount.js';

export async function load({ locals }) {
	// 개발 환경 확인
	const isDevelopment = process.env.NODE_ENV !== 'production';

	// 개발 환경일 때만 월별 등록 데이터 조회
	let monthlyRegistrations = [];
	if (isDevelopment) {
		try {
			await db();
			monthlyRegistrations = await MonthlyRegistrations.find({})
				.sort({ monthKey: -1 })
				.limit(12)
				.lean();
		} catch (error) {
			console.error('Failed to fetch monthly registrations:', error);
		}
	}

	return {
		isDevelopment,
		monthlyRegistrations: monthlyRegistrations.map(m => ({
			monthKey: m.monthKey,
			registrationCount: m.registrationCount || 0
		}))
	};
}