import mongoose from 'mongoose';

const adminSchema = new mongoose.Schema({
	name: {
		type: String,
		required: true
	},
	loginId: {
		type: String,
		required: true,
		unique: true,
		lowercase: true
	},
	passwordHash: {
		type: String,
		required: true
	},
	email: {
		type: String,
		sparse: true
	},
	phone: {
		type: String,
		sparse: true
	},
	permissions: [{
		type: String,
		enum: ['user_manage', 'system_config', 'payment_manage', 'report_view', 'full_access']
	}],
	lastLogin: Date,
	loginAttempts: {
		type: Number,
		default: 0
	},
	lockUntil: Date,
	isActive: {
		type: Boolean,
		default: true
	},
	createdAt: {
		type: Date,
		default: Date.now
	},
	updatedAt: Date
});

export const Admin = mongoose.models.Admin || mongoose.model('Admin', adminSchema);