import mongoose from 'mongoose';

const systemConfigSchema = new mongoose.Schema({
	configType: {
		type: String,
		default: 'current',
		unique: true
	},

	// 등급별 비율
	gradeRatios: {
		F1: { type: Number, default: 0.24 },
		F2: { type: Number, default: 0.19 },
		F3: { type: Number, default: 0.14 },
		F4: { type: Number, default: 0.09 },
		F5: { type: Number, default: 0.05 },
		F6: { type: Number, default: 0.03 },
		F7: { type: Number, default: 0.02 },
		F8: { type: Number, default: 0.01 }
	},

	// 등급별 최대 지급 횟수 (변경됨)
	maxPaymentCounts: {
		F1: { type: Number, default: 20 },
		F2: { type: Number, default: 30 },
		F3: { type: Number, default: 30 },  // 40 → 30 변경
		F4: { type: Number, default: 40 },
		F5: { type: Number, default: 40 },  // 50 → 40 변경
		F6: { type: Number, default: 50 },
		F7: { type: Number, default: 50 },  // 60 → 50 변경
		F8: { type: Number, default: 50 }   // 60 → 50 변경
	},

	// F4+ 보험 최소 금액 (⭐ v8.0 변경: F3 보험 불필요)
	minInsuranceAmounts: {
		F4: { type: Number, default: 70000 },
		F5: { type: Number, default: 70000 },
		F6: { type: Number, default: 90000 },
		F7: { type: Number, default: 90000 },
		F8: { type: Number, default: 110000 }
	},

	// 시스템 설정
	withholdingTaxRate: {
		type: Number,
		default: 0.033
	},
	revenuePerUser: {
		type: Number,
		default: 1000000
	},
	installmentCount: {
		type: Number,
		default: 10
	},

	// 설계사 수당 설정
	plannerCommissionByRatio: {
		type: Boolean,
		default: false  // false: 10만원 고정, true: 비율 적용 (10만원 × ratio)
	},

	updatedAt: {
		type: Date,
		default: Date.now
	},
	updatedBy: String
});

// 업데이트 시 자동으로 updatedAt 갱신
systemConfigSchema.pre('save', function(next) {
	this.updatedAt = new Date();
	next();
});

// 정적 메서드: 현재 설정 가져오기
systemConfigSchema.statics.getCurrent = async function() {
	let config = await this.findOne({ configType: 'current' });

	if (!config) {
		// 없으면 기본값으로 생성
		config = await this.create({ configType: 'current' });
	}

	return config;
};

// 정적 메서드: 설정 업데이트
systemConfigSchema.statics.updateConfig = async function(updates, updatedBy) {
	const config = await this.findOneAndUpdate(
		{ configType: 'current' },
		{
			...updates,
			updatedAt: new Date(),
			updatedBy
		},
		{
			new: true,
			upsert: true
		}
	);

	return config;
};

const SystemConfig = mongoose.models.SystemConfig || mongoose.model('SystemConfig', systemConfigSchema);

export default SystemConfig;