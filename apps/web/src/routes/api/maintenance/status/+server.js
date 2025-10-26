import { json } from '@sveltejs/kit';
import { Admin } from '$lib/server/models/Admin.js';
import { connectDB } from '$lib/server/db.js';

/**
 * 유지보수 모드 상태 조회 (공개 API)
 */
export async function GET() {
	try {
		await connectDB();

		// 첫 번째 관리자 계정의 시스템 설정 조회
		const admin = await Admin.findOne().select('systemSettings.maintenanceMode');

		return json({
			maintenanceMode: admin?.systemSettings?.maintenanceMode || false
		});
	} catch (error) {
		console.error('[Maintenance] 상태 조회 오류:', error);
		return json({
			maintenanceMode: false
		});
	}
}
