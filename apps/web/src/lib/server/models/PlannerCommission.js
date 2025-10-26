import mongoose from 'mongoose';

/**
 * 설계사 수당 모델
 *
 * 역할:
 * - 월별 설계사별 수당 통계 관리
 * - 용역자 등록 시 매출의 10% 수당 계산
 * - 등록월 매출, 다음달 지급
 */
const plannerCommissionSchema = new mongoose.Schema(
  {
    // 설계사 정보
    plannerAccountId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PlannerAccount',
      required: true,
      index: true
    },
    plannerName: {
      type: String,
      required: true
    },

    // 매출월 (YYYY-MM)
    revenueMonth: {
      type: String,
      required: true,
      index: true,
      validate: {
        validator: function(v) {
          return /^\d{4}-\d{2}$/.test(v);
        },
        message: 'revenueMonth는 YYYY-MM 형식이어야 합니다.'
      }
    },

    // 지급월 (YYYY-MM) - 매출월 다음 달 (자동 계산)
    paymentMonth: {
      type: String,
      validate: {
        validator: function(v) {
          return /^\d{4}-\d{2}$/.test(v);
        },
        message: 'paymentMonth는 YYYY-MM 형식이어야 합니다.'
      }
    },

    // 용역자 목록
    users: [{
      userId: {
        type: String,
        required: true
      },
      userName: {
        type: String,
        required: true
      },
      registrationDate: {
        type: Date,
        required: true
      },
      // 용역자 1명 = 100만원 매출
      revenue: {
        type: Number,
        default: 1000000
      },
      // 수당 = 매출의 10%
      commission: {
        type: Number,
        default: 100000
      }
    }],

    // 통계
    totalUsers: {
      type: Number,
      default: 0
    },
    totalRevenue: {
      type: Number,
      default: 0
    },
    totalCommission: {
      type: Number,
      default: 0
    },

    // 지급 상태
    paymentStatus: {
      type: String,
      enum: ['pending', 'paid', 'cancelled'],
      default: 'pending'
    },

    // 지급 정보
    paidAt: {
      type: Date
    },
    paidBy: {
      type: String
    }
  },
  {
    timestamps: true,
    collection: 'plannercommissions'
  }
);

// 복합 인덱스
plannerCommissionSchema.index({ plannerAccountId: 1, revenueMonth: 1 }, { unique: true });
plannerCommissionSchema.index({ revenueMonth: 1, paymentStatus: 1 });

/**
 * 지급월 자동 계산 (매출월 + 1개월)
 */
plannerCommissionSchema.methods.calculatePaymentMonth = function() {
  const [year, month] = this.revenueMonth.split('-').map(Number);
  const nextMonth = new Date(year, month, 1); // month는 0-based이므로 +1개월
  return `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, '0')}`;
};

/**
 * 통계 재계산
 */
plannerCommissionSchema.methods.recalculateStats = function() {
  this.totalUsers = this.users.length;
  this.totalRevenue = this.users.reduce((sum, u) => sum + (u.revenue || 0), 0);
  this.totalCommission = this.users.reduce((sum, u) => sum + (u.commission || 0), 0);
};

/**
 * 용역자 추가
 */
plannerCommissionSchema.methods.addUser = function(userId, userName, registrationDate) {
  // 중복 확인
  const exists = this.users.some(u => u.userId === userId);
  if (exists) {
    return false;
  }

  // 용역자 추가
  this.users.push({
    userId,
    userName,
    registrationDate,
    revenue: 1000000,
    commission: 100000
  });

  // 통계 재계산
  this.recalculateStats();

  return true;
};

/**
 * 용역자 제거
 */
plannerCommissionSchema.methods.removeUser = function(userId) {
  const index = this.users.findIndex(u => u.userId === userId);
  if (index === -1) {
    return false;
  }

  this.users.splice(index, 1);
  this.recalculateStats();

  return true;
};

/**
 * 지급 처리
 */
plannerCommissionSchema.methods.markAsPaid = function(paidBy) {
  this.paymentStatus = 'paid';
  this.paidAt = new Date();
  this.paidBy = paidBy;
};

// pre-save hook: paymentMonth 자동 계산
plannerCommissionSchema.pre('save', function(next) {
  if (!this.paymentMonth) {
    this.paymentMonth = this.calculatePaymentMonth();
  }
  next();
});

// ⭐ 기존 모델 삭제 후 재생성 (HMR 대응)
if (mongoose.models.PlannerCommission) {
  delete mongoose.models.PlannerCommission;
}

const PlannerCommission = mongoose.model('PlannerCommission', plannerCommissionSchema);

export default PlannerCommission;
