// MLM 등급 룰 검증 스크립트
const users = db.users.find({type: 'user'}).toArray();

// 서브트리 등급 수집
function collectSubtreeGrades(loginId) {
  const grades = { F1: 0, F2: 0, F3: 0, F4: 0, F5: 0, F6: 0, F7: 0, F8: 0 };

  function traverse(currentLoginId) {
    const user = users.find(u => u.loginId === currentLoginId);
    if (!user) return;

    grades[user.grade]++;

    const children = users.filter(u => u.parentId === currentLoginId);
    children.forEach(child => traverse(child.loginId));
  }

  traverse(loginId);
  return grades;
}

// 각 사용자의 등급 검증
print('=== 등급 룰 검증 ===');

users.forEach(user => {
  const children = users.filter(u => u.parentId === user.loginId);

  if (children.length === 0) {
    // 말단 노드는 F1이어야 함
    if (user.grade !== 'F1') {
      print(`❌ ${user.name}: 말단노드인데 ${user.grade} (F1이어야 함)`);
    }
    return;
  }

  if (children.length !== 2) {
    print(`⚠️  ${user.name}: 자식이 ${children.length}개 (이진트리 위반)`);
    return;
  }

  const leftChild = children[0];
  const rightChild = children[1];

  const leftGrades = collectSubtreeGrades(leftChild.loginId);
  const rightGrades = collectSubtreeGrades(rightChild.loginId);

  let expectedGrade = 'F1';

  // F5 체크: 좌우 서브트리의 F4가 1:2 또는 2:1
  const totalF4 = leftGrades.F4 + rightGrades.F4;
  if (totalF4 >= 3) {
    if ((leftGrades.F4 === 1 && rightGrades.F4 === 2) ||
        (leftGrades.F4 === 2 && rightGrades.F4 === 1)) {
      expectedGrade = 'F5';
    }
  }

  // F6 체크: 좌우 서브트리의 F5가 1:2 또는 2:1
  const totalF5 = leftGrades.F5 + rightGrades.F5;
  if (totalF5 >= 3) {
    if ((leftGrades.F5 === 1 && rightGrades.F5 === 2) ||
        (leftGrades.F5 === 2 && rightGrades.F5 === 1)) {
      expectedGrade = 'F6';
    }
  }

  // F4 체크: 좌우 서브트리에 각각 최소 1개의 F3
  if (leftGrades.F3 >= 1 && rightGrades.F3 >= 1) {
    expectedGrade = 'F4';
  }

  // F3 체크: 좌우 서브트리에 각각 최소 1개의 F2
  if (leftGrades.F2 >= 1 && rightGrades.F2 >= 1) {
    expectedGrade = 'F3';
  }

  // F2 체크: 좌우 서브트리에 각각 최소 1개의 F1
  if (leftGrades.F1 >= 1 && rightGrades.F1 >= 1) {
    expectedGrade = 'F2';
  }

  if (user.grade !== expectedGrade) {
    print(`❌ ${user.name}: 현재 ${user.grade}, 예상 ${expectedGrade}`);
    print(`   좌쪽 서브트리: F1:${leftGrades.F1}, F2:${leftGrades.F2}, F3:${leftGrades.F3}, F4:${leftGrades.F4}, F5:${leftGrades.F5}`);
    print(`   오른쪽 서브트리: F1:${rightGrades.F1}, F2:${rightGrades.F2}, F3:${rightGrades.F3}, F4:${rightGrades.F4}, F5:${rightGrades.F5}`);
  } else {
    print(`✅ ${user.name}: ${user.grade} (올바름)`);
  }
});

print('');
print('=== 현재 사장님 분석 ===');
const root = users.find(u => !u.parentId);
if (root) {
  const children = users.filter(u => u.parentId === root.loginId);
  if (children.length === 2) {
    const leftGrades = collectSubtreeGrades(children[0].loginId);
    const rightGrades = collectSubtreeGrades(children[1].loginId);

    print(`좌쪽(${children[0].name}) 서브트리: F1:${leftGrades.F1}, F2:${leftGrades.F2}, F3:${leftGrades.F3}, F4:${leftGrades.F4}, F5:${leftGrades.F5}`);
    print(`오른쪽(${children[1].name}) 서브트리: F1:${rightGrades.F1}, F2:${rightGrades.F2}, F3:${rightGrades.F3}, F4:${rightGrades.F4}, F5:${rightGrades.F5}`);

    // F5 달성 조건 체크
    const totalF4 = leftGrades.F4 + rightGrades.F4;
    print(`F4 총합: ${totalF4} (F5 조건: 총 3개 이상 + 2:1 비율)`);
    if (totalF4 >= 3) {
      if ((leftGrades.F4 === 1 && rightGrades.F4 === 2) ||
          (leftGrades.F4 === 2 && rightGrades.F4 === 1)) {
        print('✅ F5 조건 만족');
      } else {
        print('❌ F5 조건 불만족 (2:1 비율 아님)');
      }
    } else {
      print('❌ F5 조건 불만족 (F4가 3개 미만)');
    }
  }
}