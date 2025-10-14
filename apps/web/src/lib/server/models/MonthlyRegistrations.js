import mongoose from 'mongoose';

/**
 * 월별 등록/매출 관리 컬렉션
 * v7.0: 매월 용역자 등록 및 매출 관리 (지급 대상자 3가지 유형 구분)
 */
const monthlyRegistrationsSchema = new mongoose.Schema(
  {
    // 월 키 (YYYY-MM 형식)
    monthKey: {
      type: String,
      required: true,
      unique: true,
      validate: {
        validator: function(v) {
          return /^\d{4}-(0[1-9]|1[0-2])$/.test(v);
        },
        message: 'monthKey must be in YYYY-MM format'
      }
    },

    // 등록 정보
    registrationCount: {
      type: Number,
      required: true,
      default: 0
    },

    // ⭐ 리팩토링: 등록자 중 승급/미승급 수
    promotedCount: {
      type: Number,
      default: 0,
      comment: '이번 달 등록자 중 승급한 사람 수'
    },
    nonPromotedCount: {
      type: Number,
      default: 0,
      comment: '이번 달 등록자 중 승급 안 한 사람 수 (F1)'
    },

    // 매출 정보
    totalRevenue: {
      type: Number,
      required: true,
      default: 0
    },
    adjustedRevenue: {
      type: Number,  // 관리자가 수동 조정한 금액 (null이면 자동 계산 사용)
      default: null
    },

    // 등록자 목록 (v7.0: 신규 등록자만)
    registrations: [{
      userId: { type: String, required: true },
      userName: { type: String, required: true },
      registrationDate: { type: Date, required: true },
      sponsorId: { type: String },
      grade: { type: String },  // 등록 시점 등급
      position: {
        type: String,
        enum: ['left', 'right', 'root']
      }
    }],

    // v7.0: 지급 대상자 정보 (3가지 유형)
    paymentTargets: {
      // 신규 등록자 (매출 기여)
      registrants: [{
        userId: { type: String, required: true },
        userName: { type: String, required: true },
        grade: { type: String, required: true }
      }],

      // 승급자 (매출 기여 없음)
      promoted: [{
        userId: { type: String, required: true },
        userName: { type: String, required: true },
        oldGrade: { type: String, required: true },
        newGrade: { type: String, required: true },
        promotionDate: { type: Date }
      }],

      // 추가지급 대상자 (매출 기여 없음)
      additionalPayments: [{
        userId: { type: String, required: true },
        userName: { type: String, required: true },
        grade: { type: String, required: true },
        추가지급단계: { type: Number, required: true }
      }]
    },

    // 등급별 분포 (v7.0: 지급 대상자 전체 기준)
    gradeDistribution: {
      F1: { type: Number, default: 0 },
      F2: { type: Number, default: 0 },
      F3: { type: Number, default: 0 },
      F4: { type: Number, default: 0 },
      F5: { type: Number, default: 0 },
      F6: { type: Number, default: 0 },
      F7: { type: Number, default: 0 },
      F8: { type: Number, default: 0 }
    },

    // 등급별 지급액 (해당 월 매출 기준)
    gradePayments: {
      F1: { type: Number, default: 0 },
      F2: { type: Number, default: 0 },
      F3: { type: Number, default: 0 },
      F4: { type: Number, default: 0 },
      F5: { type: Number, default: 0 },
      F6: { type: Number, default: 0 },
      F7: { type: Number, default: 0 },
      F8: { type: Number, default: 0 }
    },

    // 메타 정보
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
  },
  {
    timestamps: true
  }
);

// 인덱스
monthlyRegistrationsSchema.index({ monthKey: 1 }, { unique: true });
monthlyRegistrationsSchema.index({ 'registrations.userId': 1 });
monthlyRegistrationsSchema.index({ 'registrations.registrationDate': 1 });
// v7.0: paymentTargets 인덱스
monthlyRegistrationsSchema.index({ 'paymentTargets.registrants.userId': 1 });
monthlyRegistrationsSchema.index({ 'paymentTargets.promoted.userId': 1 });
monthlyRegistrationsSchema.index({ 'paymentTargets.additionalPayments.userId': 1 });

// 헬퍼 메소드: 실제 사용할 매출 가져오기
monthlyRegistrationsSchema.methods.getEffectiveRevenue = function() {
  return this.adjustedRevenue !== null ? this.adjustedRevenue : this.totalRevenue;
};

// 정적 메소드: 월 키 생성
monthlyRegistrationsSchema.statics.generateMonthKey = function(date) {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
};

const MonthlyRegistrations = mongoose.models.MonthlyRegistrations ||
  mongoose.model('MonthlyRegistrations', monthlyRegistrationsSchema);

export default MonthlyRegistrations;