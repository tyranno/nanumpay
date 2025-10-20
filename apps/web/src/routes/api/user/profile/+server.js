import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db.js';
import User from '$lib/server/models/User.js';

export async function GET({ locals }) {
	if (!locals.user || locals.user.type !== 'user') {
		return json({ message: '권한이 없습니다.' }, { status: 401 });
	}

	await db();

	try {
		// ⭐ v8.0: primaryUserId 사용 (User._id)
		const userId = locals.user.primaryUserId || locals.user.id;

		// ⭐ v8.0: 첫 번째 등록(registrationNumber=1) 조회 - 설계사 정보용
		const userAccountIdFromJWT = locals.user.id; // UserAccount._id
		const firstRegistration = await User.findOne({ 
			userAccountId: userAccountIdFromJWT, 
			registrationNumber: 1 
		})
			.populate('plannerAccountId', 'name phone')
			.select('plannerAccountId')
			.lean();

		// ⭐ v8.0: User 조회 + UserAccount populate
		const user = await User.findById(userId)
			.populate('userAccountId', 'loginId phone bank accountNumber idNumber') // ⭐ UserAccount 필드들
			.select('name insuranceCompany insuranceProduct branch salesperson salespersonPhone grade insuranceActive')
			.lean();

		// ⭐ v8.0: 최고 등급 찾기
		const allUsers = await User.find({ userAccountId: user.userAccountId._id })
			.select('grade')
			.lean();
		
		const gradeOrder = { F1: 1, F2: 2, F3: 3, F4: 4, F5: 5, F6: 6, F7: 7, F8: 8 };
		const highestGrade = allUsers.reduce((highest, u) => {
			if (!highest || gradeOrder[u.grade] > gradeOrder[highest]) {
				return u.grade;
			}
			return highest;
		}, null) || user.grade;

	if (!user) {
		return json({ message: '사용자를 찾을 수 없습니다.' }, { status: 404 });
	}

	// ⭐ v8.0: UserAccount에서 필드들 가져오기
	const loginId = user.userAccountId?.loginId || '';
	const phone = user.userAccountId?.phone || '';
	const bank = user.userAccountId?.bank || '';
	const accountNumber = user.userAccountId?.accountNumber || '';
	const idNumber = user.userAccountId?.idNumber || '';

	// ⭐ v8.0: 첫 번째 등록에서 설계사 정보 가져오기
	const planner = firstRegistration?.plannerAccountId?.name || '';
	const plannerPhone = firstRegistration?.plannerAccountId?.phone || '';

	return json({
		success: true,
		profile: {
			name: user.name || '',
			loginId: loginId,
			phone: phone,
			bank: bank,
			accountNumber: accountNumber,
			idNumber: idNumber || '-', // ⭐ 주민번호 그대로 표시
			insuranceCompany: user.insuranceCompany || '',
			insuranceProduct: user.insuranceProduct || '',
			branch: user.branch || '',
			planner: planner, // ⭐ 첫 번째 등록의 설계사
			plannerPhone: plannerPhone, // ⭐ 첫 번째 등록의 설계사 연락처
			salesperson: user.salesperson || '',
			salespersonPhone: user.salespersonPhone || '',
			grade: highestGrade, // ⭐ 최고 등급
			insuranceActive: user.insuranceActive || false
		}
	});
	} catch (error) {
		console.error('❌ Profile GET error:', error);
		return json({ message: '프로필 조회 실패: ' + error.message }, { status: 500 });
	}
}

export async function PUT({ locals, request }) {
	if (!locals.user || locals.user.type !== 'user') {
		return json({ message: '권한이 없습니다.' }, { status: 401 });
	}

	await db();

	// ⭐ v8.0: primaryUserId 사용 (User._id)
	const userId = locals.user.primaryUserId || locals.user.id;
	const body = await request.json();

	try {
		// ⭐ v8.0: User 조회 (userAccountId 확인용)
		const user = await User.findById(userId).populate('userAccountId').lean();

		if (!user) {
			return json({ message: '사용자를 찾을 수 없습니다.' }, { status: 404 });
		}

		// ⭐ v8.0: UserAccount 모델 import
		const { default: UserAccount } = await import('$lib/server/models/UserAccount.js');

		// ⭐ v8.0: UserAccount 업데이트 (loginId 제외한 모든 필드)
		const userAccountUpdateFields = {};
		if (body.phone !== undefined) userAccountUpdateFields.phone = body.phone;
		if (body.bank !== undefined) userAccountUpdateFields.bank = body.bank;
		if (body.accountNumber !== undefined) userAccountUpdateFields.accountNumber = body.accountNumber;
		if (body.idNumber !== undefined) userAccountUpdateFields.idNumber = body.idNumber;

		if (Object.keys(userAccountUpdateFields).length > 0) {
			await UserAccount.findByIdAndUpdate(
				user.userAccountId._id,
				{ $set: userAccountUpdateFields },
				{ new: true }
			);
		}

		// ⭐ v8.0: User 업데이트 (현재 User만 업데이트)
		// 주의: 판매인/판매인연락처/설계사는 트리 구조 관련 정보이므로 변경 불가
		const userUpdateFields = {};
		if (body.name !== undefined) userUpdateFields.name = body.name;
		if (body.insuranceCompany !== undefined) userUpdateFields.insuranceCompany = body.insuranceCompany;
		if (body.insuranceProduct !== undefined) userUpdateFields.insuranceProduct = body.insuranceProduct;
		if (body.branch !== undefined) userUpdateFields.branch = body.branch;
		// salesperson, salespersonPhone는 변경 불가 (트리 구조 정보)

		if (Object.keys(userUpdateFields).length > 0) {
			await User.findByIdAndUpdate(
				userId,
				{ $set: userUpdateFields },
				{ new: true }
			);
		}

		// 비밀번호 변경 요청이 있는 경우
		if (body.currentPassword && body.newPassword) {
			// bcryptjs 동적 import
			const bcrypt = await import('bcryptjs');

			// ⭐ v8.0: UserAccount에서 passwordHash 확인
			const userAccount = await UserAccount.findById(user.userAccountId._id);

			// 현재 비밀번호 확인
			const isPasswordValid = await bcrypt.default.compare(body.currentPassword, userAccount.passwordHash);

			if (!isPasswordValid) {
				return json({ message: '현재 비밀번호가 일치하지 않습니다.' }, { status: 400 });
			}

			// 새 비밀번호 해시 생성
			const salt = await bcrypt.default.genSalt(10);
			const newPasswordHash = await bcrypt.default.hash(body.newPassword, salt);
			
			// ⭐ v8.0: UserAccount에 passwordHash 업데이트
			await UserAccount.findByIdAndUpdate(
				user.userAccountId._id,
				{ $set: { passwordHash: newPasswordHash } },
				{ new: true }
			);
		}

		// ⭐ v8.0: User 다시 조회 (업데이트 후 정보 반환용)
		const updatedUser = await User.findById(userId)
			.populate('userAccountId', 'loginId phone bank accountNumber idNumber')
			.select('name insuranceCompany insuranceProduct branch salesperson salespersonPhone grade insuranceActive')
			.lean();

		if (!updatedUser) {
			return json({ message: '사용자를 찾을 수 없습니다.' }, { status: 404 });
		}

		// ⭐ v8.0: 첫 번째 등록에서 설계사 정보 가져오기 (응답용)
		const userAccountIdFromJWT = locals.user.id;
		const firstRegistration = await User.findOne({
			userAccountId: userAccountIdFromJWT,
			registrationNumber: 1
		})
			.populate('plannerAccountId', 'name phone')
			.select('plannerAccountId')
			.lean();

		return json({
			success: true,
			message: body.currentPassword ? '정보 및 비밀번호가 업데이트되었습니다.' : '정보가 업데이트되었습니다.',
			profile: {
				name: updatedUser.name || '',
				loginId: updatedUser.userAccountId?.loginId || '',
				phone: updatedUser.userAccountId?.phone || '',
				bank: updatedUser.userAccountId?.bank || '',
				accountNumber: updatedUser.userAccountId?.accountNumber || '',
				idNumber: updatedUser.userAccountId?.idNumber || '',
				insuranceCompany: updatedUser.insuranceCompany || '',
				insuranceProduct: updatedUser.insuranceProduct || '',
				branch: updatedUser.branch || '',
				planner: firstRegistration?.plannerAccountId?.name || '',
				plannerPhone: firstRegistration?.plannerAccountId?.phone || '',
				salesperson: updatedUser.salesperson || '',
				salespersonPhone: updatedUser.salespersonPhone || '',
				grade: updatedUser.grade || '',
				insuranceActive: updatedUser.insuranceActive || false
			}
		});
	} catch (error) {
		console.error('Profile update error:', error);
		return json({ message: '정보 업데이트에 실패했습니다.' }, { status: 500 });
	}
}
