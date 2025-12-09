import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db.js';
import User from '$lib/server/models/User.js';
import WeeklyPaymentPlans from '$lib/server/models/WeeklyPaymentPlans.js';

export async function GET({ locals, url }) {
	// 설계사 계정 확인
	if (!locals.user || locals.user.accountType !== 'planner') {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	await db();

	try {
		const plannerAccountId = locals.user.id;
		const page = parseInt(url.searchParams.get('page') || '1');
		const limit = parseInt(url.searchParams.get('limit') || '20');
		const skip = (page - 1) * limit;

		// 설계사가 설계한 모든 사용자 ID 조회
		const users = await User.find({ plannerAccountId: plannerAccountId }, '_id name grade').lean();
		const userIds = users.map(u => u._id.toString());

		if (userIds.length === 0) {
			return json({
				payments: [],
				pagination: {
					page,
					limit,
					total: 0,
					totalPages: 0
				}
			});
		}

		// 사용자 ID를 이름으로 매핑
		const userMap = {};
		users.forEach(u => {
			userMap[u._id.toString()] = {
				name: u.name,
				grade: u.grade
			};
		});

		// 지급 계획에서 해당 사용자들의 지급내역 조회
		const pipeline = [
			{
				$match: {
					userId: { $in: userIds }
				}
			},
			{
				$unwind: '$installments'
			},
			{
				$match: {
					'installments.status': { $nin: ['skipped', 'terminated'] }  // ⭐ v8.0
				}
			},
			{
				$project: {
					userId: 1,
					userName: 1,
					baseGrade: 1,
					'installments.scheduledDate': 1,
					'installments.paidAt': 1,
					'installments.status': 1,
					'installments.installmentAmount': 1,
					'installments.withholdingTax': 1,
					'installments.netAmount': 1
				}
			},
			{
				$sort: {
					'installments.scheduledDate': -1
				}
			}
		];

		// 전체 개수 조회
		const totalPipeline = [...pipeline, { $count: 'total' }];
		const totalResult = await WeeklyPaymentPlans.aggregate(totalPipeline);
		const total = totalResult[0]?.total || 0;

		// 페이지네이션 적용
		pipeline.push({ $skip: skip }, { $limit: limit });

		// 데이터 조회
		const results = await WeeklyPaymentPlans.aggregate(pipeline);

		// 결과 포맷팅
		const payments = results.map(r => ({
			userId: r.userId,
			userName: r.userName || userMap[r.userId]?.name || '알 수 없음',
			grade: r.baseGrade || userMap[r.userId]?.grade || '-',
			scheduledDate: r.installments.scheduledDate,
			paidAt: r.installments.paidAt,
			status: r.installments.status,
			amount: r.installments.installmentAmount,
			tax: r.installments.withholdingTax,
			netAmount: r.installments.netAmount
		}));

		return json({
			payments,
			pagination: {
				page,
				limit,
				total,
				totalPages: Math.ceil(total / limit)
			}
		});
	} catch (error) {
		console.error('지급내역 조회 오류:', error);
		return json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
	}
}