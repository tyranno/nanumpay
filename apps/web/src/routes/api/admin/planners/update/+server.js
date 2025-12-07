import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db.js';
import PlannerAccount from '$lib/server/models/PlannerAccount.js';

export async function POST({ request, locals }) {
	// 관리자 권한 확인
	if (!locals.user || !locals.user.isAdmin) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	await db();

	try {
		const { plannerAccountId, name, phone, bank, accountNumber } = await request.json();

		if (!plannerAccountId) {
			return json({ error: '설계사 ID가 필요합니다.' }, { status: 400 });
		}

		// 업데이트 데이터 구성
		const updateData = {};
		if (name !== undefined) updateData.name = name;
		if (phone !== undefined) updateData.phone = phone;
		if (bank !== undefined) updateData.bank = bank;
		if (accountNumber !== undefined) updateData.accountNumber = accountNumber;
		updateData.updatedAt = new Date();

		// PlannerAccount 업데이트
		const planner = await PlannerAccount.findByIdAndUpdate(
			plannerAccountId,
			{ $set: updateData },
			{ new: true }
		).select('-passwordHash');

		if (!planner) {
			return json({ error: '설계사를 찾을 수 없습니다.' }, { status: 404 });
		}

		return json({
			success: true,
			planner: {
				_id: planner._id,
				name: planner.name,
				phone: planner.phone,
				bank: planner.bank,
				accountNumber: planner.accountNumber
			}
		});
	} catch (error) {
		console.error('Failed to update planner:', error);
		return json({ error: '설계사 정보 수정에 실패했습니다.' }, { status: 500 });
	}
}
