import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db.js';
import UploadHistory from '$lib/server/models/UploadHistory.js';
import zlib from 'zlib';
import { promisify } from 'util';

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

/**
 * GET: 업로드 히스토리 목록 조회 또는 파일 다운로드
 * - downloadId 파라미터 있으면: 파일 다운로드
 * - downloadId 파라미터 없으면: 히스토리 목록 조회
 */
export async function GET({ url, locals }) {
	// 관리자 권한 확인
	if (!locals.user || !locals.user.isAdmin) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	await db();

	try {
		const downloadId = url.searchParams.get('downloadId');

		// ⭐ v8.1: 파일 다운로드 (DB 또는 파일 시스템)
		if (downloadId) {
			const record = await UploadHistory.findById(downloadId);
			if (!record) {
				return json({ error: '파일을 찾을 수 없습니다.' }, { status: 404 });
			}

			let fileBuffer;

			// 1. DB에 fileData가 있으면 사용
			if (record.fileData) {
				fileBuffer = await gunzip(record.fileData);
			}
			// 2. fileData가 없으면 filePath에서 읽기 (레거시)
			else if (record.filePath) {
				try {
					const fs = await import('fs/promises');
					const compressedData = await fs.readFile(record.filePath);
					fileBuffer = await gunzip(compressedData);
				} catch (error) {
					console.error('파일 읽기 실패:', error);
					return json({ error: '파일을 읽을 수 없습니다.' }, { status: 404 });
				}
			}
			// 3. 둘 다 없으면 에러
			else {
				return json({ error: '파일 데이터가 없습니다.' }, { status: 404 });
			}

			// 파일 다운로드 응답
			return new Response(fileBuffer, {
				status: 200,
				headers: {
					'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
					'Content-Disposition': `attachment; filename="${encodeURIComponent(record.originalFileName)}"`,
					'Content-Length': fileBuffer.length.toString()
				}
			});
		}

		// 히스토리 목록 조회
		const history = await UploadHistory.find({})
			.select('-fileData')  // fileData 제외 (용량 절감)
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
 * POST: 엑셀 파일 저장 (DB에 gzip 압축하여 저장)
 * ⭐ v8.1: 파일 시스템 대신 DB Buffer로 저장
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

		// 고유 파일명 생성 (timestamp + random)
		const timestamp = Date.now();
		const random = Math.random().toString(36).substring(2, 8);
		const ext = file.name.split('.').pop() || 'xlsx';
		const savedFileName = `${timestamp}_${random}.${ext}`;

		// 파일을 gzip으로 압축
		const arrayBuffer = await file.arrayBuffer();
		const originalBuffer = Buffer.from(arrayBuffer);
		const compressedBuffer = await gzip(originalBuffer);

		// ⭐ v8.1: DB에 직접 저장
		const uploadRecord = new UploadHistory({
			originalFileName: file.name,
			savedFileName,
			fileData: compressedBuffer,  // DB에 압축 데이터 저장
			filePath: null,  // 파일 시스템 사용 안 함
			fileSize: file.size,  // 원본 크기
			compressedSize: compressedBuffer.length,  // 압축 크기
			uploadedBy: {
				userId: locals.user._id,
				userName: locals.user.name || locals.user.loginId
			},
			uploadedAt: new Date()
		});

		await uploadRecord.save();

		const compressionRatio = ((1 - compressedBuffer.length / file.size) * 100).toFixed(1);
		console.log(`📁 파일 DB 저장 완료: ${file.name} (${file.size.toLocaleString()} → ${compressedBuffer.length.toLocaleString()} bytes, 압축률: ${compressionRatio}%)`);

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
