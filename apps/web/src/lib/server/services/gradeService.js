import User from '../models/User.js';
import TreeStats from '../models/TreeStats.js';
import PaymentScheduler from './paymentScheduler.js';
import { connectDB } from '../db.js';

/**
 * 등급 관리 서비스
 * 등급 계산, 업데이트, 지급 제한 관리
 */
class GradeService {
	/**
	 * 사용자의 등급을 업데이트하고 필요시 지급 카운터를 리셋
	 */
	static async updateUserGrade(userId) {
		await connectDB();

		try {
			// TreeStats에서 최신 등급 계산
			const treeStats = await TreeStats.findOne({ userId });
			if (!treeStats) {
				console.log(`[GradeService] TreeStats not found for user ${userId}`);
				return null;
			}

			// 등급 계산
			const newGrade = await treeStats.calculateGrade();

			// User 모델에서 현재 등급 확인
			const user = await User.findById(userId);
			if (!user) {
				console.log(`[GradeService] User not found: ${userId}`);
				return null;
			}

			const previousGrade = user.grade;

			// 등급이 변경된 경우
			if (previousGrade !== newGrade) {
				console.log(`[GradeService] 등급 변경 감지: ${user.name}(${user.loginId}) ${previousGrade} → ${newGrade}`);

				// 등급 업데이트
				user.grade = newGrade;
				user.lastGradeChangeDate = new Date();

				// 지급 카운터 리셋
				user.gradePaymentCount = 0;

				// F3 이상으로 승급한 경우 연속 주차 카운터도 리셋
				if (['F3', 'F4', 'F5', 'F6', 'F7', 'F8'].includes(newGrade)) {
					user.consecutiveGradeWeeks = 0;
				}

				await user.save();

				console.log(`[GradeService] ${user.name}(${user.loginId}) 등급 업데이트 완료:`, {
					이전등급: previousGrade,
					신규등급: newGrade,
					지급카운터: user.gradePaymentCount,
					연속주차: user.consecutiveGradeWeeks
				});

				return {
					userId: user._id,
					loginId: user.loginId,
					name: user.name,
					previousGrade,
					newGrade,
					changed: true
				};
			}

			return {
				userId: user._id,
				loginId: user.loginId,
				name: user.name,
				grade: newGrade,
				changed: false
			};

		} catch (error) {
			console.error('[GradeService] 등급 업데이트 오류:', error);
			throw error;
		}
	}

	/**
	 * 전체 사용자 등급 업데이트
	 */
	static async updateAllUserGrades() {
		await connectDB();

		console.log('[GradeService] 전체 사용자 등급 업데이트 시작');

		const users = await User.find({ type: 'user', status: 'active' });
		const results = {
			total: users.length,
			updated: 0,
			failed: 0,
			changes: []
		};

		for (const user of users) {
			try {
				const result = await this.updateUserGrade(user._id);
				if (result && result.changed) {
					results.updated++;
					results.changes.push(result);
				}
			} catch (error) {
				console.error(`[GradeService] 사용자 ${user.loginId} 등급 업데이트 실패:`, error);
				results.failed++;
			}
		}

		console.log('[GradeService] 전체 등급 업데이트 완료:', results);
		return results;
	}

	/**
	 * 사용자의 지급 자격 확인
	 */
	static async checkPaymentEligibility(userId) {
		const user = await User.findById(userId);
		if (!user) return { eligible: false, reason: '사용자를 찾을 수 없습니다.' };

		// 등급별 최대 지급 횟수 확인
		const paymentLimit = PaymentScheduler.GRADE_LIMITS[user.grade];
		if (user.gradePaymentCount >= paymentLimit) {
			return {
				eligible: false,
				reason: `등급 ${user.grade}의 최대 지급 횟수(${paymentLimit}회)에 도달했습니다.`
			};
		}

		// F1, F2의 연속 4주 제한 확인
		if (['F1', 'F2'].includes(user.grade)) {
			if (user.consecutiveGradeWeeks >= 4) {
				return {
					eligible: false,
					reason: `등급 ${user.grade}의 연속 4주 지급 제한에 도달했습니다.`
				};
			}
		}

		// F3 이상 등급의 보험 조건 확인
		if (['F3', 'F4', 'F5', 'F6', 'F7', 'F8'].includes(user.grade)) {
			const requiredInsurance = PaymentScheduler.INSURANCE_REQUIREMENTS[user.grade];

			if (!user.insuranceActive) {
				return {
					eligible: false,
					reason: `등급 ${user.grade}은 보험 유지가 필요합니다.`
				};
			}

			if (user.insuranceAmount < requiredInsurance) {
				return {
					eligible: false,
					reason: `등급 ${user.grade}의 최소 보험금액(${requiredInsurance}원)을 충족하지 못합니다. (현재: ${user.insuranceAmount}원)`
				};
			}
		}

		return {
			eligible: true,
			grade: user.grade,
			paymentCount: user.gradePaymentCount,
			paymentLimit: paymentLimit,
			remainingPayments: paymentLimit - user.gradePaymentCount
		};
	}

	/**
	 * 보험 상태 업데이트
	 */
	static async updateInsuranceStatus(userId, insuranceActive, insuranceAmount = 0) {
		const user = await User.findById(userId);
		if (!user) throw new Error('사용자를 찾을 수 없습니다.');

		const previousStatus = {
			active: user.insuranceActive,
			amount: user.insuranceAmount
		};

		user.insuranceActive = insuranceActive;
		user.insuranceAmount = insuranceAmount;

		// 보험이 재활성화된 경우, 지급 카운터는 유지
		if (!previousStatus.active && insuranceActive) {
			console.log(`[GradeService] ${user.name}(${user.loginId}) 보험 재활성화 - 지급 카운터 유지: ${user.gradePaymentCount}`);
		}

		// 보험이 비활성화된 경우
		if (previousStatus.active && !insuranceActive) {
			console.log(`[GradeService] ${user.name}(${user.loginId}) 보험 비활성화 - F3 이상 등급은 지급 제외됨`);
		}

		await user.save();

		return {
			userId: user._id,
			loginId: user.loginId,
			name: user.name,
			grade: user.grade,
			insuranceActive,
			insuranceAmount,
			previousStatus
		};
	}

	/**
	 * 등급별 통계 조회
	 */
	static async getGradeStatistics() {
		const stats = {};
		const grades = ['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8'];

		for (const grade of grades) {
			const users = await User.find({ grade, type: 'user', status: 'active' });

			const eligible = [];
			const ineligible = [];

			for (const user of users) {
				const eligibility = await this.checkPaymentEligibility(user._id);
				if (eligibility.eligible) {
					eligible.push({
						loginId: user.loginId,
						name: user.name,
						remainingPayments: eligibility.remainingPayments
					});
				} else {
					ineligible.push({
						loginId: user.loginId,
						name: user.name,
						reason: eligibility.reason
					});
				}
			}

			stats[grade] = {
				total: users.length,
				eligible: eligible.length,
				ineligible: ineligible.length,
				paymentLimit: PaymentScheduler.GRADE_LIMITS[grade],
				insuranceRequired: PaymentScheduler.INSURANCE_REQUIREMENTS[grade] || 0,
				details: {
					eligible,
					ineligible
				}
			};
		}

		return stats;
	}
}

export default GradeService;