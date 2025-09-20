import User from '../models/User.js';

/**
 * 사용자의 등급 계산
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

  // F2: 좌우 자식이 모두 있는 경우 (기본)
  // 더 복잡한 등급 계산 로직은 요구사항에 따라 추가 가능
  return 'F2';
}

/**
 * 모든 사용자의 등급 재계산
 */
export async function recalculateAllGrades() {
  const users = await User.find({ type: { $ne: 'admin' } });
  
  let updatedCount = 0;
  for (const user of users) {
    const oldGrade = user.grade;
    const newGrade = await calculateGradeForUser(user.loginId);
    
    if (oldGrade !== newGrade) {
      await User.findByIdAndUpdate(user._id, { grade: newGrade });
      updatedCount++;
      console.log(`등급 변경: ${user.name} (${user.loginId}): ${oldGrade} → ${newGrade}`);
    }
  }
  
  console.log(`총 ${updatedCount}명의 등급이 업데이트되었습니다.`);
  return updatedCount;
}

/**
 * 부모 노드의 등급 업데이트
 * 자식이 추가되었을 때 호출
 */
export async function updateParentGrade(parentId) {
  if (!parentId) return;
  
  const parent = await User.findOne({ 
    $or: [
      { loginId: parentId },
      { _id: parentId }
    ]
  });
  
  if (!parent) return;
  
  const oldGrade = parent.grade;
  const newGrade = await calculateGradeForUser(parent.loginId);
  
  if (oldGrade !== newGrade) {
    parent.grade = newGrade;
    await parent.save();
    console.log(`부모 등급 업데이트: ${parent.name}: ${oldGrade} → ${newGrade}`);
    
    // 부모의 부모도 확인 (연쇄 작용)
    if (parent.parentId) {
      await updateParentGrade(parent.parentId);
    }
  }
}