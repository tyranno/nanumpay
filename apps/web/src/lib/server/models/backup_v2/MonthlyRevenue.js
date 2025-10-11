import mongoose from 'mongoose';

const monthlyRevenueSchema = new mongoose.Schema(
  {
    year: { type: Number, required: true },
    month: { type: Number, required: true }, // 1-12
    
    // 매출 정보
    newUsersCount: { type: Number, required: true, default: 0 },
    totalRevenue: { type: Number, required: true, default: 0 },
    revenuePerInstallment: { type: Number, required: true, default: 0 },
    
    // 등급별 분포 (매출 발생 시점)
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
    
    // 등급별 지급액 (회당)
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
    
    // 계산 상태
    isCalculated: { type: Boolean, default: false },
    calculatedAt: { type: Date },
    calculatedBy: { type: String, ref: 'User' },
    
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
  },
  {
    timestamps: true
  }
);

// 인덱스
monthlyRevenueSchema.index({ year: 1, month: 1 }, { unique: true });
monthlyRevenueSchema.index({ isCalculated: 1 });

const MonthlyRevenue = mongoose.models.MonthlyRevenue || mongoose.model('MonthlyRevenue', monthlyRevenueSchema);

export default MonthlyRevenue;