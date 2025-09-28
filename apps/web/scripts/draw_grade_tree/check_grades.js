// 등급 계산 문제 확인 스크립트
const users = db.users.find({type: 'user'}).toArray();

// 실제 계층 구조 확인
function checkGrades() {
  const problems = [];

  users.forEach(user => {
    const children = users.filter(u => u.parentId === user.loginId);
    const childrenGrades = children.map(c => c.grade);

    if (children.length === 0) {
      // 말단 노드는 F1이어야 함
      if (user.grade !== 'F1') {
        problems.push(`${user.name} - 말단노드인데 ${user.grade} (F1이어야 함)`);
      }
    } else {
      // 자식이 있는 노드의 등급 계산
      const maxChildGrade = Math.max(...children.map(c => parseInt(c.grade.substring(1))));
      const expectedGrade = 'F' + (maxChildGrade + 1);

      if (user.grade !== expectedGrade) {
        problems.push(`${user.name} - 현재 ${user.grade}, 예상 ${expectedGrade} (자식: ${childrenGrades.join(', ')})`);
      }
    }
  });

  return problems;
}

print('=== 등급 계산 문제 확인 ===');
const problems = checkGrades();
if (problems.length === 0) {
  print('등급 계산에 문제가 없습니다.');
} else {
  print('발견된 문제들:');
  problems.forEach(problem => print('- ' + problem));
}

print('');
print('=== 현재 등급 분포 ===');
const gradeCount = {};
users.forEach(u => {
  gradeCount[u.grade] = (gradeCount[u.grade] || 0) + 1;
});
Object.keys(gradeCount).sort().forEach(grade => {
  print(grade + ':', gradeCount[grade] + '명');
});

print('');
print('=== 계층 구조 분석 ===');
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

Object.keys(levels).sort((a, b) => parseInt(a) - parseInt(b)).forEach(level => {
  const levelUsers = levels[level];
  const gradeDistribution = {};
  levelUsers.forEach(u => {
    gradeDistribution[u.grade] = (gradeDistribution[u.grade] || 0) + 1;
  });

  print(`레벨 ${level}: ${levelUsers.length}명 - ${Object.entries(gradeDistribution).map(([g, c]) => `${g}:${c}`).join(', ')}`);
});