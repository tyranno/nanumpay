import { json } from '@sveltejs/kit';
import { connectDB } from '$lib/server/db.js';
import MonthlyRegistrations from '$lib/server/models/MonthlyRegistrations.js';

/**
 * 월별 등록 목록 조회 API
 * GET /api/admin/db/monthly-registrations
 */
export async function GET() {
	try {
		await connectDB();

		const monthlyRegistrations = await MonthlyRegistrations.find({})
			.sort({ monthKey: -1 })
			.limit(24)
			.lean();

		return json({
			success: true,
			monthlyRegistrations: monthlyRegistrations.map(m => ({
				monthKey: m.monthKey,
				registrationCount: m.registrationCount || 0
			}))
		});
	} catch (error) {
		console.error('Failed to fetch monthly registrations:', error);
		return json({
			success: false,
			error: error.message
		}, { status: 500 });
	}
}
