import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db.js';
import User from '$lib/server/models/User.js';
import { TreeStats } from '$lib/server/models/TreeStats.js';
import { treeService } from '$lib/server/services/treeService.js';
import bcrypt from 'bcryptjs';

// GET: 사용자 목록 조회
export async function GET({ url, locals }) {
	try {
		await db();

		const page = parseInt(url.searchParams.get('page') || '1');
		const limit = parseInt(url.searchParams.get('limit') || '50');
		const search = url.searchParams.get('search') || '';
		const grade = url.searchParams.get('grade') || '';

		const skip = (page - 1) * limit;

		// 검색 조건 설정
		const query = {};
		if (search) {
			query.$or = [
				{ name: { $regex: search, $options: 'i' } },
				{ loginId: { $regex: search, $options: 'i' } },
				{ phone: { $regex: search, $options: 'i' } },
				{ seller: { $regex: search, $options: 'i' } }
			];
		}
		if (grade) {
			query.grade = grade;
		}

		const users = await User.find(query)
			.populate('parentId', 'name loginId')
			.sort({ createdAt: -1 })
			.skip(skip)
			.limit(limit)
			.lean();

		// 각 사용자의 등급 정보 추가
		for (const user of users) {
			const stats = await TreeStats.findOne({ userId: user._id });
			user.grade = stats?.grade || 'F1';
			user.totalDescendants = stats?.totalDescendants || 0;
		}

		const total = await User.countDocuments(query);

		// 등급별 통계
		const gradeStats = await treeService.getGradeStatistics();

		return json({
			users,
			pagination: {
				page,
				limit,
				total,
				pages: Math.ceil(total / limit)
			},
			stats: {
				grades: gradeStats.reduce((acc, { _id, count }) => {
					acc[_id] = count;
					return acc;
				}, {})
			}
		});
	} catch (error) {
		console.error('Error fetching users:', error);
		return json({ error: 'Failed to fetch users' }, { status: 500 });
	}
}

// POST: 새 사용자 등록
export async function POST({ request, locals }) {
	try {
		await db();
		const data = await request.json();

		// 단일 사용자 등록
		if (!data.bulk) {
			const user = await createUser(data);
			return json({ success: true, user });
		}

		// 일괄 등록
		const results = {
			success: [],
			failed: []
		};

		for (const userData of data.users) {
			try {
				const user = await createUser(userData);
				results.success.push({
					name: user.name,
					loginId: user.loginId
				});
			} catch (error) {
				results.failed.push({
					name: userData.name,
					error: error.message
				});
			}
		}

		return json({
			success: true,
			results
		});
	} catch (error) {
		console.error('Error creating user:', error);
		return json({ error: error.message }, { status: 400 });
	}
}

// 사용자 생성 헬퍼 함수
async function createUser(data) {
	// loginId 생성 (이름 기반)
	let loginId = data.name.toLowerCase().replace(/\s+/g, '');
	let suffix = '';
	let counter = 0;

	// 중복 체크 및 suffix 추가
	while (true) {
		const existing = await User.findOne({ loginId: loginId + suffix });
		if (!existing) break;
		counter++;
		suffix = String.fromCharCode(64 + counter); // A, B, C...
	}
	loginId = loginId + suffix;

	// 비밀번호 생성 (전화번호 뒤 4자리 또는 기본값)
	const password = data.phone ? data.phone.slice(-4) : '1234';
	const passwordHash = await bcrypt.hash(password, 10);

	// 부모 찾기 및 위치 결정
	let parentId = null;
	let position = null;

	if (data.seller) {
		// 판매인이 지정된 경우
		const parent = await User.findOne({
			$or: [
				{ name: data.seller },
				{ loginId: data.seller.toLowerCase() }
			]
		});

		if (parent) {
			parentId = parent._id;

			// 빈 위치 찾기
			const leftChild = await User.findOne({ parentId: parent._id, position: 'L' });
			const rightChild = await User.findOne({ parentId: parent._id, position: 'R' });

			if (!leftChild) {
				position = 'L';
			} else if (!rightChild) {
				position = 'R';
			} else {
				throw new Error(`${data.seller}님은 이미 2명의 하위 회원이 있습니다.`);
			}

			// 부모 노드 업데이트
			if (position === 'L') {
				parent.leftChildId = parent._id;
			} else {
				parent.rightChildId = parent._id;
			}
		}
	}

	// 사용자 생성
	const user = new User({
		name: data.name,
		loginId,
		passwordHash,
		email: data.email,
		phone: data.phone,
		parentId,
		position,
		nickname: data.nickname,
		residentNumber: data.residentNumber,
		bank: data.bank,
		accountNumber: data.accountNumber,
		insurance: data.insurance,
		insuranceCompany: data.insuranceCompany,
		branch: data.branch,
		designer: data.designer,
		designerPhone: data.designerPhone,
		seller: data.seller,
		sellerPhone: data.sellerPhone,
		level: parentId ? (await User.findById(parentId)).level + 1 : 1
	});

	await user.save();

	// 부모 노드의 자식 ID 업데이트
	if (parentId) {
		const parent = await User.findById(parentId);
		if (position === 'L') {
			parent.leftChildId = user._id;
		} else {
			parent.rightChildId = user._id;
		}
		await parent.save();
	}

	// TreeStats 생성 및 상위 노드 재계산
	await treeService.onUserAdded(user._id);

	return user;
}


// PUT: 사용자 정보 수정
export async function PUT({ request, locals }) {
	try {
		await db();
		const { userId, ...updateData } = await request.json();

		const user = await User.findByIdAndUpdate(
			userId,
			{ $set: updateData, updatedAt: new Date() },
			{ new: true }
		);

		if (!user) {
			return json({ error: 'User not found' }, { status: 404 });
		}

		return json({ success: true, user });
	} catch (error) {
		console.error('Error updating user:', error);
		return json({ error: error.message }, { status: 400 });
	}
}

// DELETE: 사용자 삭제 (비활성화)
export async function DELETE({ request, locals }) {
	try {
		await db();
		const { userId } = await request.json();

		const user = await User.findByIdAndUpdate(
			userId,
			{ status: 'inactive', updatedAt: new Date() },
			{ new: true }
		);

		if (!user) {
			return json({ error: 'User not found' }, { status: 404 });
		}

		return json({ success: true });
	} catch (error) {
		console.error('Error deleting user:', error);
		return json({ error: error.message }, { status: 400 });
	}
}