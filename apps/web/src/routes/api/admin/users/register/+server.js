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
		const data = await request.json();
		const {
			name,
			phone,
			autoPassword,
			salesperson,
			parentId,
			position = 'L',
			...otherFields
		} = data;

		// 필수 필드 확인
		if (!name || !phone) {
			return json({ error: '이름과 연락처는 필수입니다.' }, { status: 400 });
		}

		// 암호 설정 (전화번호 뒤 4자리)
		const password = autoPassword || '1234';

		// loginId 자동 생성 (한글 이름 사용)
		let baseLoginId = name.toLowerCase();
		let loginId = baseLoginId;
		let suffix = '';
		let counter = 0;

		// 중복 확인 및 접미사 추가
		while (await User.exists({ loginId })) {
			counter++;
			suffix = String.fromCharCode(64 + counter); // A, B, C, ...
			loginId = baseLoginId + suffix;

			if (counter > 26) {
				// Z를 넘어가면 숫자 사용
				loginId = baseLoginId + counter;
			}
		}

		// 판매인이 있으면 부모로 설정
		let finalParentId = parentId;
		if (salesperson && !parentId) {
			// 판매인 이름으로 부모 찾기
			const parentUser = await User.findOne({ name: salesperson });
			if (parentUser) {
				finalParentId = parentUser._id;

				// 부모의 자식 노드 확인
				const leftChild = await User.findOne({
					parentId: parentUser._id,
					position: 'L'
				});
				const rightChild = await User.findOne({
					parentId: parentUser._id,
					position: 'R'
				});

				// 자동으로 빈 위치 할당
				if (!leftChild) {
					position = 'L';
				} else if (!rightChild) {
					position = 'R';
				} else {
					// 이미 2개의 자식 노드가 있음
					return json({
						error: `${salesperson}님은 이미 2개의 하위 노드를 가지고 있습니다. 다른 판매인을 선택하거나 수동으로 위치를 지정해주세요.`,
						needsManualPlacement: true,
						parentUser: {
							id: parentUser._id,
							name: parentUser.name,
							leftChild: leftChild ? leftChild.name : null,
							rightChild: rightChild ? rightChild.name : null
						}
					}, { status: 400 });
				}
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
			parentId: finalParentId,
			position: finalParentId ? position : null,
			salesperson,
			rootAdminId: locals.user.id, // 관리자 ID 저장
			...otherFields
		});

		const savedUser = await newUser.save();

		// 부모 노드 업데이트
		if (finalParentId) {
			const updateField = position === 'L' ? 'leftChildId' : 'rightChildId';
			await User.findByIdAndUpdate(finalParentId, {
				[updateField]: savedUser._id
			});

			// 부모가 이제 2개의 자식을 가지게 되었는지 확인
			const updatedParent = await User.findById(finalParentId);
			if (updatedParent.leftChildId && updatedParent.rightChildId) {
				// 알림 플래그 설정 (실제 알림 시스템은 별도 구현 필요)
				console.log(`알림: ${updatedParent.name}님이 2개의 하위 노드를 모두 채웠습니다.`);
			}
		}

		return json({
			success: true,
			user: {
				id: savedUser._id,
				name: savedUser.name,
				loginId: savedUser.loginId,
				phone: savedUser.phone
			},
			message: `사용자 등록 완료. ID: ${loginId}, 초기 암호: ${password}`
		});
	} catch (error) {
		console.error('User registration error:', error);

		if (error.code === 11000) {
			return json({ error: '중복된 데이터가 있습니다.' }, { status: 400 });
		}

		return json({ error: '사용자 등록 중 오류가 발생했습니다.' }, { status: 500 });
	}
}