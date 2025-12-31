import mongoose from 'mongoose';

/**
 * 엑셀 업로드 히스토리 컬렉션
 * - 업로드된 엑셀 파일 정보 및 DB 저장 (gzip 압축)
 * - v8.1: DB 저장 방식으로 변경 (파일 시스템 사용 안 함)
 */
const uploadHistorySchema = new mongoose.Schema(
	{
		// 원본 파일명
		originalFileName: {
			type: String,
			required: true
		},

		// 저장된 파일명 (중복 방지용 고유 이름) - 호환성 유지
		savedFileName: {
			type: String,
			required: true,
			unique: true
		},

		// ⭐ v8.1: 파일 데이터 (gzip 압축된 Buffer)
		fileData: {
			type: Buffer,
			required: false  // 기존 레코드 호환성
		},

		// 파일 경로 (레거시, v8.1부터 사용 안 함)
		filePath: {
			type: String,
			required: false  // v8.1: optional로 변경
		},

		// 파일 크기 (bytes, 원본 크기)
		fileSize: {
			type: Number,
			default: 0
		},

		// 압축된 크기 (bytes)
		compressedSize: {
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
