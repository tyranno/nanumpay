import User from '../models/User.js';

/**
 * 서브트리의 모든 등급 수집 (DFS)
 * @param {String} userId - 사용자 loginId
 * @returns {Object} 등급별 개수
 */
async function collectSubtreeGrades(userId) {
  const grades = { F1: 0, F2: 0, F3: 0, F4: 0, F5: 0, F6: 0, F7: 0, F8: 0 };

  if (!userId) return grades;

  const user = await User.findOne({ loginId: userId });
  if (!user) return grades;

  // 현재 노드의 등급 추가
  if (user.grade && grades.hasOwnProperty(user.grade)) {
    grades[user.grade]++;
  }

  // 좌측 자식의 서브트리 등급 수집
  if (user.leftChildId) {
    const leftGrades = await collectSubtreeGrades(user.leftChildId);
    for (const grade in leftGrades) {
      grades[grade] += leftGrades[grade];
    }
  }

  // 우측 자식의 서브트리 등급 수집
  if (user.rightChildId) {
    const rightGrades = await collectSubtreeGrades(user.rightChildId);
    for (const grade in rightGrades) {
      grades[grade] += rightGrades[grade];
    }
  }

  return grades;
}

/**
 * 사용자의 등급 계산 (하위 트리 구조 기반)
 * @param {String} userId - 사용자 loginId
 * @returns {String} 계산된 등급
 */
export async function calculateGradeForUser(userId) {
  const user = await User.findOne({ loginId: userId });
  if (!user) return 'F1';

  // 직속 자식 확인
  const leftChild = await User.findOne({ parentId: userId, position: 'L' });
  const rightChild = await User.findOne({ parentId: userId, position: 'R' });

  // F1: 자식이 없거나 하나인 경우
  if (!leftChild || !rightChild) {
    return 'F1';
  }

  // 좌우 서브트리의 등급 분포 수집
  const leftGrades = await collectSubtreeGrades(leftChild.loginId);
  const rightGrades = await collectSubtreeGrades(rightChild.loginId);

  // F8 체크: 좌우 서브트리의 F7이 최소 2:1 조건
  const totalF7 = leftGrades.F7 + rightGrades.F7;
  if (totalF7 >= 3) {
    if ((leftGrades.F7 >= 2 && rightGrades.F7 >= 1) ||
        (leftGrades.F7 >= 1 && rightGrades.F7 >= 2)) {
      return 'F8';
    }
  }

  // F7 체크: 좌우 서브트리의 F6이 최소 2:1 조건
  const totalF6 = leftGrades.F6 + rightGrades.F6;
  if (totalF6 >= 3) {
    if ((leftGrades.F6 >= 2 && rightGrades.F6 >= 1) ||
        (leftGrades.F6 >= 1 && rightGrades.F6 >= 2)) {
      return 'F7';
    }
  }

  // F6 체크: 좌우 서브트리의 F5가 최소 2:1 조건
  const totalF5 = leftGrades.F5 + rightGrades.F5;
  if (totalF5 >= 3) {
    if ((leftGrades.F5 >= 2 && rightGrades.F5 >= 1) ||
        (leftGrades.F5 >= 1 && rightGrades.F5 >= 2)) {
      return 'F6';
    }
  }

  // F5 체크: 좌우 서브트리의 F4가 최소 2:1 조건
  const totalF4 = leftGrades.F4 + rightGrades.F4;
  if (totalF4 >= 3) {
    if ((leftGrades.F4 >= 2 && rightGrades.F4 >= 1) ||
        (leftGrades.F4 >= 1 && rightGrades.F4 >= 2)) {
      return 'F5';
    }
  }

  // F4 체크: 좌우 서브트리에 각각 최소 1개의 F3
  if (leftGrades.F3 >= 1 && rightGrades.F3 >= 1) {
    return 'F4';
  }

  // F3 체크: 좌우 서브트리에 각각 최소 1개의 F2
  if (leftGrades.F2 >= 1 && rightGrades.F2 >= 1) {
    return 'F3';
  }

  // F2: 좌우 자식이 모두 있는 경우 (기본)
  return 'F2';
}

/**
 * 모든 사용자의 등급 재계산 (리프 노드부터 상향식)
 */
export async function recalculateAllGrades() {
  console.log('등급 재계산 시작...');

  // 모든 용역자(User) 가져오기 - Admin은 별도 컬렉션이므로 제외
  const users = await User.find({ type: 'user' }).sort({ createdAt: 1 });

  // 트리 레벨별로 정렬하기 위한 맵 생성
  const levelMap = new Map();
  const userMap = new Map();

  // 사용자 맵 생성
  for (const user of users) {
    userMap.set(user.loginId, user);
  }

  // 각 사용자의 레벨 계산 (루트로부터의 거리)
  async function calculateLevel(userId, level = 0) {
    if (!levelMap.has(userId)) {
      levelMap.set(userId, level);

      const user = userMap.get(userId);
      if (user) {
        if (user.leftChildId) {
          await calculateLevel(user.leftChildId, level + 1);
        }
        if (user.rightChildId) {
          await calculateLevel(user.rightChildId, level + 1);
        }
      }
    }
  }

  // 루트 노드들부터 레벨 계산
  const roots = users.filter(u => !u.parentId || u.parentId === '관리자');
  for (const root of roots) {
    await calculateLevel(root.loginId, 0);
  }

  // 레벨별로 사용자 그룹화 (높은 레벨부터 = 리프 노드부터)
  const levelGroups = new Map();
  for (const [userId, level] of levelMap) {
    if (!levelGroups.has(level)) {
      levelGroups.set(level, []);
    }
    levelGroups.get(level).push(userId);
  }

  // 레벨 내림차순 정렬 (리프 노드부터)
  const sortedLevels = Array.from(levelGroups.keys()).sort((a, b) => b - a);

  let updatedCount = 0;

  // 리프 노드부터 상향식으로 등급 계산
  for (const level of sortedLevels) {
    const userIds = levelGroups.get(level);
    console.log(`레벨 ${level}: ${userIds.length}명 처리 중...`);

    for (const userId of userIds) {
      const user = userMap.get(userId);
      if (!user) continue;

      const oldGrade = user.grade;
      const newGrade = await calculateGradeForUser(user.loginId);

      if (oldGrade !== newGrade) {
        await User.findByIdAndUpdate(user._id, { grade: newGrade });
        user.grade = newGrade; // 맵에서도 업데이트
        updatedCount++;
        console.log(`  등급 변경: ${user.name} (${user.loginId}): ${oldGrade} → ${newGrade}`);
      }
    }
  }

  // 관리자는 이미 위에서 처리됨

  console.log(`총 ${updatedCount}명의 등급이 업데이트되었습니다.`);

  // 최종 등급 분포 출력
  const finalGrades = await User.aggregate([
    { $group: { _id: '$grade', count: { $sum: 1 } } },
    { $sort: { _id: 1 } }
  ]);

  console.log('\n최종 등급 분포:');
  for (const g of finalGrades) {
    console.log(`${g._id}: ${g.count}명`);
  }

  return updatedCount;
}

/**
 * 부모 노드의 등급 업데이트
 * 자식이 추가되었을 때 호출
 */
export async function updateParentGrade(parentId) {
  if (!parentId || parentId === '관리자') return;

  const parent = await User.findOne({ loginId: parentId });

  if (!parent) return;

  const oldGrade = parent.grade;
  const newGrade = await calculateGradeForUser(parent.loginId);

  if (oldGrade !== newGrade) {
    parent.grade = newGrade;
    await parent.save();
    console.log(`부모 등급 업데이트: ${parent.name}: ${oldGrade} → ${newGrade}`);

    // 부모의 부모도 확인 (연쇄 작용)
    if (parent.parentId && parent.parentId !== '관리자') {
      await updateParentGrade(parent.parentId);
    }
  }
}