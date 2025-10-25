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
	// 시스템 설정
	systemSettings: {
		maintenanceMode: {
			type: Boolean,
			default: false
		},
		backup: {
			enabled: {
				type: Boolean,
				default: true
			},
			frequency: {
				type: String,
				enum: ['daily', 'weekly', 'monthly'],
				default: 'daily'
			},
			time: {
				type: String,
				default: '02:00' // HH:mm 형식
			},
			dayOfWeek: {
				type: Number,
				min: 0,
				max: 6,
				default: 0 // 0=일요일, 6=토요일
			},
			dayOfMonth: {
				type: Number,
				min: 1,
				max: 31,
				default: 1
			},
			// 보관 정책
			retention: {
				count: {
					type: Number,
					default: 7,
					min: 1,
					max: 365
				},
				days: {
					type: Number,
					default: 30,
					min: 1,
					max: 365
				},
				compress: {
					type: Boolean,
					default: true
				}
			},
			// 백업 저장소 설정
			storage: {
				type: {
					type: String,
					enum: ['s3', 'ftp'],
					default: 'ftp'
				},
				s3: {
					region: {
						type: String,
						default: 'ap-northeast-2' // 서울 리전
					},
					bucket: {
						type: String,
						default: ''
					},
					accessKeyId: {
						type: String,
						default: ''
					},
					secretAccessKey: {
						type: String,
						default: ''
					},
					prefix: {
						type: String,
						default: 'nanumpay-backup/'
					}
				},
				ftp: {
					host: {
						type: String,
						default: ''
					},
					port: {
						type: Number,
						default: 21
					},
					username: {
						type: String,
						default: ''
					},
					password: {
						type: String,
						default: ''
					},
					remotePath: {
						type: String,
						default: '/backup/nanumpay'
					},
					secure: {
						type: Boolean,
						default: false // true: FTPS, false: FTP
					}
				}
			}
		}
	},
	createdAt: {
		type: Date,
		default: Date.now
	},
	updatedAt: Date
});

export const Admin = mongoose.models.Admin || mongoose.model('Admin', adminSchema);