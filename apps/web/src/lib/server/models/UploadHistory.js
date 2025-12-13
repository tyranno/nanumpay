import mongoose from 'mongoose';

/**
 * 엑셀 업로드 히스토리 컬렉션
 * - 업로드된 엑셀 파일 정보 및 저장 경로 관리
 */
const uploadHistorySchema = new mongoose.Schema(
	{
		// 원본 파일명
		originalFileName: {
			type: String,
			required: true
		},

		// 저장된 파일명 (중복 방지용 고유 이름)
		savedFileName: {
			type: String,
			required: true,
			unique: true
		},

		// 파일 경로 (서버 내 저장 위치)
		filePath: {
			type: String,
			required: true
		},

		// 파일 크기 (bytes)
		fileSize: {
			type: Number,
			default: 0
		},

		// 업로드한 관리자 정보
		uploadedBy: {
			userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
			userName: { type: String }
		},

		// 등록 결과
		registrationResult: {
			created: { type: Number, default: 0 },
			failed: { type: Number, default: 0 },
			total: { type: Number, default: 0 }
		},

		// 해당 월 키 (YYYY-MM)
		monthKey: {
			type: String,
			validate: {
				validator: function (v) {
					return !v || /^\d{4}-(0[1-9]|1[0-2])$/.test(v);
				},
				message: 'monthKey must be in YYYY-MM format'
			}
		},

		// 업로드 시각
		uploadedAt: {
			type: Date,
			default: Date.now
		},

		// 메모/비고
		note: {
			type: String,
			default: ''
		}
	},
	{
		timestamps: true
	}
);

// 인덱스
uploadHistorySchema.index({ uploadedAt: -1 });
uploadHistorySchema.index({ monthKey: 1 });
uploadHistorySchema.index({ savedFileName: 1 });

const UploadHistory = mongoose.models.UploadHistory || mongoose.model('UploadHistory', uploadHistorySchema);

export default UploadHistory;
