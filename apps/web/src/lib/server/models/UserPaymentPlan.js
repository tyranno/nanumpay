import mongoose from 'mongoose';

const userPaymentPlanSchema = new mongoose.Schema(
  {
    // 매출 정보
    revenueMonth: {
      year: { type: Number, required: true },
      month: { type: Number, required: true }
    },
    totalRevenue: { type: Number, required: true }, // 해당 월 총매출
    revenuePerInstallment: { type: Number, required: true }, // 회당 금액 (총매출/10)
    
    // 사용자 정보 (매출 발생 시점에 고정)
    userId: { type: String, required: true, ref: 'User' },
    userName: { type: String, required: true },
    grade: { type: String, required: true }, // 매출 발생 시점 등급
    
    // 지급 정보
    amountPerInstallment: { type: Number, required: true }, // 회당 지급액
    totalAmount: { type: Number, required: true }, // 총 지급액 (10회분)
    
    // 지급 스케줄 (10회)
    installments: [{
      installmentNumber: { type: Number, required: true }, // 1-10
      scheduledDate: {
        year: { type: Number, required: true },
        month: { type: Number, required: true },
        week: { type: Number, required: true }
      },
      amount: { type: Number, required: true },
      status: { 
        type: String, 
        enum: ['pending', 'paid', 'cancelled'],
        default: 'pending'
      },
      paidAt: { type: Date },
      paymentId: { type: mongoose.Schema.Types.ObjectId, ref: 'WeeklyPayment' }
    }],
    
    // 메타 정보
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
  },
  {
    timestamps: true
  }
);

// 인덱스
userPaymentPlanSchema.index({ userId: 1, 'revenueMonth.year': 1, 'revenueMonth.month': 1 });
userPaymentPlanSchema.index({ 'installments.scheduledDate.year': 1, 'installments.scheduledDate.month': 1, 'installments.scheduledDate.week': 1 });
userPaymentPlanSchema.index({ 'installments.status': 1 });

const UserPaymentPlan = mongoose.models.UserPaymentPlan || mongoose.model('UserPaymentPlan', userPaymentPlanSchema);

export default UserPaymentPlan;