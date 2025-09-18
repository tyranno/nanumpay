import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db.js';
import { User } from '$lib/server/models/User.js';
import bcrypt from 'bcryptjs';

export async function POST({ request, locals }) {
	// 관리자 권한 확인
	if (!locals.user || !locals.user.isAdmin) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	await db();

	try {
		const { users } = await request.json();

		if (!users || !Array.isArray(users)) {
			return json({ error: '올바른 데이터 형식이 아닙니다.' }, { status: 400 });
		}

		const results = {
			created: 0,
			failed: 0,
			errors: []
		};

		for (const userData of users) {
			try {
				// 엑셀 헤더 매핑
				const name = userData['성명'] || userData.name;
				const phone = userData['연락처'] || userData.phone || '';
				const idNumber = userData['주민번호'] || userData.idNumber || '';
				const branch = userData['소속/지사'] || userData['지사'] || userData.branch || '';
				const bank = userData['은행'] || userData.bank || '';
				const accountNumber = userData['계좌번호'] || userData.accountNumber || '';
				const salesperson = userData['판매인'] || userData.salesperson || '';
				const salespersonPhone = userData['연락처.1'] || userData.salespersonPhone || '';
				const planner = userData['설계사'] || userData.planner || '';
				const plannerPhone = userData['연락처.2'] || userData.plannerPhone || '';
				const insuranceProduct = userData['보험상품명'] || userData.insuranceProduct || '';
				const insuranceCompany = userData['보험회사'] || userData.insuranceCompany || '';

				if (!name) {
					results.failed++;
					results.errors.push(`행 ${results.created + results.failed}: 이름이 없습니다.`);
					continue;
				}

				// 전화번호에서 암호 생성
				const phoneDigits = phone.replace(/[^0-9]/g, '');
				const password = phoneDigits.length >= 4 ? phoneDigits.slice(-4) : '1234';

				// loginId 자동 생성
				let baseLoginId = name.toLowerCase();
				let loginId = baseLoginId;
				let counter = 0;

				while (await User.exists({ loginId })) {
					counter++;
					const suffix = counter <= 26
						? String.fromCharCode(64 + counter)  // A, B, C, ...
						: counter.toString();  // 27, 28, ...
					loginId = baseLoginId + suffix;
				}

				// 판매인으로 부모 찾기
				let parentId = null;
				let position = null;

				if (salesperson) {
					const parentUser = await User.findOne({ name: salesperson });
					if (parentUser) {
						const leftChild = await User.findOne({
							parentId: parentUser._id,
							position: 'L'
						});
						const rightChild = await User.findOne({
							parentId: parentUser._id,
							position: 'R'
						});

						if (!leftChild) {
							parentId = parentUser._id;
							position = 'L';
						} else if (!rightChild) {
							parentId = parentUser._id;
							position = 'R';
						}
						// 둘 다 있으면 부모 설정하지 않음 (수동 배치 필요)
					}
				}

				// 비밀번호 해싱
				const passwordHash = await bcrypt.hash(password, 10);

				// 사용자 생성
				const newUser = new User({
					name,
					loginId,
					passwordHash,
					phone,
					idNumber,
					branch,
					bank,
					accountNumber,
					salesperson,
					salespersonPhone,
					planner,
					plannerPhone,
					insuranceProduct,
					insuranceCompany,
					parentId,
					position,
					rootAdminId: locals.user.id
				});

				const savedUser = await newUser.save();

				// 부모 노드 업데이트
				if (parentId) {
					const updateField = position === 'L' ? 'leftChildId' : 'rightChildId';
					await User.findByIdAndUpdate(parentId, {
						[updateField]: savedUser._id
					});
				}

				results.created++;
				console.log(`사용자 등록: ${name} (ID: ${loginId}, 암호: ${password})`);

			} catch (error) {
				results.failed++;
				results.errors.push(`행 ${results.created + results.failed}: ${error.message}`);
			}
		}

		return json({
			success: true,
			created: results.created,
			failed: results.failed,
			errors: results.errors,
			message: `${results.created}명 등록 완료, ${results.failed}명 실패`
		});

	} catch (error) {
		console.error('Bulk user registration error:', error);
		return json({ error: '일괄 등록 중 오류가 발생했습니다.' }, { status: 500 });
	}
}