import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db.js';
import User from '$lib/server/models/User.js';

export async function GET({ locals }) {
	if (!locals.user || locals.user.type !== 'user') {
		return json({ message: '권한이 없습니다.' }, { status: 401 });
	}

	await db();

	const userId = locals.user.id;

	// 현재 사용자 정보 조회
	const currentUser = await User.findById(userId)
		.select('name loginId grade leftChildId rightChildId')
		.lean();

	if (!currentUser) {
		return json({ message: '사용자를 찾을 수 없습니다.' }, { status: 404 });
	}

	// 재귀적으로 트리 구조 생성
	async function buildTree(user) {
		if (!user) return null;

		const treeNode = {
			label: user.name,
			level: user.grade,
			userId: user.loginId
		};

		// 왼쪽 자식 조회 및 재귀
		if (user.leftChildId) {
			const leftChild = await User.findById(user.leftChildId)
				.select('name loginId grade leftChildId rightChildId')
				.lean();
			treeNode.left = await buildTree(leftChild);
		}

		// 오른쪽 자식 조회 및 재귀
		if (user.rightChildId) {
			const rightChild = await User.findById(user.rightChildId)
				.select('name loginId grade leftChildId rightChildId')
				.lean();
			treeNode.right = await buildTree(rightChild);
		}

		return treeNode;
	}

	// 현재 사용자를 루트로 하는 트리 생성
	const treeData = await buildTree(currentUser);

	// 루트 노드에 isMe 플래그 추가
	if (treeData) {
		treeData.isMe = true;
	}

	return json({
		success: true,
		tree: treeData
	});
}
