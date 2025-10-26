#!/bin/bash

# 설계사 수당 점검 스크립트

echo "=========================================="
echo "설계사 수당 점검"
echo "=========================================="
echo ""

# MongoDB 쿼리
mongosh mongodb://localhost:27017/nanumpay --quiet --eval "
console.log('📊 설계사 수당 통계:');
console.log('');

const commissions = db.plannercommissions.find().toArray();

if (commissions.length === 0) {
  console.log('⚠️  설계사 수당 데이터가 없습니다.');
} else {
  console.log(\`✅ 총 \${commissions.length}개 데이터\`);
  console.log('');

  commissions.forEach(c => {
    console.log(\`설계사: \${c.plannerName}\`);
    console.log(\`  매출월: \${c.revenueMonth}\`);
    console.log(\`  지급월: \${c.paymentMonth}\`);
    console.log(\`  용역자 수: \${c.totalUsers}명\`);
    console.log(\`  총 매출: \${c.totalRevenue.toLocaleString()}원\`);
    console.log(\`  총 수당: \${c.totalCommission.toLocaleString()}원\`);
    console.log(\`  지급 상태: \${c.paymentStatus}\`);

    if (c.users && c.users.length > 0) {
      console.log('  용역자 목록:');
      c.users.forEach(u => {
        console.log(\`    - \${u.userName}: \${u.commission.toLocaleString()}원\`);
      });
    }

    console.log('');
  });

  // 전체 통계
  const totalCommission = commissions.reduce((sum, c) => sum + c.totalCommission, 0);
  const totalUsers = commissions.reduce((sum, c) => sum + c.totalUsers, 0);
  const totalRevenue = commissions.reduce((sum, c) => sum + c.totalRevenue, 0);

  console.log('========================================');
  console.log('전체 통계:');
  console.log(\`  설계사 수: \${commissions.length}명\`);
  console.log(\`  용역자 수: \${totalUsers}명\`);
  console.log(\`  총 매출: \${totalRevenue.toLocaleString()}원\`);
  console.log(\`  총 수당: \${totalCommission.toLocaleString()}원\`);
  console.log('========================================');
}
"

echo ""
echo "✅ 점검 완료"
