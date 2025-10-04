// MongoDB 마이그레이션 스크립트
// mongosh nanumpay --file scripts/migrate-db.js 로 실행

print('🚀 DB 스키마 마이그레이션 시작...\n');

// 1. users 컬렉션 필드 추가
print('1. users 컬렉션 필드 업데이트...');

// 기존 grade 필드 값 보존
db.users.find({}).forEach(function(user) {
  const updates = {
    // 새로운 필드들 추가 (없는 것만)
    gradePaymentCount: user.gradePaymentCount || 0,
    lastGradeChangeDate: user.lastGradeChangeDate || new Date(),
    consecutiveGradeWeeks: user.consecutiveGradeWeeks || 0,

    // 보험 관련
    insuranceActive: user.insuranceActive !== undefined ? user.insuranceActive : false,
    insuranceAmount: user.insuranceAmount || 0,

    // 시스템 필드
    updatedAt: new Date()
  };

  db.users.updateOne(
    { _id: user._id },
    { $set: updates }
  );
});
print('  ✅ users 컬렉션 업데이트 완료\n');

// 2. systemConfigs 컬렉션 생성 및 초기 데이터
print('2. systemConfigs 컬렉션 생성...');

const systemConfigs = [
  {
    category: 'payment',
    key: 'grade_revenue_ratio',
    value: {
      F1: 0.24, F2: 0.19, F3: 0.14, F4: 0.09,
      F5: 0.05, F6: 0.03, F7: 0.02, F8: 0.01
    },
    description: '등급별 총매출 대비 지급 비율',
    dataType: 'object',
    isActive: true,
    version: 1,
    createdAt: new Date(),
    modifiedAt: new Date()
  },
  {
    category: 'payment',
    key: 'grade_payment_limits',
    value: {
      F1: { maxConsecutiveWeeks: 4, maxTotalPayments: null },
      F2: { maxConsecutiveWeeks: 4, maxTotalPayments: null },
      F3: { maxConsecutiveWeeks: null, maxTotalPayments: 10 },
      F4: { maxConsecutiveWeeks: null, maxTotalPayments: 10 },
      F5: { maxConsecutiveWeeks: null, maxTotalPayments: 10 },
      F6: { maxConsecutiveWeeks: null, maxTotalPayments: 10 },
      F7: { maxConsecutiveWeeks: null, maxTotalPayments: 10 },
      F8: { maxConsecutiveWeeks: null, maxTotalPayments: 10 }
    },
    description: '등급별 지급 횟수 및 기간 제한',
    dataType: 'object',
    isActive: true,
    version: 1,
    createdAt: new Date(),
    modifiedAt: new Date()
  },
  {
    category: 'grade',
    key: 'grade_requirements',
    value: {
      F1: { left: 0, right: 0, total: 0 },
      F2: { left: 1, right: 1, total: 2 },
      F3: { left: { F2: 1 }, right: { F2: 1 }, total: { F2: 2 } },
      F4: { left: { F3: 1 }, right: { F3: 1 }, total: { F3: 2 } },
      F5: { total: { F4: 3 }, minDistribution: '2:1' },
      F6: { total: { F5: 3 }, minDistribution: '2:1' },
      F7: { total: { F6: 3 }, minDistribution: '2:1' },
      F8: { total: { F7: 3 }, minDistribution: '2:1' }
    },
    description: '등급별 승급 조건 정의',
    dataType: 'object',
    isActive: true,
    version: 1,
    createdAt: new Date(),
    modifiedAt: new Date()
  },
  {
    category: 'insurance',
    key: 'insurance_maintenance',
    value: {
      requiredGrades: ['F3', 'F4', 'F5', 'F6', 'F7', 'F8'],
      minimumMonthlyPremium: {
        F3: 50000, F4: 50000,
        F5: 70000, F6: 70000,
        F7: 100000, F8: 100000
      },
      gracePeriodDays: 30,
      maintenanceCheckInterval: 'monthly'
    },
    description: 'F3 이상 등급 보험 유지 조건',
    dataType: 'object',
    isActive: true,
    version: 1,
    createdAt: new Date(),
    modifiedAt: new Date()
  },
  {
    category: 'payment',
    key: 'payment_schedule',
    value: {
      paymentDay: 'Friday',
      paymentTime: '09:00',
      installments: 10,
      taxRate: 0.033,
      gradeReferenceDays: { month: -1, day: -1 }
    },
    description: '지급 일정 및 관련 설정',
    dataType: 'object',
    isActive: true,
    version: 1,
    createdAt: new Date(),
    modifiedAt: new Date()
  }
];

// 기존 데이터 확인 후 없으면 추가
systemConfigs.forEach(function(config) {
  const existing = db.systemconfigs.findOne({ key: config.key });
  if (!existing) {
    db.systemconfigs.insertOne(config);
    print(`  ✅ ${config.key} 설정 추가`);
  } else {
    print(`  ⏭️  ${config.key} 이미 존재`);
  }
});
print('');

// 3. 새로운 컬렉션들 생성
print('3. 새로운 컬렉션 생성...');
const newCollections = [
  'systemconfighistory',
  'treesnapshots',
  'gradehistory',
  'userinsurance',
  'insurancesnapshots',
  'paymentconditionsnapshots',
  'revenuesnapshots',
  'userpayments'
];

newCollections.forEach(function(collectionName) {
  const exists = db.getCollectionNames().indexOf(collectionName) > -1;
  if (!exists) {
    db.createCollection(collectionName);
    print(`  ✅ ${collectionName} 생성`);
  } else {
    print(`  ⏭️  ${collectionName} 이미 존재`);
  }
});
print('');

// 4. 인덱스 생성
print('4. 인덱스 생성...');

// users 인덱스
db.users.createIndex({ loginId: 1 }, { unique: true });
db.users.createIndex({ parentId: 1 });
print('  ✅ users 인덱스');

// systemconfigs 인덱스
db.systemconfigs.createIndex({ key: 1 }, { unique: true });
db.systemconfigs.createIndex({ category: 1 });
print('  ✅ systemconfigs 인덱스');

// userpayments 인덱스
db.userpayments.createIndex({ userId: 1, revenueMonth: 1 });
print('  ✅ userpayments 인덱스\n');

// 5. 마이그레이션 결과 확인
print('📊 마이그레이션 결과:');
const collections = db.getCollectionNames().sort();
print(`  총 컬렉션 수: ${collections.length}`);
print('  컬렉션 목록:');
collections.forEach(function(name) {
  const count = db.getCollection(name).countDocuments();
  print(`    - ${name}: ${count}개 문서`);
});

print('\n✅ DB 마이그레이션 완료!');