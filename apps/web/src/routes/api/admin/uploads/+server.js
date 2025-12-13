import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db.js';
import UploadHistory from '$lib/server/models/UploadHistory.js';
import fs from 'fs/promises';
import path from 'path';
import zlib from 'zlib';
import { promisify } from 'util';

const gzip = promisify(zlib.gzip);

// 업로드 디렉토리
const UPLOAD_DIR = path.resolve('uploads');

/**
 * GET: 업로드 히스토리 목록 조회
 */
export async function GET({ locals }) {
	// 관리자 권한 확인
	if (!locals.user || !locals.user.isAdmin) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	await db();

	try {
		const history = await UploadHistory.find({})
			.limit(100)
			.lean();

		// 파일명 기준 자연 정렬 (숫자 우선: 7월 < 10월)
		history.sort((a, b) => {
			return a.originalFileName.localeCompare(b.originalFileName, 'ko', { numeric: true });
		});

		return json({
			success: true,
			history
		});
	} catch (error) {
		console.error('Get upload history error:', error);
		return json({ error: '히스토리 조회 중 오류가 발생했습니다.' }, { status: 500 });
	}
}

/**
 * POST: 엑셀 파일 저장 (gzip 압축)
 * Body: FormData with 'file' field
 */
export async function POST({ request, locals }) {
	// 관리자 권한 확인
	if (!locals.user || !locals.user.isAdmin) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	await db();

	try {
		const formData = await request.formData();
		const file = formData.get('file');

		if (!file || !(file instanceof File)) {
			return json({ error: '파일이 없습니다.' }, { status: 400 });
		}

		// 업로드 디렉토리 생성
		await fs.mkdir(UPLOAD_DIR, { recursive: true });

		// 고유 파일명 생성 (timestamp + random + .gz)
		const timestamp = Date.now();
		const random = Math.random().toString(36).substring(2, 8);
		const ext = path.extname(file.name) || '.xlsx';
		const savedFileName = `${timestamp}_${random}${ext}.gz`;  // .gz 확장자 추가
		const filePath = path.join(UPLOAD_DIR, savedFileName);

		// 파일을 gzip으로 압축하여 저장
		const arrayBuffer = await file.arrayBuffer();
		const originalBuffer = Buffer.from(arrayBuffer);
		const compressedBuffer = await gzip(originalBuffer);
		await fs.writeFile(filePath, compressedBuffer);

		// 히스토리 기록
		const uploadRecord = new UploadHistory({
			originalFileName: file.name,
			savedFileName,
			filePath,
			fileSize: file.size,  // 원본 크기 저장
			uploadedBy: {
				userId: locals.user._id,
				userName: locals.user.name || locals.user.loginId
			},
			uploadedAt: new Date()
		});

		await uploadRecord.save();

		const compressionRatio = ((1 - compressedBuffer.length / file.size) * 100).toFixed(1);
		console.log(`📁 파일 저장 완료: ${file.name} → ${savedFileName} (압축률: ${compressionRatio}%)`);

		return json({
			success: true,
			uploadId: uploadRecord._id.toString(),
			savedFileName
		});
	} catch (error) {
		console.error('File upload error:', error);
		return json({ error: '파일 저장 중 오류가 발생했습니다.' }, { status: 500 });
	}
}

/**
 * PUT: 업로드 결과 업데이트 (등록 완료 후)
 */
export async function PUT({ request, locals }) {
	// 관리자 권한 확인
	if (!locals.user || !locals.user.isAdmin) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	await db();

	try {
		const { uploadId, created, failed, total, monthKey } = await request.json();

		if (!uploadId) {
			return json({ error: 'uploadId가 필요합니다.' }, { status: 400 });
		}

		const updated = await UploadHistory.findByIdAndUpdate(
			uploadId,
			{
				$set: {
					'registrationResult.created': created || 0,
					'registrationResult.failed': failed || 0,
					'registrationResult.total': total || 0,
					monthKey: monthKey || null
				}
			},
			{ new: true }
		);

		if (!updated) {
			return json({ error: '업로드 기록을 찾을 수 없습니다.' }, { status: 404 });
		}

		return json({ success: true });
	} catch (error) {
		console.error('Update upload history error:', error);
		return json({ error: '업데이트 중 오류가 발생했습니다.' }, { status: 500 });
	}
}
