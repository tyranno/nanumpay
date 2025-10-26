// apps/web/src/routes/api/admin/backup/execute/+server.js
import { json } from '@sveltejs/kit';
import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';

const execFileAsync = promisify(execFile);

/** @type {import('./$types').RequestHandler} */
export async function POST({ locals }) {
	// 관리자 권한 확인
	if (!locals.user || (locals.user.type !== 'admin' && locals.user.role !== 'admin')) {
		return json({ success: false, message: '관리자 권한이 필요합니다.' }, { status: 403 });
	}

	try {
		// 백업 앱 경로 확인
		const backupAppPath = process.env.BACKUP_APP_PATH || '/opt/nanumpay/bin/nanumpay-backup';

		// 개발 환경에서는 로컬 빌드 경로 사용
		let actualBackupPath = backupAppPath;
		if (process.env.NODE_ENV !== 'production') {
			// 여러 경로 시도
			const possiblePaths = [
				path.join(process.cwd(), '..', '..', 'backup', 'build', 'nanumpay-backup'),
				path.join(process.cwd(), '..', 'backup', 'build', 'nanumpay-backup'),
				'/home/tyranno/project/bill/nanumpay/apps/backup/build/nanumpay-backup'
			];

			for (const devPath of possiblePaths) {
				try {
					await fs.access(devPath);
					actualBackupPath = devPath;
					console.log(`[backup-execute] 백업 앱 경로 찾음: ${devPath}`);
					break;
				} catch {
					// 다음 경로 시도
				}
			}
		}

		// 백업 앱 실행 가능 확인
		try {
			await fs.access(actualBackupPath);
		} catch {
			return json({
				success: false,
				message: '백업 앱을 찾을 수 없습니다. 시스템 관리자에게 문의하세요.'
			}, { status: 500 });
		}

		console.log(`[backup-execute] 백업 실행 시작: ${actualBackupPath}`);

		// 백업 디렉토리 설정 (개발/프로덕션 환경 구분)
		const backupDir = process.env.BACKUP_PATH || '/opt/nanumpay/backups';

		// 백업 실행 (타임아웃 5분)
		// exit code 1은 FTP/S3 업로드 실패일 수 있으므로 무시
		let stdout;
		try {
			const result = await execFileAsync(actualBackupPath, [], {
				timeout: 300000, // 5분
				env: {
					...process.env,
					MONGODB_URI: process.env.MONGODB_URI || 'mongodb://localhost:27017/nanumpay',
					BACKUP_PATH: backupDir,
					FORCE_BACKUP: 'true' // 웹 UI에서 즉시 백업 버튼 클릭 시 강제 실행
				}
			});
			stdout = result.stdout;
		} catch (error) {
			// exit code 1이지만 stdout이 있으면 백업은 성공한 것
			if (error.stdout && error.stdout.includes('✅ 압축 완료')) {
				stdout = error.stdout;
				console.log('[backup-execute] 백업 성공 (업로드 일부 실패 무시)');
			} else {
				throw error;
			}
		}

		console.log(`[backup-execute] stdout:`, stdout);

		// stdout에서 백업 파일 경로 추출
		// 예: "✅ 압축 완료: nanumpay-backup-2025-10-26T03-55-12.tar.gz"
		const backupFileMatch = stdout.match(/압축 완료:\s*(.+\.tar\.gz)/);

		if (!backupFileMatch) {
			console.error('[backup-execute] 백업 파일 경로를 찾을 수 없습니다:', stdout);
			// FTP 업로드 실패는 무시하고, 압축 파일 자체만 확인
			const altMatch = stdout.match(/nanumpay-backup-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.tar\.gz/);
			if (altMatch) {
				const filename = altMatch[0];
				const backupFilePath = path.join(backupDir, filename);
				console.log(`[backup-execute] 대체 방법으로 백업 파일 찾음: ${filename}`);

				try {
					await fs.access(backupFilePath);
					return json({
						success: true,
						message: '백업이 성공적으로 완료되었습니다.',
						backupFile: {
							path: backupFilePath,
							filename: filename
						}
					});
				} catch {
					// continue to error
				}
			}

			return json({
				success: false,
				message: '백업 파일을 찾을 수 없습니다.'
			}, { status: 500 });
		}

		const filename = backupFileMatch[1].trim();
		const backupFilePath = path.join(backupDir, filename);
		console.log(`[backup-execute] 백업 파일: ${backupFilePath}`);

		// 파일 존재 확인
		try {
			await fs.access(backupFilePath);
		} catch {
			return json({
				success: false,
				message: `백업 파일을 찾을 수 없습니다: ${backupFilePath}`
			}, { status: 500 });
		}

		// 오래된 백업 파일 정리 (최신 1개만 유지)
		try {
			const files = await fs.readdir(backupDir);
			const backupFiles = files
				.filter(f => f.startsWith('nanumpay-backup-') && f.endsWith('.tar.gz'))
				.map(f => ({
					name: f,
					path: path.join(backupDir, f),
					stat: null
				}));

			// 파일 정보 가져오기
			for (const file of backupFiles) {
				try {
					file.stat = await fs.stat(file.path);
				} catch (e) {
					// 파일 접근 실패 시 무시
				}
			}

			// 시간순 정렬 (최신 먼저)
			backupFiles.sort((a, b) => {
				if (!a.stat || !b.stat) return 0;
				return b.stat.mtime - a.stat.mtime;
			});

			// 최신 1개 제외하고 삭제
			const filesToDelete = backupFiles.slice(1);
			for (const file of filesToDelete) {
				try {
					await fs.unlink(file.path);
					console.log(`[backup-cleanup] 오래된 백업 삭제: ${file.name}`);
				} catch (e) {
					console.error(`[backup-cleanup] 삭제 실패: ${file.name}`, e.message);
				}
			}

			// 압축 해제된 임시 디렉토리 정리
			const dirs = files.filter(f => f.startsWith('nanumpay-backup-') && !f.endsWith('.tar.gz'));
			for (const dir of dirs) {
				try {
					const dirPath = path.join(backupDir, dir);
					await fs.rm(dirPath, { recursive: true, force: true });
					console.log(`[backup-cleanup] 임시 디렉토리 삭제: ${dir}`);
				} catch (e) {
					console.error(`[backup-cleanup] 디렉토리 삭제 실패: ${dir}`, e.message);
				}
			}

			console.log(`[backup-cleanup] 정리 완료 (유지: ${backupFiles[0]?.name || filename})`);
		} catch (cleanupError) {
			// 정리 실패해도 백업은 성공으로 처리
			console.error('[backup-cleanup] 정리 중 오류:', cleanupError.message);
		}

		return json({
			success: true,
			message: '백업이 성공적으로 완료되었습니다.',
			backupFile: {
				path: backupFilePath,
				filename: filename
			}
		});

	} catch (error) {
		console.error('[backup-execute] 백업 실행 실패:', error);

		let errorMessage = '백업 실행 중 오류가 발생했습니다.';
		if (error.code === 'ETIMEDOUT') {
			errorMessage = '백업 실행 시간이 초과되었습니다. (5분)';
		} else if (error.stderr) {
			errorMessage = `백업 오류: ${error.stderr}`;
		}

		return json({
			success: false,
			message: errorMessage,
			error: error.message
		}, { status: 500 });
	}
}
