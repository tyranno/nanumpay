import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db.js';
import User from '$lib/server/models/User.js';
import UserAccount from '$lib/server/models/UserAccount.js';

export async function GET({ locals, url }) {
	if (!locals.user || locals.user.type !== 'user') {
		return json({ message: '권한이 없습니다.' }, { status: 401 });
	}

	await db();

	// ⭐ v8.0: 산하정보 보기 권한 확인
	const userAccount = await UserAccount.findById(locals.user.id).select('canViewSubordinates').lean();
	if (!userAccount || !userAccount.canViewSubordinates) {
		return json({ message: '산하정보 조회 권한이 없습니다. 관리자에게 문의하세요.' }, { status: 403 });
	}

	// ⭐ v8.0: URL 파라미터에서 userId 가져오기
	const targetUserId = url.searchParams.get('userId');
	const userAccountId = locals.user.id; // UserAccount._id

	let currentUser;

	if (targetUserId) {
		// ⭐ 특정 User._id로 트리 루트 조회
		currentUser = await User.findById(targetUserId)
			.select('name loginId grade leftChildId rightChildId userAccountId')
			.lean();

		// ⭐ 본인 계정의 User인지 확인 (보안)
		if (!currentUser || currentUser.userAccountId.toString() !== userAccountId.toString()) {
			return json({ message: '해당 계약 정보에 접근할 수 없습니다.' }, { status: 403 });
		}
	} else {
		// ⭐ userId 없으면 첫 번째 계약(registrationNumber=1)을 루트로 사용
		currentUser = await User.findOne({
			userAccountId: userAccountId,
			registrationNumber: 1
		})
			.select('name loginId grade leftChildId rightChildId')
			.lean();
	}

	if (!currentUser) {
		return json({ message: '사용자를 찾을 수 없습니다.' }, { status: 404 });
	}

	// 재귀적으로 트리 구조 생성
	async function buildTree(user) {
		if (!user) return null;

		const treeNode = {
			label: user.name,
			level: user.grade,
			grade: user.grade, // ⭐ BinaryTreeD3에서 grade 필드 사용
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
