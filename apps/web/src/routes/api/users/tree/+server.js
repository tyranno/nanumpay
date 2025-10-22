import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db.js';
import User from '$lib/server/models/User.js';

// GET: 사용자 트리 구조 조회
export async function GET({ url, locals }) {
	try {
		await db();

		const userId = url.searchParams.get('userId');
		const getRoots = url.searchParams.get('getRoots'); // 루트 목록만 가져오기
		const depth = parseInt(url.searchParams.get('depth') || '999'); // 전체 트리 조회

		// 루트 사용자 목록만 요청하는 경우
		if (getRoots === 'true') {
			const rootUsers = await User.find({ parentId: null }).lean();
			return json({
				success: true,
				roots: rootUsers.map((u) => ({
					id: u._id.toString(),
					name: u.name,
					loginId: u.loginId,
					grade: u.grade
				}))
			});
		}

		let rootUser;
		if (userId) {
			// 특정 사용자 ID로 시작
			rootUser = await User.findById(userId).lean();
			if (!rootUser) {
				return json({ error: 'User not found' }, { status: 404 });
			}
		} else {
			// userId가 없으면 첫 번째 루트 사용자 사용
			rootUser = await User.findOne({ parentId: null }).lean();
			if (!rootUser) {
				return json({ error: 'No root users found' }, { status: 404 });
			}
		}

		// 트리 구조 생성 (User 모델 직접 사용)
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

// 재귀적으로 트리 구조 생성 (성능 최적화: 한 번에 모든 데이터 로드)
async function buildTree(rootUserId, maxDepth) {
	// 1. 루트 사용자의 모든 하위 사용자를 한 번에 조회
	const rootUser = await User.findById(rootUserId).lean();
	if (!rootUser) return null;

	// 2. 루트와 그 하위 노드들을 BFS로 수집 (maxDepth 제한)
	const userIds = [rootUserId];
	const visited = new Set([rootUserId.toString()]);
	let currentLevel = [rootUserId];
	let currentDepth = 0;

	// maxDepth 제한 적용
	while (currentLevel.length > 0 && currentDepth < maxDepth) {
		const nextLevel = [];
		const children = await User.find({
			parentId: { $in: currentLevel }
		}).lean();

		for (const child of children) {
			const childId = child._id.toString();
			if (!visited.has(childId)) {
				visited.add(childId);
				userIds.push(child._id);
				nextLevel.push(child._id);
			}
		}
		currentLevel = nextLevel;
		currentDepth++;
	}

	// 3. 모든 사용자를 한 번에 조회
	const users = await User.find({ _id: { $in: userIds } }).lean();

	// 4. Map으로 빠른 조회를 위한 인덱싱
	const userMap = new Map();
	users.forEach(u => userMap.set(u._id.toString(), u));

	// 5. 재귀적으로 트리 구성 (메모리에서 처리)
	function buildNode(userId) {
		const user = userMap.get(userId.toString());
		if (!user) return null;

		// BinaryTreeD3 형식으로 변환 (계층 관계 정보만)
		const node = {
			id: user._id.toString(),
			label: user.name,              // 노드에 표시할 이름
			grade: user.grade || 'F1',     // 등급 뱃지 표시
			level: user.level              // 트리 레벨
		};

		// 자식 찾기 (메모리에서)
		const children = users.filter(u =>
			u.parentId && u.parentId.toString() === userId.toString()
		);

		const leftChild = children.find(c => c.position === 'L');
		const rightChild = children.find(c => c.position === 'R');

		if (leftChild) {
			const leftNode = buildNode(leftChild._id);
			if (leftNode) node.left = leftNode;
		}

		if (rightChild) {
			const rightNode = buildNode(rightChild._id);
			if (rightNode) node.right = rightNode;
		}

		return node;
	}

	return buildNode(rootUserId);
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
	// TODO: 등급 재계산 로직 필요 시 registrationService 사용
	// 현재는 registrationService에서 전체 트리 재계산 수행
	console.log(`[Tree API] updateAncestorsGrade called for ${userId}`);
}