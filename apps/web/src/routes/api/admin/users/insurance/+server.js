import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db.js';
import User from '$lib/server/models/User.js';
import WeeklyPaymentPlans from '$lib/server/models/WeeklyPaymentPlans.js';
import { GRADE_LIMITS } from '$lib/server/utils/constants.js';

/**
 * 보험 가입 처리 API
 * - insuranceAmount, insuranceDate 저장
 * - insuranceActive 자동 계산
 * - insuranceDate 이후 지급계획 활성화 (skipped → pending)
 */
export async function POST({ request, locals }) {
	// 관리자 권한 확인
	if (!locals.user || !locals.user.isAdmin) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	await db();

	try {
		const { userId, insuranceAmount, insuranceDate, cancel } = await request.json();

		if (!userId) {
			return json({ error: 'userId is required' }, { status: 400 });
		}

		// 사용자 조회
		const user = await User.findById(userId);
		if (!user) {
			return json({ error: 'User not found' }, { status: 404 });
		}

		// 해지 처리
		if (cancel) {
			user.insuranceAmount = 0;
			user.insuranceDate = null;
			user.insuranceActive = false;
			await user.save();

			const today = new Date();
			today.setHours(0, 0, 0, 0);

			console.log(`❌ 보험 해지 처리: ${user.name} (${user.grade})`);
			console.log(`   - 기준일: ${today.toISOString().split('T')[0]} (오늘)`);

			// F4+ 등급의 오늘 이후 pending 지급계획 비활성화 (skipped로 변경)
			let skippedCount = 0;
			const gradeLimit = GRADE_LIMITS[user.grade];
			if (gradeLimit?.insuranceRequired) {
				const plans = await WeeklyPaymentPlans.find({
					userId: user._id.toString(),
					planStatus: 'active'
				});

				for (const plan of plans) {
					let modified = false;
					for (const installment of plan.installments) {
						// 오늘 이후 예정일인 pending만 비활성화
						if (
							installment.status === 'pending' &&
							new Date(installment.scheduledDate) >= today
						) {
							installment.status = 'skipped';
							installment.insuranceSkipped = true;
							installment.skipReason = 'insurance_cancelled';
							skippedCount++;
							modified = true;
							console.log(`   ⏸️ 비활성화: ${plan.userName} ${plan.baseGrade} Week ${installment.week}`);
						}
					}
					if (modified) {
						await plan.save();
					}
				}
				console.log(`   ⏸️ 총 ${skippedCount}건 지급계획 비활성화`);
			}

			return json({
				success: true,
				user: {
					_id: user._id,
					name: user.name,
					grade: user.grade,
					insuranceAmount: 0,
					insuranceDate: null,
					insuranceActive: false
				},
				skippedPlans: skippedCount,
				message: skippedCount > 0
					? `보험이 해지되었습니다. ${skippedCount}건의 지급계획이 중단되었습니다.`
					: '보험이 해지되었습니다.'
			});
		}

		// 등급별 필요 금액 확인
		const gradeLimit = GRADE_LIMITS[user.grade];
		const requiredAmount = gradeLimit?.insuranceAmount || 0;
		const isRequired = gradeLimit?.insuranceRequired || false;

		// 보험 활성화 여부 계산
		let insuranceActive = false;
		if (isRequired && insuranceAmount >= requiredAmount) {
			insuranceActive = true;
		} else if (!isRequired) {
			// F1-F3은 보험 불필요
			insuranceActive = false;
		}

		// 사용자 보험 정보 업데이트
		const parsedDate = insuranceDate ? new Date(insuranceDate) : new Date();
		user.insuranceAmount = insuranceAmount;
		user.insuranceDate = parsedDate;
		user.insuranceActive = insuranceActive;
		await user.save();

		console.log(`✅ 보험 가입 처리: ${user.name} (${user.grade})`);
		console.log(`   - 금액: ${insuranceAmount?.toLocaleString()}원`);
		console.log(`   - 가입일: ${parsedDate.toISOString().split('T')[0]}`);
		console.log(`   - 활성화: ${insuranceActive}`);

		// 지급계획 상태 변경
		let activatedCount = 0;
		let skippedCount = 0;

		// 기준일 계산: max(insuranceDate, today)
		const today = new Date();
		today.setHours(0, 0, 0, 0);
		const effectiveDate = parsedDate > today ? parsedDate : today;

		console.log(`   - 기준일: ${effectiveDate.toISOString().split('T')[0]} (max(가입일, 오늘))`);

		// 해당 사용자의 활성 지급계획 조회
		const plans = await WeeklyPaymentPlans.find({
			userId: user._id.toString(),
			planStatus: 'active'
		});

		if (insuranceActive) {
			// 보험 조건 충족: 기준일 이후의 skipped → pending 활성화
			for (const plan of plans) {
				let modified = false;

				for (const installment of plan.installments) {
					// 보험 미유지로 건너뛴 회차 중 기준일 이후 예정일인 것만 활성화
					if (
						installment.insuranceSkipped === true &&
						installment.status === 'skipped' &&
						new Date(installment.scheduledDate) >= effectiveDate
					) {
						installment.status = 'pending';
						installment.insuranceSkipped = false;
						installment.skipReason = undefined;
						activatedCount++;
						modified = true;

						console.log(`   📋 활성화: ${plan.userName} ${plan.baseGrade} Week ${installment.week}`);
					}
				}

				if (modified) {
					await plan.save();
				}
			}

			console.log(`   ✅ 총 ${activatedCount}건 지급계획 활성화`);
		} else if (isRequired) {
			// 보험 조건 미충족 (F4+ 등급): 기준일 이후의 pending → skipped 비활성화
			for (const plan of plans) {
				let modified = false;

				for (const installment of plan.installments) {
					// 기준일 이후 예정일인 것만 비활성화
					if (
						installment.status === 'pending' &&
						new Date(installment.scheduledDate) >= effectiveDate
					) {
						installment.status = 'skipped';
						installment.insuranceSkipped = true;
						installment.skipReason = 'insurance_not_maintained';
						skippedCount++;
						modified = true;

						console.log(`   ⏸️ 비활성화: ${plan.userName} ${plan.baseGrade} Week ${installment.week}`);
					}
				}

				if (modified) {
					await plan.save();
				}
			}

			console.log(`   ⏸️ 총 ${skippedCount}건 지급계획 비활성화 (보험 조건 미충족)`);
		}

		// 응답 메시지 생성
		let message = '보험 정보가 저장되었습니다.';
		if (activatedCount > 0) {
			message = `보험 가입 처리 완료. ${activatedCount}건의 지급계획이 활성화되었습니다.`;
		} else if (skippedCount > 0) {
			message = `보험 조건 미충족. ${skippedCount}건의 지급계획이 중단되었습니다.`;
		}

		return json({
			success: true,
			user: {
				_id: user._id,
				name: user.name,
				grade: user.grade,
				insuranceAmount: user.insuranceAmount,
				insuranceDate: user.insuranceDate,
				insuranceActive: user.insuranceActive
			},
			activatedPlans: activatedCount,
			skippedPlans: skippedCount,
			message
		});
	} catch (error) {
		console.error('보험 가입 처리 오류:', error);
		return json({ error: '보험 가입 처리 중 오류가 발생했습니다.' }, { status: 500 });
	}
}

/**
 * 사용자 보험 정보 조회
 */
export async function GET({ url, locals }) {
	if (!locals.user || !locals.user.isAdmin) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	await db();

	try {
		const userId = url.searchParams.get('userId');
		if (!userId) {
			return json({ error: 'userId is required' }, { status: 400 });
		}

		const user = await User.findById(userId).select('name grade insuranceAmount insuranceDate insuranceActive');
		if (!user) {
			return json({ error: 'User not found' }, { status: 404 });
		}

		// 등급별 필요 금액
		const gradeLimit = GRADE_LIMITS[user.grade];

		return json({
			user: {
				_id: user._id,
				name: user.name,
				grade: user.grade,
				insuranceAmount: user.insuranceAmount || 0,
				insuranceDate: user.insuranceDate,
				insuranceActive: user.insuranceActive || false
			},
			requirement: {
				required: gradeLimit?.insuranceRequired || false,
				amount: gradeLimit?.insuranceAmount || 0
			}
		});
	} catch (error) {
		console.error('보험 정보 조회 오류:', error);
		return json({ error: '보험 정보 조회 중 오류가 발생했습니다.' }, { status: 500 });
	}
}
