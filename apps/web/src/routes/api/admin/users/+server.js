import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db.js';
import User from '$lib/server/models/User.js';
import PlannerAccount from '$lib/server/models/PlannerAccount.js';
import WeeklyPaymentPlans from '$lib/server/models/WeeklyPaymentPlans.js';
import MonthlyRegistrations from '$lib/server/models/MonthlyRegistrations.js';
import { GRADE_LIMITS } from '$lib/server/utils/constants.js';
import { reprocessMonthPayments, getLatestRegistrationMonth } from '$lib/server/services/monthProcessWithDbService.js';

export async function GET({ url, locals }) {
	// 관리자 권한 확인
	if (!locals.user || !locals.user.isAdmin) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	await db();

	try {
		// 쿼리 파라미터
		const page = parseInt(url.searchParams.get('page') || '1');
		const limit = parseInt(url.searchParams.get('limit') || '20');
		const search = url.searchParams.get('search') || '';
		const searchCategory = url.searchParams.get('searchCategory') || 'name';
		const sortBy = url.searchParams.get('sortBy') || 'sequence';
		const sortOrder = url.searchParams.get('sortOrder') || 'asc';

		// 검색 조건 구성
		let query = {}; // users 컬렉션은 모두 용역자 (관리자는 별도 admins 컬렉션)
		if (search) {
			// 검색 카테고리에 따라 검색 필드 결정
			if (searchCategory === 'name') {
				// 이름 검색: name 필드만
				query = {
					name: { $regex: search, $options: 'i' }
				};
			} else if (searchCategory === 'planner') {
				// 설계사 검색: PlannerAccount에서 이름으로 검색 후 해당 설계사의 고객 조회
				const plannerAccounts = await PlannerAccount.find({
					name: { $regex: search, $options: 'i' }
				}).select('_id').lean();

				const plannerIds = plannerAccounts.map(p => p._id);
				query = {
					plannerAccountId: { $in: plannerIds }
				};
			} else if (searchCategory === 'grade') {
				// 등급 검색: grade 필드로 정확히 일치
				query = {
					grade: search
				};
			}
		}

		// 전체 개수 조회
		const total = await User.countDocuments(query);

		// 페이지네이션 계산
		const skip = (page - 1) * limit;
		const totalPages = Math.ceil(total / limit);

		// 정렬 옵션
		const sortOptions = {};
		sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;

		// ⭐ v8.0: 사용자 목록 조회 + UserAccount, PlannerAccount populate
		const users = await User.find(query)
			.populate('userAccountId', 'loginId canViewSubordinates phone bank accountNumber idNumber')
			.populate('plannerAccountId', 'name phone bank accountNumber')  // ⭐ 설계사 계좌정보 추가
			.select('-passwordHash')
			.sort(sortOptions)
			.skip(skip)
			.limit(limit)
			.lean();

		// 사용자들의 지급 진행률 조회 (completedInstallments 합계)
		const userIds = users.map(u => u._id.toString());
		const paymentProgress = await WeeklyPaymentPlans.aggregate([
			{ $match: { userId: { $in: userIds } } },
			{ $group: {
				_id: '$userId',
				completedInstallments: { $sum: '$completedInstallments' }
			}}
		]);
		const progressMap = new Map(paymentProgress.map(p => [p._id, p.completedInstallments]));

		// 각 사용자의 등급 정보 추가 + UserAccount, PlannerAccount 필드 병합
		const usersWithGrade = users.map((user) => {
			const grade = user.grade || 'F1';
			const maxInstallments = GRADE_LIMITS[grade]?.maxInstallments || 20;
			const completed = progressMap.get(user._id.toString()) || 0;
			// ⭐ v8.0: 비율은 User 모델에서 가져옴 (엑셀 업로드 시 저장된 값)
			const paymentRatio = user.ratio ?? 1;

			return {
				...user,
				grade,
				totalDescendants: 0,  // 필요 시 계산
				leftCount: 0,
				rightCount: 0,
				// ⭐ v8.0: UserAccount 필드들
				loginId: user.userAccountId?.loginId || '',
				canViewSubordinates: user.userAccountId?.canViewSubordinates || false,
				phone: user.userAccountId?.phone || '',
				bank: user.userAccountId?.bank || '',
				accountNumber: user.userAccountId?.accountNumber || '',
				idNumber: user.userAccountId?.idNumber || '',
				insuranceAmount: user.insuranceAmount || 0,
				insuranceActive: user.insuranceActive || false,
				insuranceDate: user.insuranceDate || null,
				// ⭐ v8.0: 지급 진행률
				completedInstallments: completed,
				maxInstallments,
				paymentRatio,
				// ⭐ v8.0: PlannerAccount 필드들
				planner: user.plannerAccountId?.name || '',
				plannerPhone: user.plannerAccountId?.phone || '',
				plannerBank: user.plannerAccountId?.bank || '',  // ⭐ 설계사 은행
				plannerAccountNumber: user.plannerAccountId?.accountNumber || '',  // ⭐ 설계사 계좌번호
				// User 모델 필드들 (지사, 보험상품, 보험회사)
				branch: user.branch || '',
				insuranceProduct: user.insuranceProduct || '',
				insuranceCompany: user.insuranceCompany || ''
			};
		});

		return json({
			users: usersWithGrade,
			pagination: {
				page,
				limit,
				total,
				totalPages,
				hasNext: page < totalPages,
				hasPrev: page > 1
			}
		});
	} catch (error) {
		console.error('Failed to fetch users:', error);
		return json({ error: 'Failed to fetch users' }, { status: 500 });
	}
}

// 사용자 수정
export async function PUT({ request, locals }) {
	if (!locals.user || !locals.user.isAdmin) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	await db();

	try {
		const { userId, requiresReprocess, ...updateData } = await request.json();

		// passwordHash는 수정 불가
		delete updateData.passwordHash;
		delete updateData._id;

		// ⭐ 이름 변경 감지를 위해 기존 이름 조회
		const newName = updateData.name;
		let oldName = null;
		let existingUser = null;
		if (newName) {
			existingUser = await User.findById(userId).select('name createdAt').lean();
			oldName = existingUser?.name;
		} else {
			existingUser = await User.findById(userId).select('createdAt').lean();
		}

		// ⭐ v8.0: canViewSubordinates는 UserAccount에 저장
		const canViewSubordinates = updateData.canViewSubordinates;
		delete updateData.canViewSubordinates;

		// ⭐ v8.0: UserAccount 관련 필드 분리 (phone, bank, accountNumber, idNumber, insuranceAmount)
		const userAccountFields = {};
		if (updateData.phone !== undefined) {
			userAccountFields.phone = updateData.phone;
			delete updateData.phone;
		}
		if (updateData.bank !== undefined) {
			userAccountFields.bank = updateData.bank;
			delete updateData.bank;
		}
		if (updateData.accountNumber !== undefined) {
			userAccountFields.accountNumber = updateData.accountNumber;
			delete updateData.accountNumber;
		}
		if (updateData.idNumber !== undefined) {
			userAccountFields.idNumber = updateData.idNumber;
			delete updateData.idNumber;
		}
		// ⭐ v8.0: 보험 관련 필드는 별도 API(/api/admin/users/insurance)에서 처리
		// 여기서는 수정하지 않도록 삭제
		delete updateData.insuranceAmount;
		delete updateData.insuranceDate;
		delete updateData.insuranceActive;

		// ⭐ PlannerAccount 관련 필드 분리
		const plannerAccountFields = {};
		if (updateData.plannerBank !== undefined) {
			plannerAccountFields.bank = updateData.plannerBank;
			delete updateData.plannerBank;
		}
		if (updateData.plannerAccountNumber !== undefined) {
			plannerAccountFields.accountNumber = updateData.plannerAccountNumber;
			delete updateData.plannerAccountNumber;
		}
		// plannerPhone도 PlannerAccount 필드
		if (updateData.plannerPhone !== undefined) {
			plannerAccountFields.phone = updateData.plannerPhone;
			delete updateData.plannerPhone;
		}
		// planner (설계사 이름)도 PlannerAccount 필드
		if (updateData.planner !== undefined) {
			plannerAccountFields.name = updateData.planner;
			delete updateData.planner;
		}

		// User 업데이트
		const user = await User.findByIdAndUpdate(
			userId,
			updateData,
			{ new: true, runValidators: true }
		).populate('userAccountId').select('-passwordHash');

		if (!user) {
			return json({ error: 'User not found' }, { status: 404 });
		}

		// ⭐ v8.0: UserAccount 업데이트 (권한 및 개인정보)
		const { default: UserAccount } = await import('$lib/server/models/UserAccount.js');
		if (canViewSubordinates !== undefined) {
			userAccountFields.canViewSubordinates = canViewSubordinates;
		}

		if (Object.keys(userAccountFields).length > 0) {
			await UserAccount.findByIdAndUpdate(
				user.userAccountId._id,
				{ $set: userAccountFields },
				{ new: true }
			);

			// ⭐ v8.0: 보험 정보는 별도 API(/api/admin/users/insurance)에서 처리
		}

		// ⭐ PlannerAccount 업데이트 (최신월에 속한 지원자만)
		if (Object.keys(plannerAccountFields).length > 0 && user.plannerAccountId) {
			// 사용자가 속한 월 확인
			const userMonth = existingUser?.createdAt
				? new Date(existingUser.createdAt).toISOString().substring(0, 7)
				: null;

			// 최신 월인지 확인
			const plannerLatestMonth = await getLatestRegistrationMonth();

			if (userMonth && userMonth === plannerLatestMonth) {
				await PlannerAccount.findByIdAndUpdate(
					user.plannerAccountId,
					{ $set: plannerAccountFields },
					{ new: true }
				);
			} else {
				console.log(`[사용자 수정] ${user.name} - 설계사 정보 수정 스킵 (최신월 아님: ${userMonth} vs ${plannerLatestMonth})`);
			}
		}

		// ⭐ 이름 변경 시 WeeklyPaymentPlans의 userName도 동기화
		if (newName && oldName && newName !== oldName) {
			const updateResult = await WeeklyPaymentPlans.updateMany(
				{ userId: userId.toString() },
				{ $set: { userName: newName } }
			);
			console.log(`✅ 지급계획 userName 동기화: ${oldName} → ${newName} (${updateResult.modifiedCount}건)`);
		}

		// ⭐ v8.3: 등록일(createdAt) 변경 시 gradeHistory.date와 MonthlyRegistrations.registrationDate도 동기화
		if (updateData.createdAt && existingUser?.createdAt) {
			const oldCreatedAt = new Date(existingUser.createdAt);
			const newCreatedAt = new Date(updateData.createdAt);

			if (oldCreatedAt.getTime() !== newCreatedAt.getTime()) {
				console.log(`✅ 등록일 변경: ${oldCreatedAt.toISOString().split('T')[0]} → ${newCreatedAt.toISOString().split('T')[0]}`);

				const oldMonthKey = oldCreatedAt.toISOString().substring(0, 7);
				const newMonthKey = newCreatedAt.toISOString().substring(0, 7);

				// 1. gradeHistory.date 업데이트 (User 다시 조회 후 수정)
				const userForGradeHistory = await User.findById(userId);
				const registrationHistory = userForGradeHistory?.gradeHistory?.find(h =>
					h.type === 'registration' && h.revenueMonth === oldMonthKey
				);
				if (registrationHistory) {
					registrationHistory.date = newCreatedAt;
					// ⭐ v8.3: 월이 바뀌면 revenueMonth도 업데이트
					if (oldMonthKey !== newMonthKey) {
						registrationHistory.revenueMonth = newMonthKey;
						console.log(`  → gradeHistory.revenueMonth 변경: ${oldMonthKey} → ${newMonthKey}`);
					}
					await userForGradeHistory.save();
					console.log(`  → gradeHistory.date 동기화 완료`);
				}

				// 2. MonthlyRegistrations.registrations[].registrationDate 업데이트
				const monthlyReg = await MonthlyRegistrations.findOne({
					monthKey: oldMonthKey,
					'registrations.userId': userId
				});
				if (monthlyReg) {
					const reg = monthlyReg.registrations.find(r => r.userId === userId);
					if (reg) {
						reg.registrationDate = newCreatedAt;
						await monthlyReg.save();
						console.log(`  → MonthlyRegistrations.registrationDate 동기화 완료`);
					}
				}
				// ⭐ v8.4: 부모 승급일은 reprocess에서 자동 재계산됨 (등급 초기화 후 재계산)
			}
		}

		// ⭐ 재처리 필요 시 월별 지급 계획 재계산
		let reprocessed = false;
		if (requiresReprocess) {
			// 사용자가 속한 월 확인
			const userMonth = existingUser?.createdAt
				? new Date(existingUser.createdAt).toISOString().substring(0, 7)
				: null;

			// 최신 월인지 확인
			const latestMonth = await getLatestRegistrationMonth();

			if (userMonth && userMonth === latestMonth) {
				console.log(`[사용자 수정] ${user.name} - ${latestMonth} 월별 지급 계획 재처리 시작`);
				await reprocessMonthPayments(latestMonth);
				reprocessed = true;
			}
		}

		return json({ user, reprocessed });
	} catch (error) {
		console.error('Failed to update user:', error);
		return json({ error: 'Failed to update user' }, { status: 500 });
	}
}

// 사용자 삭제
export async function DELETE({ request, locals }) {
	if (!locals.user || !locals.user.isAdmin) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	await db();

	try {
		const { userId, reprocess } = await request.json();

		// 삭제할 사용자 정보 먼저 조회
		const userToDelete = await User.findById(userId);
		if (!userToDelete) {
			return json({ error: 'User not found' }, { status: 404 });
		}

		// 하위 노드가 있는지 확인 (loginId로 확인)
		const hasChildren = await User.exists({
			parentId: userToDelete.loginId
		});

		// 실제로 자식이 있는지 확인
		const hasLeftChild = userToDelete.leftChildId ? await User.exists({ loginId: userToDelete.leftChildId }) : false;
		const hasRightChild = userToDelete.rightChildId ? await User.exists({ loginId: userToDelete.rightChildId }) : false;

		if (hasChildren || hasLeftChild || hasRightChild) {
			console.log(`삭제 불가 - ${userToDelete.name}(${userToDelete.loginId}): hasChildren=${hasChildren}, left=${hasLeftChild}, right=${hasRightChild}`);
			return json({
				error: '하위 조직이 있는 사용자는 삭제할 수 없습니다.'
			}, { status: 400 });
		}

		// 삭제 전에 사용자가 속한 월 확인
		const userMonth = userToDelete.createdAt
			? new Date(userToDelete.createdAt).toISOString().substring(0, 7)
			: null;

		// 최신 월인지 확인
		const latestMonth = await getLatestRegistrationMonth();

		if (userMonth !== latestMonth) {
			return json({
				error: '최신 등록월의 지원자만 삭제할 수 있습니다.'
			}, { status: 400 });
		}

		// ⭐ 해당 사용자의 지급 계획 먼저 삭제
		const deletedPlans = await WeeklyPaymentPlans.deleteMany({ userId: userId.toString() });
		console.log(`[사용자 삭제] ${userToDelete.name} - 지급 계획 ${deletedPlans.deletedCount}건 삭제`);

		// ⭐ Cascade 삭제: User 모델의 pre('findOneAndDelete') hook이 자동 처리
		// - 부모의 자식 참조 제거 (parentId + ObjectId 기반)
		// - MonthlyRegistrations 업데이트
		// - MonthlyTreeSnapshots 업데이트
		const user = await User.findByIdAndDelete(userId);

		if (!user) {
			return json({ error: 'User not found' }, { status: 404 });
		}

		// ⭐ 재처리 필요 시 월별 지급 계획 재계산
		let reprocessed = false;
		if (reprocess && latestMonth) {
			console.log(`[사용자 삭제] ${userToDelete.name} - ${latestMonth} 월별 지급 계획 재처리 시작`);
			await reprocessMonthPayments(latestMonth);
			reprocessed = true;
		}

		return json({ success: true, reprocessed });
	} catch (error) {
		console.error('Failed to delete user:', error);
		return json({ error: 'Failed to delete user' }, { status: 500 });
	}
}