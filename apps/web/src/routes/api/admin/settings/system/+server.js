import { json } from '@sveltejs/kit';
import { Admin } from '$lib/server/models/Admin.js';

// PUT: 시스템 설정 저장
export async function PUT({ request, locals }) {
	try {
		// 관리자 권한 확인
		if (!locals.user || !locals.user.isAdmin) {
			return json({ success: false, message: '관리자 권한이 필요합니다.' }, { status: 401 });
		}

		const adminId = locals.user.id;
		const { maintenanceMode, backup } = await request.json();

		// 백업 설정 유효성 검사
		if (backup) {
			if (backup.frequency && !['daily', 'weekly', 'monthly'].includes(backup.frequency)) {
				return json({ success: false, message: '올바른 백업 주기를 선택해주세요.' }, { status: 400 });
			}
			if (backup.dayOfWeek !== undefined && (backup.dayOfWeek < 0 || backup.dayOfWeek > 6)) {
				return json({ success: false, message: '올바른 요일을 선택해주세요.' }, { status: 400 });
			}
			if (backup.dayOfMonth !== undefined && (backup.dayOfMonth < 1 || backup.dayOfMonth > 31)) {
				return json({ success: false, message: '올바른 일자를 선택해주세요.' }, { status: 400 });
			}
		}

		// 관리자 정보 업데이트
		const updatedAdmin = await Admin.findByIdAndUpdate(
			adminId,
			{
				systemSettings: {
					maintenanceMode: maintenanceMode !== undefined ? maintenanceMode : false,
					backup: backup || {
						enabled: true,
						frequency: 'daily',
						time: '02:00',
						dayOfWeek: 0,
						dayOfMonth: 1
					}
				}
			},
			{ new: true, runValidators: true }
		);

		if (!updatedAdmin) {
			return json({ success: false, message: '관리자를 찾을 수 없습니다.' }, { status: 404 });
		}

		return json({
			success: true,
			message: '시스템 설정이 저장되었습니다.',
			systemSettings: updatedAdmin.systemSettings
		});
	} catch (error) {
		console.error('❌ Error updating system settings:', error);
		return json(
			{ success: false, message: '시스템 설정 저장에 실패했습니다.' },
			{ status: 500 }
		);
	}
}
