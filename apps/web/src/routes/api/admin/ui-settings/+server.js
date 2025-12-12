/**
 * 관리자 UI 설정 조회 API
 * GET /api/admin/ui-settings
 */

import { json } from '@sveltejs/kit';
import { connectDB } from '$lib/server/db.js';
import { Admin } from '$lib/server/models/Admin.js';

export async function GET({ locals }) {
	// 권한 확인
	if (!locals.user || !locals.user.isAdmin) {
		return json({ error: '권한이 없습니다' }, { status: 403 });
	}

	try {
		await connectDB();
		const admin = await Admin.findOne().select('uiSettings').lean();

		return json({
			success: true,
			uiSettings: admin?.uiSettings || {
				enableGradeInfoModal: false
			}
		});
	} catch (error) {
		console.error('[ui-settings GET] 오류:', error);
		return json({ error: error.message }, { status: 500 });
	}
}
