import { json } from '@sveltejs/kit';
import { Admin } from '$lib/server/models/Admin.js';

// GET: 관리자 정보 조회
export async function GET({ locals }) {
	try {
		// 관리자 권한 확인
		if (!locals.user || !locals.user.isAdmin) {
			return json({ success: false, message: '관리자 권한이 필요합니다.' }, { status: 401 });
		}

		const adminId = locals.user.id;

		// 관리자 정보 조회
		const admin = await Admin.findById(adminId).select('-passwordHash').lean();

		if (!admin) {
			return json({ success: false, message: '관리자를 찾을 수 없습니다.' }, { status: 404 });
		}

		return json({
			success: true,
			admin: {
				name: admin.name || '',
				loginId: admin.loginId || '',
				email: admin.email || '',
				phone: admin.phone || '',
				permissions: admin.permissions || []
			},
			systemSettings: admin.systemSettings || {
				maintenanceMode: false,
				backup: {
					enabled: true,
					frequency: 'daily',
					time: '02:00',
					dayOfWeek: 0,
					dayOfMonth: 1,
					retention: {
						count: 7,
						days: 30,
						compress: true
					},
					storage: {
						type: 'ftp',
						s3: {
							region: 'ap-northeast-2',
							bucket: '',
							accessKeyId: '',
							secretAccessKey: '',
							prefix: 'nanumpay-backup/'
						},
						ftp: {
							host: '',
							port: 21,
							username: '',
							password: '',
							remotePath: '/backup/nanumpay',
							secure: false
						}
					}
				}
			}
		});
	} catch (error) {
		console.error('❌ Error fetching admin info:', error);
		return json(
			{ success: false, message: '관리자 정보를 불러오는데 실패했습니다.' },
			{ status: 500 }
		);
	}
}

// PUT: 관리자 정보 수정
export async function PUT({ request, locals }) {
	try {
		// 관리자 권한 확인
		if (!locals.user || !locals.user.isAdmin) {
			return json({ success: false, message: '관리자 권한이 필요합니다.' }, { status: 401 });
		}

		const adminId = locals.user.id;
		const { name, email, phone } = await request.json();

		// 유효성 검사
		if (!name || name.trim() === '') {
			return json({ success: false, message: '이름을 입력해주세요.' }, { status: 400 });
		}

		// 관리자 정보 업데이트
		const updatedAdmin = await Admin.findByIdAndUpdate(
			adminId,
			{
				name: name.trim(),
				email: email?.trim() || '',
				phone: phone?.trim() || ''
			},
			{ new: true, runValidators: true }
		).select('-passwordHash');

		if (!updatedAdmin) {
			return json({ success: false, message: '관리자를 찾을 수 없습니다.' }, { status: 404 });
		}

		return json({
			success: true,
			message: '관리자 정보가 저장되었습니다.',
			admin: {
				name: updatedAdmin.name,
				loginId: updatedAdmin.loginId,
				email: updatedAdmin.email || '',
				phone: updatedAdmin.phone || '',
				permissions: updatedAdmin.permissions || []
			}
		});
	} catch (error) {
		console.error('❌ Error updating admin info:', error);
		return json(
			{ success: false, message: '관리자 정보 저장에 실패했습니다.' },
			{ status: 500 }
		);
	}
}
