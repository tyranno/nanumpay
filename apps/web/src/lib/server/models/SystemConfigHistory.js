import mongoose from 'mongoose';

const systemConfigHistorySchema = new mongoose.Schema({
	configId: {
		type: mongoose.Schema.Types.ObjectId,
		ref: 'SystemConfig',
		required: true
	},
	category: {
		type: String,
		required: true
	},
	key: {
		type: String,
		required: true
	},
	oldValue: {
		type: mongoose.Schema.Types.Mixed,
		required: true
	},
	newValue: {
		type: mongoose.Schema.Types.Mixed,
		required: true
	},
	changeReason: {
		type: String,
		required: true
	},
	changedBy: {
		type: String,
		required: true
	},
	changedAt: {
		type: Date,
		default: Date.now
	},
	version: {
		type: Number,
		required: true
	},
	rollbackable: {
		type: Boolean,
		default: true
	}
});

// 인덱스
systemConfigHistorySchema.index({ configId: 1 });
systemConfigHistorySchema.index({ key: 1 });
systemConfigHistorySchema.index({ changedAt: -1 });
systemConfigHistorySchema.index({ changedBy: 1 });

const SystemConfigHistory = mongoose.models.SystemConfigHistory ||
	mongoose.model('SystemConfigHistory', systemConfigHistorySchema, 'systemconfighistory');

export { SystemConfigHistory };