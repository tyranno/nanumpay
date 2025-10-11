import mongoose from 'mongoose';

/**
 * 월별 계층도 스냅샷
 * v5.0: 월별 계층도 및 등급 확정
 */
const monthlyTreeSnapshotsSchema = new mongoose.Schema(
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

    // 스냅샷 생성 일시
    snapshotDate: {
      type: Date,
      required: true
    },

    // 전체 용역자 수
    totalUsers: {
      type: Number,
      required: true,
      default: 0
    },

    // 사용자 스냅샷
    users: [{
      userId: { type: String, required: true },
      userName: { type: String, required: true },
      grade: { type: String, required: true },  // 해당 월 확정 등급
      registrationDate: { type: Date, required: true },

      // 트리 구조
      sponsorId: { type: String },
      leftChildId: { type: String },
      rightChildId: { type: String },
      leftSubtreeCount: { type: Number, default: 0 },
      rightSubtreeCount: { type: Number, default: 0 },
      depth: { type: Number, default: 0 },
      position: {
        type: String,
        enum: ['left', 'right', 'root']
      },

      // 등급별 서브트리 카운트 (등급 계산용)
      leftSubtree: {
        F1: { type: Number, default: 0 },
        F2: { type: Number, default: 0 },
        F3: { type: Number, default: 0 },
        F4: { type: Number, default: 0 },
        F5: { type: Number, default: 0 },
        F6: { type: Number, default: 0 },
        F7: { type: Number, default: 0 },
        F8: { type: Number, default: 0 }
      },
      rightSubtree: {
        F1: { type: Number, default: 0 },
        F2: { type: Number, default: 0 },
        F3: { type: Number, default: 0 },
        F4: { type: Number, default: 0 },
        F5: { type: Number, default: 0 },
        F6: { type: Number, default: 0 },
        F7: { type: Number, default: 0 },
        F8: { type: Number, default: 0 }
      },

      // 보험 조건 (F3 이상)
      insuranceSettings: {
        required: { type: Boolean, default: false },  // F3 이상 자동 true
        amount: { type: Number, default: 0 },         // 관리자가 입력한 보험금액
        maintained: { type: Boolean, default: false }, // 관리자가 설정한 유지 상태
        lastUpdated: { type: Date },
        updatedBy: { type: String }                   // 수정한 관리자 ID
      },

      // 활성 지급 계획 정보
      activePaymentPlans: [{
        planId: { type: mongoose.Schema.Types.ObjectId },
        planType: {
          type: String,
          enum: ['initial', 'promotion', 'additional']
        },
        baseGrade: { type: String },
        startMonth: { type: String },  // 지급 시작 월
        currentInstallment: { type: Number },
        totalInstallments: { type: Number },
        status: {
          type: String,
          enum: ['active', 'completed', 'terminated']
        }
      }]
    }],

    // 통계
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

    // 메타 정보
    isFinalized: { type: Boolean, default: false },  // 월이 끝나고 확정되었는지
    createdAt: { type: Date, default: Date.now }
  },
  {
    timestamps: false
  }
);

// 인덱스
monthlyTreeSnapshotsSchema.index({ monthKey: 1 }, { unique: true });
monthlyTreeSnapshotsSchema.index({ 'users.userId': 1 });
monthlyTreeSnapshotsSchema.index({ 'users.grade': 1 });
monthlyTreeSnapshotsSchema.index({ snapshotDate: -1 });

// 정적 메소드: 월 키 생성
monthlyTreeSnapshotsSchema.statics.generateMonthKey = function(date) {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
};

// 정적 메소드: 특정 사용자의 확정 등급 조회
monthlyTreeSnapshotsSchema.statics.getUserConfirmedGrade = async function(monthKey, userId) {
  const snapshot = await this.findOne({
    monthKey,
    'users.userId': userId
  });

  if (!snapshot) return null;

  const userSnapshot = snapshot.users.find(u => u.userId === userId);
  return userSnapshot ? userSnapshot.grade : null;
};

const MonthlyTreeSnapshots = mongoose.models.MonthlyTreeSnapshots ||
  mongoose.model('MonthlyTreeSnapshots', monthlyTreeSnapshotsSchema);

export default MonthlyTreeSnapshots;