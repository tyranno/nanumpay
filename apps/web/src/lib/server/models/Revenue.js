import mongoose from 'mongoose';

const revenueSchema = new mongoose.Schema({
	year: { type: Number, required: true },
	month: { type: Number, required: true }, // 1-12
	totalAmount: { type: Number, default: 0 },
	installmentAmount: { type: Number, default: 0 }, // totalAmount / 10
	newMembers: { type: Number, required: true },
	gradeDistribution: {
		type: Map,
		of: {
			count: Number,
			ratio: Number,
			totalAmount: Number
		}
	},
	status: {
		type: String,
		enum: ['active', 'cancelled'],
		default: 'active'
	},
	createdAt: { type: Date, default: Date.now },
	updatedAt: { type: Date, default: Date.now }
});

// 복합 인덱스: 연도와 월로 유니크
revenueSchema.index({ year: 1, month: 1 }, { unique: true });

// 매출 생성 또는 업데이트 시 분할금액 자동 계산
revenueSchema.pre('save', function(next) {
	this.installmentAmount = Math.floor(this.totalAmount / 10);
	this.updatedAt = Date.now();
	next();
});

const Revenue = mongoose.models.Revenue || mongoose.model('Revenue', revenueSchema);

export default Revenue;