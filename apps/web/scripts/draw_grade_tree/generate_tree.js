// MLM 이진트리 시각화 생성 스크립트
// 사용법: mongosh nanumpay --eval "$(cat generate_tree.js)" > tree.dot

const users = db.users.find({type: 'user'}).toArray();

// 레벨별로 분류 (loginId 기준)
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

print('digraph MLMTree {');
print('  rankdir=TB;');
print('  ranksep=1.8;');
print('  nodesep=1.2;');
print('  node [shape=circle, style=filled, fillcolor=lightgray, width=0.8, height=0.8, fontsize=8];');
print('  edge [arrowhead=none];');
print('');

// 보이지 않는 구조 노드들로 레벨 강제
print('  node [style=invis, width=0, height=0];');
const maxLevel = Math.max(...Object.keys(levels).map(Number));
for (let i = 0; i <= maxLevel; i++) {
  print(`  level${i};`);
}
for (let i = 0; i < maxLevel; i++) {
  print(`  level${i} -> level${i+1};`);
}

print('');
print('  node [style=filled, fillcolor=lightgray, width=0.8, height=0.8];');

// 레벨별 그룹화
Object.keys(levels).sort((a, b) => parseInt(a) - parseInt(b)).forEach(level => {
  const levelUsers = levels[level];
  const userNames = levelUsers.map(u => `"${u.name}"`).join('; ');
  print(`  { rank=same; level${level}; ${userNames}; }`);
});

print('');

// 노드 정의
users.forEach(user => {
  print(`  "${user.name}" [label="${user.name}\\n(${user.grade})"];`);
});

print('');

// 관계 정의 (loginId 기준)
users.forEach(user => {
  if (user.parentId) {
    const parent = users.find(u => u.loginId === user.parentId);
    if (parent) {
      print(`  "${parent.name}" -> "${user.name}";`);
    }
  }
});

print('}');