#!/usr/bin/env node
// index.js - 백업 시스템 메인 진입점
import { connectDB, getBackupConfig, disconnectDB } from './config.js';
import { createBackup, cleanupOldBackups } from './backup.js';
import { uploadToS3 } from './storage/s3.js';
import { uploadToFTP } from './storage/ftp.js';

async function main() {
  console.log('🚀 NanumPay 백업 시스템 시작');
  console.log('==============================');
  console.log(`실행 시간: ${new Date().toLocaleString('ko-KR')}`);
  console.log('');

  let exitCode = 0;

  try {
    // 1. MongoDB 연결
    const connected = await connectDB();
    if (!connected) {
      console.error('❌ MongoDB 연결 실패. 백업을 중단합니다.');
      process.exit(1);
    }

    // 2. 백업 설정 읽기
    const config = await getBackupConfig();
    if (!config) {
      console.log('ℹ️  백업이 비활성화되어 있거나 설정을 읽을 수 없습니다.');
      await disconnectDB();
      process.exit(0);
    }

    console.log('✅ 백업 설정 로드 완료');
    console.log(`   백업 경로: ${config.backupPath}`);
    console.log(`   보관 기간: ${config.retentionDays}일`);
    console.log(`   보관 개수: ${config.retentionCount}개`);
    console.log(`   S3 업로드: ${config.s3?.enabled ? '활성화' : '비활성화'}`);
    console.log(`   FTP 업로드: ${config.ftp?.enabled ? '활성화' : '비활성화'}`);
    console.log('');

    // 3. 백업 생성
    const backupFile = createBackup(config);
    console.log('');

    // 4. 원격 저장소 업로드
    if (config.s3?.enabled || config.ftp?.enabled) {
      console.log('📤 원격 저장소 업로드 시작...');

      // S3 업로드
      if (config.s3?.enabled) {
        const s3Success = await uploadToS3(backupFile, config);
        if (!s3Success) {
          console.error('⚠️  S3 업로드 실패 (백업은 로컬에 저장됨)');
          exitCode = 1;
        }
      }

      // FTP 업로드
      if (config.ftp?.enabled) {
        const ftpSuccess = await uploadToFTP(backupFile, config);
        if (!ftpSuccess) {
          console.error('⚠️  FTP 업로드 실패 (백업은 로컬에 저장됨)');
          exitCode = 1;
        }
      }

      console.log('');
    }

    // 5. 오래된 백업 정리
    cleanupOldBackups(config);
    console.log('');

    // 6. MongoDB 연결 종료
    await disconnectDB();

    console.log('==============================');
    if (exitCode === 0) {
      console.log('✅ 백업 완료!');
    } else {
      console.log('⚠️  백업 완료 (일부 업로드 실패)');
    }
    console.log(`종료 시간: ${new Date().toLocaleString('ko-KR')}`);

  } catch (error) {
    console.error('');
    console.error('==============================');
    console.error('❌ 백업 실패:', error.message);
    console.error('스택 트레이스:', error.stack);
    console.error('==============================');
    exitCode = 1;
  }

  process.exit(exitCode);
}

// 스크립트 직접 실행 시
main();
