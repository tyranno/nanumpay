import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db.js';
import User from '$lib/server/models/User.js';

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
		const sortBy = url.searchParams.get('sortBy') || 'sequence';
		const sortOrder = url.searchParams.get('sortOrder') || 'asc';

		// 검색 조건 구성
		let query = {}; // users 컬렉션은 모두 용역자 (관리자는 별도 admins 컬렉션)
		if (search) {
			query = {
				$or: [
					{ name: { $regex: search, $options: 'i' } },
					{ salesperson: { $regex: search, $options: 'i' } },
					{ planner: { $regex: search, $options: 'i' } }
				]
			};
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
			.populate('plannerAccountId', 'name phone')
			.select('-passwordHash')
			.sort(sortOptions)
			.skip(skip)
			.limit(limit)
			.lean();

		// 각 사용자의 등급 정보 추가 + UserAccount, PlannerAccount 필드 병합
		const usersWithGrade = users.map((user) => {
			return {
				...user,
				grade: user.grade || 'F1',
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
				// ⭐ v8.0: PlannerAccount 필드들
				planner: user.plannerAccountId?.name || '',
				plannerPhone: user.plannerAccountId?.phone || ''
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
		const { userId, ...updateData } = await request.json();

		// passwordHash는 수정 불가
		delete updateData.passwordHash;
		delete updateData._id;

		// ⭐ v8.0: canViewSubordinates는 UserAccount에 저장
		const canViewSubordinates = updateData.canViewSubordinates;
		delete updateData.canViewSubordinates;

		// ⭐ v8.0: UserAccount 관련 필드 분리 (phone, bank, accountNumber, idNumber)
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
		}

		return json({ user });
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
		const { userId } = await request.json();

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

		// ⭐ Cascade 삭제: User 모델의 pre('findOneAndDelete') hook이 자동 처리
		// - 부모의 자식 참조 제거 (parentId + ObjectId 기반)
		// - WeeklyPaymentPlans 삭제
		// - MonthlyRegistrations 업데이트
		// - MonthlyTreeSnapshots 업데이트
		const user = await User.findByIdAndDelete(userId);

		if (!user) {
			return json({ error: 'User not found' }, { status: 404 });
		}

		return json({ success: true });
	} catch (error) {
		console.error('Failed to delete user:', error);
		return json({ error: 'Failed to delete user' }, { status: 500 });
	}
}