import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db.js';
import User from '$lib/server/models/User.js';

// GET: 사용자 트리 구조 조회
export async function GET({ url, locals }) {
	try {
		await db();

		const userId = url.searchParams.get('userId');
		const depth = parseInt(url.searchParams.get('depth') || '5');

		let rootUser;
		if (userId) {
			rootUser = await User.findById(userId).lean();
		} else {
			// 루트 사용자 찾기
			rootUser = await User.findOne({ parentId: null }).lean();
		}

		if (!rootUser) {
			return json({ error: 'User not found' }, { status: 404 });
		}

		// 트리 구조 생성
		const tree = await buildTree(rootUser._id, depth);

		return json({
			success: true,
			tree
		});
	} catch (error) {
		console.error('Error fetching tree:', error);
		return json({ error: error.message }, { status: 500 });
	}
}

// 재귀적으로 트리 구조 생성
async function buildTree(userId, maxDepth, currentDepth = 0) {
	if (currentDepth >= maxDepth) {
		return null;
	}

	const user = await User.findById(userId).lean();
	if (!user) {
		return null;
	}

	// 자식 노드 찾기
	const leftChild = await User.findOne({ parentId: userId, position: 'L' }).lean();
	const rightChild = await User.findOne({ parentId: userId, position: 'R' }).lean();

	// D3.js 형식으로 변환
	const node = {
		id: user._id.toString(),
		name: user.name,
		loginId: user.loginId,
		grade: user.grade,
		phone: user.phone,
		bank: user.bank,
		accountNumber: user.accountNumber,
		level: user.level,
		leftCount: user.leftCount,
		rightCount: user.rightCount,
		status: user.status,
		children: []
	};

	// 왼쪽 자식 추가
	if (leftChild) {
		const leftTree = await buildTree(leftChild._id, maxDepth, currentDepth + 1);
		if (leftTree) {
			node.children.push(leftTree);
		}
	} else if (currentDepth < maxDepth - 1) {
		// 빈 노드 표시
		node.children.push({
			id: `empty-left-${userId}`,
			name: '빈 자리',
			isEmpty: true,
			position: 'L',
			parentId: userId.toString()
		});
	}

	// 오른쪽 자식 추가
	if (rightChild) {
		const rightTree = await buildTree(rightChild._id, maxDepth, currentDepth + 1);
		if (rightTree) {
			node.children.push(rightTree);
		}
	} else if (currentDepth < maxDepth - 1) {
		// 빈 노드 표시
		node.children.push({
			id: `empty-right-${userId}`,
			name: '빈 자리',
			isEmpty: true,
			position: 'R',
			parentId: userId.toString()
		});
	}

	return node;
}

// POST: 특정 위치에 사용자 배치
export async function POST({ request, locals }) {
	try {
		await db();
		const { userId, parentId, position } = await request.json();

		// 이미 배치된 사용자인지 확인
		const user = await User.findById(userId);
		if (!user) {
			return json({ error: '사용자를 찾을 수 없습니다.' }, { status: 404 });
		}

		if (user.parentId) {
			return json({ error: '이미 배치된 사용자입니다.' }, { status: 400 });
		}

		// 부모 노드 확인
		const parent = await User.findById(parentId);
		if (!parent) {
			return json({ error: '부모 노드를 찾을 수 없습니다.' }, { status: 404 });
		}

		// 위치 확인
		const existingChild = await User.findOne({ parentId, position });
		if (existingChild) {
			return json({ error: '해당 위치에 이미 사용자가 있습니다.' }, { status: 400 });
		}

		// 사용자 배치
		user.parentId = parentId;
		user.position = position;
		user.level = parent.level + 1;
		await user.save();

		// 부모 노드 업데이트
		if (position === 'L') {
			parent.leftChildId = user._id;
		} else {
			parent.rightChildId = user._id;
		}
		await parent.save();

		// 상위 노드들의 등급 재계산
		await updateAncestorsGrade(parentId);

		return json({
			success: true,
			message: '사용자가 성공적으로 배치되었습니다.'
		});
	} catch (error) {
		console.error('Error placing user:', error);
		return json({ error: error.message }, { status: 500 });
	}
}

// 상위 노드들의 등급 재계산
async function updateAncestorsGrade(userId) {
	const user = await User.findById(userId);
	if (!user) return;

	// 현재 노드의 트리 구조 업데이트
	await user.updateTreeStructure();

	// 부모 노드가 있으면 재귀적으로 상위 노드 업데이트
	if (user.parentId) {
		await updateAncestorsGrade(user.parentId);
	}
}