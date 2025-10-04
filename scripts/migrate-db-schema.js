import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

async function migrateDatabase() {
  try {
    // MongoDB 연결
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/nanumpay');
    console.log('MongoDB 연결 완료');

    const db = mongoose.connection.db;

    // 1. users 컬렉션 필드 추가
    console.log('\n1. users 컬렉션 필드 업데이트...');
    const usersUpdate = await db.collection('users').updateMany(
      {},
      {
        $set: {
          // 등급 관련
          gradePaymentCount: 0,
          lastGradeChangeDate: new Date(),
          consecutiveGradeWeeks: 0,

          // 보험 관련
          insuranceActive: false,
          insuranceAmount: 0,

          // 시스템 필드
          updatedAt: new Date()
        }
      }
    );
    console.log(`  - ${usersUpdate.modifiedCount}개 사용자 업데이트 완료`);

    // 2. systemConfigs 컬렉션 생성 및 초기 데이터
    console.log('\n2. systemConfigs 컬렉션 생성...');
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

    try {
      await db.collection('systemconfigs').insertMany(systemConfigs);
      console.log(`  - ${systemConfigs.length}개 시스템 설정 생성 완료`);
    } catch (error) {
      if (error.code === 11000) {
        console.log('  - 시스템 설정이 이미 존재합니다');
      } else {
        throw error;
      }
    }

    // 3. 새로운 컬렉션들 생성
    const newCollections = [
      'systemconfighistory',
      'treesnapshots',
      'gradehistory',
      'userinsurance',
      'insurancesnapshots',
      'paymentconditionsnapshots',
      'revenuesnapshots'
    ];

    console.log('\n3. 새로운 컬렉션 생성...');
    for (const collectionName of newCollections) {
      try {
        await db.createCollection(collectionName);
        console.log(`  - ${collectionName} 생성 완료`);
      } catch (error) {
        if (error.code === 48) { // Collection already exists
          console.log(`  - ${collectionName} 이미 존재`);
        } else {
          throw error;
        }
      }
    }

    // 4. userPayments 컬렉션 필드 추가
    console.log('\n4. userpaymentplans → userpayments 마이그레이션...');
    const paymentPlans = await db.collection('userpaymentplans').find({}).toArray();
    if (paymentPlans.length > 0) {
      const updatedPayments = paymentPlans.map(plan => ({
        ...plan,
        isEligible: true,
        ineligibleReason: null,
        gradePaymentCountAtCreation: 0,
        totalPaidAmount: 0,
        totalPaidCount: 0,
        updatedAt: new Date()
      }));

      try {
        await db.collection('userpayments').insertMany(updatedPayments);
        console.log(`  - ${updatedPayments.length}개 지급 계획 마이그레이션 완료`);
      } catch (error) {
        if (error.code === 11000) {
          console.log('  - 이미 마이그레이션됨');
        }
      }
    }

    // 5. 인덱스 생성
    console.log('\n5. 인덱스 생성...');

    // users 인덱스
    await db.collection('users').createIndex({ loginId: 1 }, { unique: true });
    await db.collection('users').createIndex({ parentId: 1 });
    console.log('  - users 인덱스 생성 완료');

    // systemconfigs 인덱스
    await db.collection('systemconfigs').createIndex({ key: 1 }, { unique: true });
    await db.collection('systemconfigs').createIndex({ category: 1 });
    console.log('  - systemconfigs 인덱스 생성 완료');

    console.log('\n✅ DB 마이그레이션 완료!');

    // 마이그레이션 결과 확인
    console.log('\n📊 마이그레이션 결과:');
    const collections = await db.listCollections().toArray();
    console.log('총 컬렉션 수:', collections.length);
    console.log('컬렉션 목록:', collections.map(c => c.name).sort());

  } catch (error) {
    console.error('❌ 마이그레이션 실패:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\nMongoDB 연결 종료');
  }
}

// 실행
migrateDatabase();