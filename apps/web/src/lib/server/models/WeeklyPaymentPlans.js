import mongoose from 'mongoose';

/**
 * 개별 지급 계획
 * v5.0: 용역자별 주차별 지급 계획 상세 (병행 지급 지원)
 */
const weeklyPaymentPlansSchema = new mongoose.Schema(
  {
    // 사용자 정보
    userId: { type: String, required: true },
    userName: { type: String, required: true },

    // 계획 정보
    planType: {
      type: String,
      required: true,
      enum: ['initial', 'promotion', 'additional']  // 등록/승급/추가
    },
    generation: {
      type: Number,
      required: true,
      default: 1  // 몇 번째 10회인지 (1, 2, 3, ...)
    },
    baseGrade: {
      type: String,
      required: true,
      enum: ['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8']
    },
    revenueMonth: {
      type: String,
      required: true  // "2025-10" 형식 (매출 귀속 월)
    },

    // 지급 정보
    startDate: {
      type: Date,
      required: true  // 지급 시작일 (등록일+1개월 후 첫 금요일)
    },
    totalInstallments: {
      type: Number,
      required: true  // 총 지급 횟수
    },
    completedInstallments: {
      type: Number,
      default: 0  // 완료된 지급 횟수
    },

    // 주차별 지급 내역
    installments: [{
      week: {
        type: Number,
        required: true  // 1~60 (등급별 최대)
      },
      weekNumber: {
        type: String,
        required: true  // "2025-W41" (ISO 주차)
      },
      scheduledDate: {
        type: Date,
        required: true  // 지급 예정일 (금요일)
      },

      revenueMonth: {
        type: String,
        required: true  // 매출 귀속 월
      },
      gradeAtPayment: {
        type: String  // 지급 시점 등급 (월말 스냅샷 기준)
      },

      // 금액 (주간 지급 시 확정)
      baseAmount: { type: Number },       // 등급별 총 지급액
      installmentAmount: { type: Number }, // 회차당 지급액 (100원 단위 절삭)
      withholdingTax: { type: Number },   // 원천징수 (3.3%)
      netAmount: { type: Number },        // 실지급액

      status: {
        type: String,
        enum: ['pending', 'paid', 'skipped', 'terminated'],
        default: 'pending'
      },
      paidAt: { type: Date },
      skipReason: { type: String },  // 'insurance_not_maintained', etc.

      // 보험 관련
      insuranceSkipped: { type: Boolean, default: false },  // 보험 미유지로 건너뜀

      // 지급 타입
      installmentType: {
        type: String,
        enum: ['initial', 'additional'],  // 기본(1~10) / 추가(11~)
        required: true
      }
    }],

    // 계획 상태
    planStatus: {
      type: String,
      enum: ['active', 'completed', 'terminated'],
      default: 'active'
    },

    // 종료 정보
    terminatedAt: { type: Date },
    terminationReason: {
      type: String,
      enum: ['promotion', 'max_reached', 'manual']
    },

    // v6.0 추가 필드
    parentPlanId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'WeeklyPaymentPlans'  // 이전 10회 계획 ID (연결 추적)
    },
    createdBy: {
      type: String,
      enum: ['registration', 'promotion', 'auto_generation'],  // 생성 출처
      default: 'registration'
    },

    // 메타데이터
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
  },
  {
    timestamps: true
  }
);

// 인덱스
weeklyPaymentPlansSchema.index({ userId: 1, planStatus: 1 });
weeklyPaymentPlansSchema.index({ 'installments.scheduledDate': 1, 'installments.status': 1 });
weeklyPaymentPlansSchema.index({ planType: 1, baseGrade: 1 });
weeklyPaymentPlansSchema.index({ revenueMonth: 1 });
weeklyPaymentPlansSchema.index({ 'installments.weekNumber': 1 });
weeklyPaymentPlansSchema.index({ generation: 1 });  // v6.0 추가
weeklyPaymentPlansSchema.index({ parentPlanId: 1 });  // v6.0 추가
weeklyPaymentPlansSchema.index({ createdBy: 1 });  // v6.0 추가

// 헬퍼 메소드: ISO 주차 계산
weeklyPaymentPlansSchema.statics.getISOWeek = function(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 4 - (d.getDay() || 7));
  const yearStart = new Date(d.getFullYear(), 0, 1);
  const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return `${d.getFullYear()}-W${String(weekNo).padStart(2, '0')}`;
};

// 헬퍼 메소드: 다음 금요일 계산 (오늘이 금요일이면 오늘 반환)
// UTC 기준으로 계산하여 타임존 문제 방지
weeklyPaymentPlansSchema.statics.getNextFriday = function(date) {
  const d = new Date(date);
  console.log(`[getNextFriday-v2] === 시작 ===`);
  console.log(`[getNextFriday-v2] 입력 date: ${date}`);
  console.log(`[getNextFriday-v2] Date 객체: ${d.toISOString()}`);
  
  const dayOfWeek = d.getUTCDay();  // UTC 기준 요일
  console.log(`[getNextFriday-v2] UTC 요일: ${dayOfWeek} (0=일, 5=금)`);
  console.log(`[getNextFriday-v2] UTC 날짜 부분: ${d.toISOString().split('T')[0]}`);

  // 이미 금요일이면 그대로 반환
  if (dayOfWeek === 5) {
    d.setUTCHours(0, 0, 0, 0);
    console.log(`[getNextFriday-v2] 이미 금요일! UTC 시간 설정 후: ${d.toISOString()}`);
    console.log(`[getNextFriday-v2] 최종 반환: ${d.toISOString().split('T')[0]}`);
    return d;
  }

  // 다음 금요일까지 일수 계산
  const daysUntilFriday = (5 - dayOfWeek + 7) % 7;
  console.log(`[getNextFriday-v2] 금요일까지 ${daysUntilFriday}일 후`);
  
  // UTC 기준으로 날짜 더하기
  const beforeAdd = d.getUTCDate();
  d.setUTCDate(d.getUTCDate() + daysUntilFriday);
  console.log(`[getNextFriday-v2] UTC 날짜 변경: ${beforeAdd} → ${d.getUTCDate()}`);
  
  d.setUTCHours(0, 0, 0, 0);
  console.log(`[getNextFriday-v2] 최종 결과: ${d.toISOString().split('T')[0]}`);
  return d;
};

// 헬퍼 메소드: 등록일+1개월 후 첫 금요일
weeklyPaymentPlansSchema.statics.getPaymentStartDate = function(registrationDate) {
  const d = new Date(registrationDate);
  console.log(`[getPaymentStartDate] 입력 등록일: ${d.toISOString().split('T')[0]}`);

  // 1개월 후의 1일로 이동 (타임존 문제 해결)
  const year = d.getFullYear();
  const month = d.getMonth();  // 0-based (7월 = 6)

  let nextMonth = month + 1;
  let nextYear = year;
  if (nextMonth > 11) {  // 12월 다음은 1월
    nextMonth = 0;
    nextYear += 1;
  }

  // 문자열로 날짜 생성하여 타임존 문제 회피
  const nextMonthStr = String(nextMonth + 1).padStart(2, '0');  // 월을 1-based로 변환
  const dateStr = `${nextYear}-${nextMonthStr}-01`;
  const firstDayOfNextMonth = new Date(dateStr);
  console.log(`[getPaymentStartDate] 1개월 후 1일: ${firstDayOfNextMonth.toISOString().split('T')[0]}`);

  // 해당 월의 첫 금요일
  const result = this.getNextFriday(firstDayOfNextMonth);
  console.log(`[getPaymentStartDate] 계산된 지급 시작일: ${result.toISOString().split('T')[0]} (${this.getISOWeek(result)})`);
  return result;
};

// 인스턴스 메소드: 다음 대기중인 할부 가져오기
weeklyPaymentPlansSchema.methods.getNextPendingInstallment = function() {
  return this.installments.find(inst => inst.status === 'pending');
};

// 인스턴스 메소드: 특정 날짜의 할부 가져오기
weeklyPaymentPlansSchema.methods.getInstallmentByDate = function(date) {
  const targetDate = new Date(date);
  targetDate.setHours(0, 0, 0, 0);

  return this.installments.find(inst => {
    const schedDate = new Date(inst.scheduledDate);
    schedDate.setHours(0, 0, 0, 0);
    return schedDate.getTime() === targetDate.getTime();
  });
};

const WeeklyPaymentPlans = mongoose.models.WeeklyPaymentPlans ||
  mongoose.model('WeeklyPaymentPlans', weeklyPaymentPlansSchema);

export default WeeklyPaymentPlans;