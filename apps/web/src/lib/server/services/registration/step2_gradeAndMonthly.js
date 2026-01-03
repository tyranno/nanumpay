/**
 * Step 2: 등급 재계산 및 월별 인원 관리 ⭐ 핵심
 *
 * 역할:
 * 1. 전체 사용자 등급 재계산
 * 2. 승급자 추출
 * 3. 월별 인원 관리 (MonthlyRegistrations)
 * 4. 매출 계산 (등록자 수 × 1,000,000)
 */

import { recalculateAllGrades } from '../gradeCalculation.js';
import MonthlyRegistrations from '../../models/MonthlyRegistrations.js';
import User from '../../models/User.js';
import PlannerCommission from '../../models/PlannerCommission.js';
import PlannerCommissionPlan from '../../models/PlannerCommissionPlan.js';
import PlannerAccount from '../../models/PlannerAccount.js';
import SystemConfig from '../../models/SystemConfig.js';

// ============================================
// 승급일 계산 함수들 (등급별 직접 계산 방식)
// ============================================

/**
 * 사용자 맵 생성 (userId -> user 객체)
 */
function buildUserMap(allUsers) {
	const userMap = new Map();
	for (const u of allUsers) {
		userMap.set(u._id.toString(), u);
	}
	return userMap;
}

/**
 * 사용자의 등록일 가져오기
 */
function getRegDate(userId, userMap) {
	const user = userMap.get(userId?.toString());
	if (!user) return null;
	return user.registrationDate || user.createdAt;
}

/**
 * F2 조건 충족일: 좌우 자식이 모두 존재하게 된 시점
 * = MAX(왼쪽 자식 등록일, 오른쪽 자식 등록일)
 */
function getF2Date(userId, userMap) {
	const user = userMap.get(userId?.toString());
	if (!user) return null;
	if (!user.leftChildId || !user.rightChildId) return null;
	
	const leftDate = getRegDate(user.leftChildId, userMap);
	const rightDate = getRegDate(user.rightChildId, userMap);
	
	if (!leftDate || !rightDate) return null;
	return new Date(Math.max(leftDate.getTime(), rightDate.getTime()));
}

/**
 * 서브트리에서 특정 등급 조건이 처음 충족된 날짜 찾기
 */
function findFirstGradeDateInSubtree(subtreeRootId, targetGrade, userMap) {
	if (!subtreeRootId) return null;
	
	let earliest = null;
	
	function traverse(nodeId) {
		if (!nodeId) return;
		const nodeIdStr = nodeId.toString();
		const node = userMap.get(nodeIdStr);
		if (!node) return;
		
		// 이 노드의 등급 달성일 계산
		let gradeDate = null;
		if (targetGrade === 'F2') {
			gradeDate = getF2Date(nodeIdStr, userMap);
		} else if (targetGrade === 'F3') {
			gradeDate = getF3Date(nodeIdStr, userMap);
		} else if (targetGrade === 'F4') {
			gradeDate = getF4Date(nodeIdStr, userMap);
		}
		
		if (gradeDate && (!earliest || gradeDate < earliest)) {
			earliest = gradeDate;
		}
		
		// 자식 노드 순회
		traverse(node.leftChildId);
		traverse(node.rightChildId);
	}
	
	traverse(subtreeRootId);
	return earliest;
}

/**
 * F3 조건 충족일: 좌우 서브트리에 각각 F2+가 존재하게 된 시점
 * = MAX(왼쪽 서브트리 첫 F2 달성일, 오른쪽 서브트리 첫 F2 달성일)
 */
function getF3Date(userId, userMap) {
	const user = userMap.get(userId?.toString());
	if (!user) return null;
	if (!user.leftChildId || !user.rightChildId) return null;
	
	const leftF2 = findFirstGradeDateInSubtree(user.leftChildId, 'F2', userMap);
	const rightF2 = findFirstGradeDateInSubtree(user.rightChildId, 'F2', userMap);
	
	if (!leftF2 || !rightF2) return null;
	return new Date(Math.max(leftF2.getTime(), rightF2.getTime()));
}

/**
 * F4 조건 충족일: 좌우 서브트리에 각각 F3+가 존재하게 된 시점
 * = MAX(왼쪽 서브트리 첫 F3 달성일, 오른쪽 서브트리 첫 F3 달성일)
 */
function getF4Date(userId, userMap) {
	const user = userMap.get(userId?.toString());
	if (!user) return null;
	if (!user.leftChildId || !user.rightChildId) return null;
	
	const leftF3 = findFirstGradeDateInSubtree(user.leftChildId, 'F3', userMap);
	const rightF3 = findFirstGradeDateInSubtree(user.rightChildId, 'F3', userMap);
	
	if (!leftF3 || !rightF3) return null;
	return new Date(Math.max(leftF3.getTime(), rightF3.getTime()));
}

/**
 * 서브트리에서 F4 달성 노드들의 달성일 수집
 */
function collectF4DatesInSubtree(subtreeRootId, userMap) {
	const results = [];
	
	function traverse(nodeId) {
		if (!nodeId) return;
		const nodeIdStr = nodeId.toString();
		const node = userMap.get(nodeIdStr);
		if (!node) return;
		
		const f4Date = getF4Date(nodeIdStr, userMap);
		if (f4Date) {
			results.push(f4Date);
		}
		
		traverse(node.leftChildId);
		traverse(node.rightChildId);
	}
	
	traverse(subtreeRootId);
	results.sort((a, b) => a.getTime() - b.getTime());
	return results;
}

/**
 * F5 조건 충족일: 좌우 서브트리에 F4+가 3개 이상 (2:1 분포)
 */
function getF5Date(userId, userMap) {
	const user = userMap.get(userId?.toString());
	if (!user) return null;
	if (!user.leftChildId || !user.rightChildId) return null;
	
	const leftF4s = collectF4DatesInSubtree(user.leftChildId, userMap);
	const rightF4s = collectF4DatesInSubtree(user.rightChildId, userMap);
	
	// 조건: 좌우 합쳐서 3개 이상, 2:1 분포
	// L>=2, R>=1 또는 L>=1, R>=2
	if (leftF4s.length >= 2 && rightF4s.length >= 1) {
		// 왼쪽 2번째, 오른쪽 1번째 중 늦은 날짜
		return new Date(Math.max(leftF4s[1].getTime(), rightF4s[0].getTime()));
	} else if (leftF4s.length >= 1 && rightF4s.length >= 2) {
		// 왼쪽 1번째, 오른쪽 2번째 중 늦은 날짜
		return new Date(Math.max(leftF4s[0].getTime(), rightF4s[1].getTime()));
	}
	
	return null;
}

/**
 * 서브트리에서 F5 달성 노드들의 달성일 수집
 */
function collectF5DatesInSubtree(subtreeRootId, userMap) {
	const results = [];
	
	function traverse(nodeId) {
		if (!nodeId) return;
		const nodeIdStr = nodeId.toString();
		const node = userMap.get(nodeIdStr);
		if (!node) return;
		
		const f5Date = getF5Date(nodeIdStr, userMap);
		if (f5Date) {
			results.push(f5Date);
		}
		
		traverse(node.leftChildId);
		traverse(node.rightChildId);
	}
	
	traverse(subtreeRootId);
	results.sort((a, b) => a.getTime() - b.getTime());
	return results;
}

/**
 * F6 조건 충족일: 좌우 서브트리에 F5+가 3개 이상 (2:1 분포)
 */
function getF6Date(userId, userMap) {
	const user = userMap.get(userId?.toString());
	if (!user) return null;
	if (!user.leftChildId || !user.rightChildId) return null;
	
	const leftF5s = collectF5DatesInSubtree(user.leftChildId, userMap);
	const rightF5s = collectF5DatesInSubtree(user.rightChildId, userMap);
	
	if (leftF5s.length >= 2 && rightF5s.length >= 1) {
		return new Date(Math.max(leftF5s[1].getTime(), rightF5s[0].getTime()));
	} else if (leftF5s.length >= 1 && rightF5s.length >= 2) {
		return new Date(Math.max(leftF5s[0].getTime(), rightF5s[1].getTime()));
	}
	
	return null;
}

/**
 * 서브트리에서 F6 달성 노드들의 달성일 수집
 */
function collectF6DatesInSubtree(subtreeRootId, userMap) {
	const results = [];
	
	function traverse(nodeId) {
		if (!nodeId) return;
		const nodeIdStr = nodeId.toString();
		const node = userMap.get(nodeIdStr);
		if (!node) return;
		
		const f6Date = getF6Date(nodeIdStr, userMap);
		if (f6Date) {
			results.push(f6Date);
		}
		
		traverse(node.leftChildId);
		traverse(node.rightChildId);
	}
	
	traverse(subtreeRootId);
	results.sort((a, b) => a.getTime() - b.getTime());
	return results;
}

/**
 * F7 조건 충족일: 좌우 서브트리에 F6+가 3개 이상 (2:1 분포)
 */
function getF7Date(userId, userMap) {
	const user = userMap.get(userId?.toString());
	if (!user) return null;
	if (!user.leftChildId || !user.rightChildId) return null;
	
	const leftF6s = collectF6DatesInSubtree(user.leftChildId, userMap);
	const rightF6s = collectF6DatesInSubtree(user.rightChildId, userMap);
	
	if (leftF6s.length >= 2 && rightF6s.length >= 1) {
		return new Date(Math.max(leftF6s[1].getTime(), rightF6s[0].getTime()));
	} else if (leftF6s.length >= 1 && rightF6s.length >= 2) {
		return new Date(Math.max(leftF6s[0].getTime(), rightF6s[1].getTime()));
	}
	
	return null;
}

/**
 * 서브트리에서 F7 달성 노드들의 달성일 수집
 */
function collectF7DatesInSubtree(subtreeRootId, userMap) {
	const results = [];
	
	function traverse(nodeId) {
		if (!nodeId) return;
		const nodeIdStr = nodeId.toString();
		const node = userMap.get(nodeIdStr);
		if (!node) return;
		
		const f7Date = getF7Date(nodeIdStr, userMap);
		if (f7Date) {
			results.push(f7Date);
		}
		
		traverse(node.leftChildId);
		traverse(node.rightChildId);
	}
	
	traverse(subtreeRootId);
	results.sort((a, b) => a.getTime() - b.getTime());
	return results;
}

/**
 * F8 조건 충족일: 좌우 서브트리에 F7+가 3개 이상 (2:1 분포)
 */
function getF8Date(userId, userMap) {
	const user = userMap.get(userId?.toString());
	if (!user) return null;
	if (!user.leftChildId || !user.rightChildId) return null;
	
	const leftF7s = collectF7DatesInSubtree(user.leftChildId, userMap);
	const rightF7s = collectF7DatesInSubtree(user.rightChildId, userMap);
	
	if (leftF7s.length >= 2 && rightF7s.length >= 1) {
		return new Date(Math.max(leftF7s[1].getTime(), rightF7s[0].getTime()));
	} else if (leftF7s.length >= 1 && rightF7s.length >= 2) {
		return new Date(Math.max(leftF7s[0].getTime(), rightF7s[1].getTime()));
	}
	
	return null;
}

/**
 * 승급일 계산 메인 함수
 * @param {String} userId - 사용자 ID
 * @param {String} newGrade - 새 등급 (F2~F8)
 * @param {Map} userMap - 사용자 맵
 * @returns {Date|null} 승급일
 */
function calculatePromotionDate(userId, newGrade, userMap) {
	switch (newGrade) {
		case 'F2': return getF2Date(userId, userMap);
		case 'F3': return getF3Date(userId, userMap);
		case 'F4': return getF4Date(userId, userMap);
		case 'F5': return getF5Date(userId, userMap);
		case 'F6': return getF6Date(userId, userMap);
		case 'F7': return getF7Date(userId, userMap);
		case 'F8': return getF8Date(userId, userMap);
		default: return null;
	}
}

// ============================================

/**
 * Step 2 실행
 *
 * @param {Array} users - 이번 배치 등록자 배열 (User 모델)
 * @returns {Promise<Object>} { promoted, monthlyReg, registrationMonth }
 */
export async function executeStep2(users) {
	// 2-1. 귀속월 먼저 파악 (승급일 계산에 필요)
	const registrationMonth = MonthlyRegistrations.generateMonthKey(
		users[0]?.registrationDate || users[0]?.createdAt || new Date()
	);

	// 2-2. 등급 재계산 (전체 사용자)
	const gradeChangeResult = await recalculateAllGrades();
	const changedUsers = gradeChangeResult.changedUsers || [];

	// 승급자 필터링 (등급 상승한 사람들)
	const promotedRaw = changedUsers.filter((u) => {
		return u.changeType === 'grade_change' && u.oldGrade && u.newGrade && u.oldGrade < u.newGrade;
	});

	// ⭐ 디버깅: promotedRaw 확인
	console.log(`\n🔍 changedUsers: ${changedUsers.length}건`);
	console.log(`🔍 promotedRaw: ${promotedRaw.length}건`);
	if (promotedRaw.length > 0 && promotedRaw.length <= 25) {
		console.log('🔍 promotedRaw 내용:');
		promotedRaw.forEach((p, idx) => {
			console.log(`  ${idx + 1}. ${p.userName} (userId: ${p.userId?.substring(0, 8)}...) ${p.oldGrade} → ${p.newGrade}`);
		});
	}

		// ⭐ v9.0 수정: 등급별 직접 계산 방식으로 승급일 계산
	// 모든 사용자 데이터 로드하여 userMap 생성
	const allUsers = await User.find({}).lean();
	const userMap = buildUserMap(allUsers);
	
	const promotedMap = new Map();
	// ⭐ v9.1: 모든 중간 단계 승급 기록 (gradeHistory용)
	const allPromotionSteps = [];

	for (const p of promotedRaw) {
		// ⭐ 등급별 조건이 처음 충족된 날짜 계산
		let promotionDate = calculatePromotionDate(p.userId, p.newGrade, userMap);

		// fallback: 계산 실패 시 배치 내 첫 등록일 사용
		if (!promotionDate) {
			const registrationDates = users.map(u => u.registrationDate || u.createdAt).filter(d => d);
			promotionDate = registrationDates.length > 0 ? registrationDates[0] : new Date();
			console.log(`    ⚠️ ${p.userName}: 승급일 계산 실패, fallback 사용`);
		}

		// ⭐ 모든 중간 단계 기록 (gradeHistory용)
		allPromotionSteps.push({
			userId: p.userId,
			userName: p.userName,
			oldGrade: p.oldGrade,
			newGrade: p.newGrade,
			promotionDate: promotionDate
		});

		if (!promotedMap.has(p.userId)) {
			// 첫 승급 기록
			promotedMap.set(p.userId, {
				userId: p.userId,
				userName: p.userName,
				changeType: p.changeType,
				oldGrade: p.oldGrade,  // 최초 등급
				newGrade: p.newGrade,  // 현재 등급 (계속 업데이트됨)
				promotionDate: promotionDate  // ⭐ 하위 노드 등록일 기준
			});
		} else {
			// 이미 있으면 newGrade만 업데이트 (oldGrade, promotionDate는 최초값 유지)
			const existing = promotedMap.get(p.userId);
			console.log(`    🔄 다단계 승급 감지: ${p.userName} (${existing.oldGrade} → ${existing.newGrade} → ${p.newGrade})`);
			existing.newGrade = p.newGrade;
		}
	}
	const promoted = Array.from(promotedMap.values());

	// ⭐ 디버깅: 최종 promoted 배열 확인
	console.log(`\n📊 Step2 승급자 처리 결과:`);
	console.log(`  - 원본 승급 이벤트: ${promotedRaw.length}건`);
	console.log(`  - 최종 승급자: ${promoted.length}명`);
	if (promoted.length > 0 && promoted.length < 10) {
		promoted.forEach(p => {
			console.log(`    → ${p.userName}: ${p.oldGrade} → ${p.newGrade} (승급일: ${p.promotionDate.toISOString().split('T')[0]})`);
		});
	}

	// 2-3. 월별 등록자 관리 (MonthlyRegistrations)
	let monthlyReg = await MonthlyRegistrations.findOne({ monthKey: registrationMonth });

	if (!monthlyReg) {
		// 해당 월 최초 등록 (스키마 default 값 사용)
		monthlyReg = new MonthlyRegistrations({ monthKey: registrationMonth });
	}

	// 2-4. 이번 배치 등록자 추가
	for (const user of users) {
		const userIdStr = user._id.toString(); // ⭐ v8.0: _id 사용

		// 승급 여부 확인
		const promotion = promoted.find((p) => p.userId === userIdStr);
		const currentGrade = promotion ? promotion.newGrade : 'F1';

		// ⭐ v8.0: 신규 등록자 gradeHistory 기록
		const registrationDate = user.registrationDate || user.createdAt;
		const userDoc = await User.findById(userIdStr);
		if (userDoc && (!userDoc.gradeHistory || userDoc.gradeHistory.length === 0)) {
			// 첫 등록: registration 기록 추가
			await User.findByIdAndUpdate(userIdStr, {
				$push: {
					gradeHistory: {
						date: registrationDate,
						fromGrade: null,
						toGrade: 'F1',  // 등록 시 항상 F1부터
						type: 'registration',
						revenueMonth: registrationMonth
					}
				}
			});
			console.log(`    📝 등록 기록: ${user.name} → F1 (${registrationMonth})`);
		}

		// position 값 변환 (L/R/ROOT → left/right/root)
		let positionValue = user.position;
		if (positionValue === 'L') positionValue = 'left';
		else if (positionValue === 'R') positionValue = 'right';
		else if (positionValue === 'ROOT') positionValue = 'root';

		// 기존 등록자 확인
		const existingIdx = monthlyReg.registrations.findIndex((r) => r.userId === userIdStr);

		if (existingIdx >= 0) {
			// ⭐ 이미 등록되어 있으면 등급만 업데이트 (승급 시)
			if (promotion) {
				monthlyReg.registrations[existingIdx].grade = currentGrade;
			}
		} else {
			// 신규 등록
			monthlyReg.registrations.push({
				userId: userIdStr, // ⭐ v8.0: _id 사용
				userName: user.name,
				registrationDate: user.registrationDate || user.createdAt,
				grade: currentGrade, // 현재 등급 (승급 후)
				position: positionValue
			});
			monthlyReg.registrationCount++;
		}
	}

	// ⭐ 2-4-2. 기존 등록자 중 승급자 등급 업데이트 (users 배열에 없는 경우)
	for (const prom of promoted) {
		const existingIdx = monthlyReg.registrations.findIndex((r) => r.userId === prom.userId);
		if (existingIdx >= 0) {
			// users 배열에 있는 경우는 위에서 이미 처리됨
			const isInUsers = users.find((u) => u._id.toString() === prom.userId); // ⭐ v8.0: _id 사용
			if (!isInUsers) {
				monthlyReg.registrations[existingIdx].grade = prom.newGrade;
			}
		}
	}

	// 2-5. 매출 업데이트 (⭐ v8.0: 각 등록자의 100만원 × ratio 합산)
	// 등록자들의 ratio를 조회하여 매출 계산
	let totalRevenue = 0;
	for (const reg of monthlyReg.registrations) {
		const userDoc = await User.findById(reg.userId);
		const ratio = userDoc?.ratio ?? 1;
		totalRevenue += Math.floor(1000000 * ratio);
	}
	monthlyReg.totalRevenue = totalRevenue;

	// 2-6. 승급자 수 계산 (이번 달 등록자 중 승급한 사람)
	const registrantIds = monthlyReg.registrations.map((r) => r.userId);
	const promotedThisMonth = promoted.filter((p) => registrantIds.includes(p.userId));
	monthlyReg.promotedCount = promotedThisMonth.length;

	// 2-7. 미승급자 수 계산 (이번 달 등록자 중 승급 안 한 사람)
	monthlyReg.nonPromotedCount = monthlyReg.registrationCount - monthlyReg.promotedCount;

	// ⭐ 2-7-2. 승급자 lastGradeChangeDate 및 gradeHistory 업데이트
	// ⭐ v9.2: 같은 날짜의 승급은 한 줄로 정리 (F1→F2→F3→F4 → F1→F4)
	if (allPromotionSteps.length > 0) {
		// 같은 userId + 같은 날짜끼리 그룹화
		const groupedSteps = new Map();
		for (const step of allPromotionSteps) {
			const dateKey = step.promotionDate.toISOString().split('T')[0];
			const key = `${step.userId}_${dateKey}`;
			
			if (!groupedSteps.has(key)) {
				groupedSteps.set(key, {
					userId: step.userId,
					userName: step.userName,
					promotionDate: step.promotionDate,
					oldGrade: step.oldGrade,  // 첫 번째 oldGrade
					newGrade: step.newGrade   // 마지막 newGrade로 업데이트됨
				});
			} else {
				// 같은 날짜면 newGrade만 업데이트 (마지막 등급)
				groupedSteps.get(key).newGrade = step.newGrade;
			}
		}
		
		const consolidatedSteps = Array.from(groupedSteps.values());
		console.log(`
📅 [Step2-7-2] 승급자 등급 변동 기록 업데이트: ${consolidatedSteps.length}건`);
		
		for (const step of consolidatedSteps) {
			await User.findByIdAndUpdate(step.userId, {
				$push: {
					gradeHistory: {
						date: step.promotionDate,
						fromGrade: step.oldGrade,
						toGrade: step.newGrade,
						type: 'promotion',
						revenueMonth: registrationMonth
					}
				}
			});
			console.log(`    → ${step.userName}: ${step.oldGrade} → ${step.newGrade} (승급일: ${step.promotionDate.toISOString().split('T')[0]})`);
		}
	}

	// 2-8. 저장
	await monthlyReg.save();

	// 2-9. 설계사 수당 통계 업데이트
	await updatePlannerCommissions(users, registrationMonth);

	console.log(`\nSTEP2  [${registrationMonth} 월별 인원 현황]`);
	console.log(`  - 전체 등록자: ${monthlyReg.registrationCount}명`);
	// 등록자 이름 출력
	const registrantNames = monthlyReg.registrations.map((r) => r.userName).join(', ');
	console.log(`    → 등록자: ${registrantNames}`);
	console.log(`  - 승급자: ${monthlyReg.promotedCount}명`);
	// 승급자 이름 출력
	if (promoted.length > 0) {
		const promotedNames = promoted.map((p) => p.userName).join(', '); // ⭐ userName 사용
		console.log(`    → 승급자: ${promotedNames}`);
	}
	console.log(`  - 미승급자: ${monthlyReg.nonPromotedCount}명`);
	console.log(`  - 매출: ${monthlyReg.totalRevenue.toLocaleString()}원`);
	console.log('-'.repeat(80));

	return {
		promoted,
		monthlyReg,
		registrationMonth
	};
}

/**
 * 설계사 수당 통계 업데이트
 *
 * @param {Array} users - 이번 배치 등록자 배열
 * @param {string} registrationMonth - 귀속월 (YYYY-MM)
 */
async function updatePlannerCommissions(users, registrationMonth) {
	console.log(`\n💰 [Step2-9] 설계사 수당 개별 지급 계획 생성: ${registrationMonth}`);
	console.log(`  📋 전달된 사용자: ${users.length}명`);

	// 설계사별로 그룹화
	const plannerMap = new Map();

	for (const user of users) {
		if (!user.plannerAccountId) {
			console.log(`  ⚠️ 설계사 정보 없음: ${user.name} (${user._id})`);
			continue;
		}

		// 설계사 정보 조회
		const plannerAccount = await PlannerAccount.findById(user.plannerAccountId);
		const plannerName = plannerAccount ? plannerAccount.name : user.plannerAccountId;
		console.log(`  👤 ${user.name}: 설계사 = ${plannerName}`);

		const plannerIdStr = user.plannerAccountId.toString();

		if (!plannerMap.has(plannerIdStr)) {
			plannerMap.set(plannerIdStr, {
				account: plannerAccount,
				users: []
			});
		}

		plannerMap.get(plannerIdStr).users.push(user);
	}

	console.log(`  📊 설계사 수: ${plannerMap.size}명`);

	// 시스템 설정 로드 (비율 적용 옵션 확인)
	const config = await SystemConfig.getCurrent();
	const useRatioCommission = config.plannerCommissionByRatio ?? false;
	console.log(`  ⚙️  설계사 수당 비율 적용: ${useRatioCommission ? 'ON' : 'OFF'}`);

	// 각 설계사별로 개별 지급 계획 생성
	for (const [plannerIdStr, data] of plannerMap.entries()) {
		const { account: plannerAccount, users: plannerUsers } = data;

		if (!plannerAccount) {
			console.log(`  ⚠️ 설계사 계정 없음: ${plannerIdStr}`);
			continue;
		}

		try {
			// 용역자별로 개별 지급 계획 생성
			for (const user of plannerUsers) {
				const userIdStr = user._id.toString();
				const registrationDate = user.registrationDate || user.createdAt;

				// 중복 확인
				const exists = await PlannerCommissionPlan.findOne({
					plannerAccountId: plannerIdStr,
					userId: userIdStr,
					revenueMonth: registrationMonth
				});

				if (exists) {
					console.log(`  ⏭️  이미 존재: ${plannerAccount.name} ← ${user.name}`);
					continue;
				}

				// 지급일 계산 (등록일 + 1개월 후 금요일)
				const paymentDate = PlannerCommissionPlan.calculatePaymentDate(registrationDate);

				// 비율 계산 (기본값 1)
				const userRatio = user.ratio ?? 1;

				// 수당 계산: 옵션에 따라 고정 10만원 또는 비율 적용
				const baseRevenue = 1000000;
				const baseCommission = 100000;
				const revenue = useRatioCommission ? Math.floor(baseRevenue * userRatio) : baseRevenue;
				const commissionAmount = useRatioCommission ? Math.floor(baseCommission * userRatio) : baseCommission;

				// 개별 지급 계획 생성
				const plan = new PlannerCommissionPlan({
					plannerAccountId: plannerIdStr,
					plannerName: plannerAccount.name,
					userId: userIdStr,
					userName: user.name,
					registrationDate: registrationDate,
					revenueMonth: registrationMonth,
					revenue: revenue,
					commissionAmount: commissionAmount,
					ratio: userRatio,
					paymentDate: paymentDate,
					paymentStatus: 'pending'
				});

				await plan.save();

				const commissionDisplay = commissionAmount.toLocaleString();
				const ratioDisplay = userRatio !== 1 ? ` (비율: ${userRatio})` : '';
				console.log(
					`  ✅ ${plannerAccount.name} ← ${user.name} ` +
					`(수당: ${commissionDisplay}원${ratioDisplay}, 지급일: ${paymentDate.toISOString().split('T')[0]})`
				);
			}

			console.log(`  💰 ${plannerAccount.name} 총 등록: ${plannerUsers.length}명`);

		} catch (error) {
			console.error(`  ❌ 설계사 수당 계획 생성 실패 (${plannerIdStr}):`, error.message);
		}
	}

	console.log(`✅ [Step2-9] 설계사 수당 개별 지급 계획 생성 완료\n`);
}
