import mongoose from 'mongoose';

/**
 * 주차별 총계
 * v5.0: 주차별 전체 지급 통계 (성능 최적화)
 */
const weeklyPaymentSummarySchema = new mongoose.Schema(
  {
    // 주차 정보
    weekDate: {
      type: Date,
      required: true  // 금요일 날짜
    },
    weekNumber: {
      type: String,
      required: true,
      unique: true  // "2025-W41" (ISO 주차)
    },
    monthKey: {
      type: String,
      required: true  // "2025-10"
    },

    // 전체 총계 (페이지 무관)
    totalAmount: {
      type: Number,
      default: 0  // 전체 지급액 합계
    },
    totalTax: {
      type: Number,
      default: 0  // 전체 원천징수 합계
    },
    totalNet: {
      type: Number,
      default: 0  // 전체 실지급액 합계
    },
    totalUserCount: {
      type: Number,
      default: 0  // 전체 지급 대상 인원
    },
    totalPaymentCount: {
      type: Number,
      default: 0  // 전체 지급 건수 (병행지급 포함)
    },

    // 등급별 총계
    byGrade: {
      F1: {
        amount: { type: Number, default: 0 },
        tax: { type: Number, default: 0 },
        net: { type: Number, default: 0 },
        userCount: { type: Number, default: 0 },
        paymentCount: { type: Number, default: 0 },
        userIds: { type: [String], default: [] }  // 유니크 userId 추적
      },
      F2: {
        amount: { type: Number, default: 0 },
        tax: { type: Number, default: 0 },
        net: { type: Number, default: 0 },
        userCount: { type: Number, default: 0 },
        paymentCount: { type: Number, default: 0 },
        userIds: { type: [String], default: [] }
      },
      F3: {
        amount: { type: Number, default: 0 },
        tax: { type: Number, default: 0 },
        net: { type: Number, default: 0 },
        userCount: { type: Number, default: 0 },
        paymentCount: { type: Number, default: 0 },
        userIds: { type: [String], default: [] }
      },
      F4: {
        amount: { type: Number, default: 0 },
        tax: { type: Number, default: 0 },
        net: { type: Number, default: 0 },
        userCount: { type: Number, default: 0 },
        paymentCount: { type: Number, default: 0 },
        userIds: { type: [String], default: [] }
      },
      F5: {
        amount: { type: Number, default: 0 },
        tax: { type: Number, default: 0 },
        net: { type: Number, default: 0 },
        userCount: { type: Number, default: 0 },
        paymentCount: { type: Number, default: 0 },
        userIds: { type: [String], default: [] }
      },
      F6: {
        amount: { type: Number, default: 0 },
        tax: { type: Number, default: 0 },
        net: { type: Number, default: 0 },
        userCount: { type: Number, default: 0 },
        paymentCount: { type: Number, default: 0 },
        userIds: { type: [String], default: [] }
      },
      F7: {
        amount: { type: Number, default: 0 },
        tax: { type: Number, default: 0 },
        net: { type: Number, default: 0 },
        userCount: { type: Number, default: 0 },
        paymentCount: { type: Number, default: 0 },
        userIds: { type: [String], default: [] }
      },
      F8: {
        amount: { type: Number, default: 0 },
        tax: { type: Number, default: 0 },
        net: { type: Number, default: 0 },
        userCount: { type: Number, default: 0 },
        paymentCount: { type: Number, default: 0 },
        userIds: { type: [String], default: [] }
      }
    },

    // 계획 타입별 총계
    byPlanType: {
      initial: {
        amount: { type: Number, default: 0 },
        tax: { type: Number, default: 0 },
        net: { type: Number, default: 0 },
        paymentCount: { type: Number, default: 0 }
      },
      promotion: {
        amount: { type: Number, default: 0 },
        tax: { type: Number, default: 0 },
        net: { type: Number, default: 0 },
        paymentCount: { type: Number, default: 0 }
      },
      additional: {
        amount: { type: Number, default: 0 },
        tax: { type: Number, default: 0 },
        net: { type: Number, default: 0 },
        paymentCount: { type: Number, default: 0 }
      }
    },

    // 상태
    status: {
      type: String,
      enum: ['scheduled', 'processing', 'completed'],
      default: 'scheduled'
    },
    processedAt: { type: Date },

    // 메타 정보
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
  },
  {
    timestamps: true
  }
);

// 인덱스 (weekNumber는 스키마 필드에 unique: true로 정의됨)
weeklyPaymentSummarySchema.index({ weekDate: 1 });
weeklyPaymentSummarySchema.index({ monthKey: 1 });
weeklyPaymentSummarySchema.index({ status: 1 });

// 정적 메소드: ISO 주차 계산
weeklyPaymentSummarySchema.statics.getISOWeek = function(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 4 - (d.getDay() || 7));
  const yearStart = new Date(d.getFullYear(), 0, 1);
  const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return `${d.getFullYear()}-W${String(weekNo).padStart(2, '0')}`;
};

// 정적 메소드: 월 키 생성
weeklyPaymentSummarySchema.statics.generateMonthKey = function(date) {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
};

// 헬퍼 메소드: 금요일 기준 월별 주차 계산
weeklyPaymentSummarySchema.statics.getWeekOfMonthByFriday = function(date) {
  const d = new Date(date);
  const firstDay = new Date(d.getFullYear(), d.getMonth(), 1);

  // 해당 월의 첫 금요일 찾기
  let firstFriday = new Date(firstDay);
  const dayOfWeek = firstFriday.getDay();
  const daysUntilFriday = (5 - dayOfWeek + 7) % 7;
  firstFriday.setDate(firstFriday.getDate() + daysUntilFriday);

  // 현재 날짜가 첫 금요일 이전이면 0주차
  if (d < firstFriday) return 0;

  // 주차 계산
  const daysDiff = Math.floor((d - firstFriday) / (1000 * 60 * 60 * 24));
  const week = Math.floor(daysDiff / 7) + 1;

  return week;
};

// 인스턴스 메소드: 증분 업데이트
weeklyPaymentSummarySchema.methods.incrementPayment = function(grade, planType, amount, tax, net, userId) {
  // 전체 총계
  this.totalAmount += amount;
  this.totalTax += tax;
  this.totalNet += net;
  this.totalPaymentCount += 1;

  // 등급별 총계
  if (this.byGrade[grade]) {
    this.byGrade[grade].amount += amount;
    this.byGrade[grade].tax += tax;
    this.byGrade[grade].net += net;
    this.byGrade[grade].paymentCount += 1;

    // userId가 제공된 경우, 유니크한 사용자만 카운트
    if (userId) {
      const userIdStr = userId.toString();
      if (!this.byGrade[grade].userIds) {
        this.byGrade[grade].userIds = [];
      }
      if (!this.byGrade[grade].userIds.includes(userIdStr)) {
        this.byGrade[grade].userIds.push(userIdStr);
        this.byGrade[grade].userCount = this.byGrade[grade].userIds.length;
      }
    }
  }

  // 계획 타입별 총계
  if (this.byPlanType[planType]) {
    this.byPlanType[planType].amount += amount;
    this.byPlanType[planType].tax += tax;
    this.byPlanType[planType].net += net;
    this.byPlanType[planType].paymentCount += 1;
  }
};

// 인스턴스 메소드: 사용자 카운트 재계산
weeklyPaymentSummarySchema.methods.recalculateUserCount = async function() {
  const WeeklyPaymentPlans = mongoose.model('WeeklyPaymentPlans');

  // 해당 주의 유니크 사용자 수 계산
  const result = await WeeklyPaymentPlans.aggregate([
    {
      $match: {
        'installments.weekNumber': this.weekNumber,
        'installments.status': { $in: ['paid', 'pending'] }
      }
    },
    {
      $group: {
        _id: null,
        uniqueUsers: { $addToSet: '$userId' }
      }
    },
    {
      $project: {
        userCount: { $size: '$uniqueUsers' }
      }
    }
  ]);

  this.totalUserCount = result[0]?.userCount || 0;

  // 등급별 사용자 수도 계산
  const gradeResult = await WeeklyPaymentPlans.aggregate([
    {
      $match: {
        'installments.weekNumber': this.weekNumber,
        'installments.status': { $in: ['paid', 'pending'] }
      }
    },
    {
      $group: {
        _id: '$baseGrade',
        users: { $addToSet: '$userId' }
      }
    },
    {
      $project: {
        grade: '$_id',
        userCount: { $size: '$users' }
      }
    }
  ]);

  gradeResult.forEach(item => {
    if (this.byGrade[item.grade]) {
      this.byGrade[item.grade].userCount = item.userCount;
    }
  });
};

const WeeklyPaymentSummary = mongoose.models.WeeklyPaymentSummary ||
  mongoose.model('WeeklyPaymentSummary', weeklyPaymentSummarySchema);

export default WeeklyPaymentSummary;