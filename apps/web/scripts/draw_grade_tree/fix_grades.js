// 등급 재계산 및 수정 스크립트
const users = db.users.find({type: 'user'}).toArray();

// 계층별로 정렬하여 하위부터 등급 계산
const levels = {};
const visited = new Set();

function assignLevel(user, level = 0) {
  if (!user || visited.has(user.loginId)) return;
  visited.add(user.loginId);

  if (!levels[level]) levels[level] = [];
  levels[level].push(user);

  const children = users.filter(u => u.parentId === user.loginId);
  children.forEach(child => assignLevel(child, level + 1));
}

const root = users.find(u => !u.parentId);
if (root) assignLevel(root);

// 최하위 레벨부터 등급 재계산
const maxLevel = Math.max(...Object.keys(levels).map(Number));

for (let level = maxLevel; level >= 0; level--) {
  const levelUsers = levels[level];

  levelUsers.forEach(user => {
    const children = users.filter(u => u.parentId === user.loginId);

    let newGrade;
    if (children.length === 0) {
      // 말단 노드는 F1
      newGrade = 'F1';
    } else {
      // 자식들의 최고 등급 + 1
      const maxChildGrade = Math.max(...children.map(c => parseInt(c.grade.substring(1))));
      newGrade = 'F' + (maxChildGrade + 1);
    }

    if (user.grade !== newGrade) {
      print(`${user.name}: ${user.grade} -> ${newGrade}`);

      // DB 업데이트
      db.users.updateOne(
        { loginId: user.loginId },
        { $set: { grade: newGrade } }
      );

      // 메모리상 객체도 업데이트
      user.grade = newGrade;
    }
  });
}

print('등급 재계산 완료!');

// 재계산 후 검증
print('');
print('=== 재계산 후 등급 분포 ===');
const updatedUsers = db.users.find({type: 'user'}).toArray();
const gradeCount = {};
updatedUsers.forEach(u => {
  gradeCount[u.grade] = (gradeCount[u.grade] || 0) + 1;
});
Object.keys(gradeCount).sort().forEach(grade => {
  print(grade + ':', gradeCount[grade] + '명');
});