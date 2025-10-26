// backup.js - MongoDB 백업 실행
import { execSync } from 'child_process';
import { existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from 'fs';
import { join, basename } from 'path';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/nanumpay';

export function createBackup(config) {
  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const backupName = `nanumpay-backup-${timestamp}`;
    const backupPath = config.backupPath || '/opt/nanumpay/backups';
    const backupDir = join(backupPath, backupName);

    console.log(`📦 백업 시작: ${backupName}`);

    // 백업 디렉토리 생성
    if (!existsSync(backupPath)) {
      mkdirSync(backupPath, { recursive: true });
      console.log(`✅ 백업 디렉토리 생성: ${backupPath}`);
    }

    // mongodump 실행
    console.log('🗄️  mongodump 실행 중...');
    execSync(`mongodump --uri="${MONGODB_URI}" --out="${backupDir}"`, {
      stdio: 'inherit'
    });
    console.log('✅ mongodump 완료');

    // 압축
    console.log('🗜️  압축 중...');
    const tarFile = `${backupDir}.tar.gz`;
    execSync(`tar -czf "${tarFile}" -C "${backupPath}" "${backupName}"`, {
      stdio: 'inherit'
    });
    console.log(`✅ 압축 완료: ${basename(tarFile)}`);

    // 압축 전 디렉토리 삭제
    execSync(`rm -rf "${backupDir}"`, { stdio: 'inherit' });

    return tarFile;
  } catch (error) {
    console.error('❌ 백업 실패:', error.message);
    throw error;
  }
}

export function cleanupOldBackups(config) {
  try {
    const backupPath = config.backupPath || '/opt/nanumpay/backups';

    if (!existsSync(backupPath)) {
      console.log('ℹ️  백업 디렉토리가 없습니다. 정리 건너뜀.');
      return;
    }

    console.log('🧹 오래된 백업 정리 중...');

    // 백업 파일 목록 가져오기 (.tar.gz 파일만)
    const files = readdirSync(backupPath)
      .filter(f => f.startsWith('nanumpay-backup-') && f.endsWith('.tar.gz'))
      .map(f => ({
        name: f,
        path: join(backupPath, f),
        mtime: statSync(join(backupPath, f)).mtime
      }))
      .sort((a, b) => b.mtime - a.mtime); // 최신순 정렬

    console.log(`📊 전체 백업 파일 수: ${files.length}개`);

    let deletedCount = 0;

    // 1. 개수 기반 정리 (retentionCount)
    if (config.retentionCount && config.retentionCount > 0) {
      const toDeleteByCount = files.slice(config.retentionCount);
      console.log(`🔢 개수 기준 삭제 대상: ${toDeleteByCount.length}개 (최대 ${config.retentionCount}개 유지)`);

      for (const file of toDeleteByCount) {
        unlinkSync(file.path);
        console.log(`  🗑️  삭제: ${file.name}`);
        deletedCount++;
      }
    }

    // 2. 날짜 기반 정리 (retentionDays)
    if (config.retentionDays && config.retentionDays > 0) {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - config.retentionDays);

      const remainingFiles = readdirSync(backupPath)
        .filter(f => f.startsWith('nanumpay-backup-') && f.endsWith('.tar.gz'))
        .map(f => ({
          name: f,
          path: join(backupPath, f),
          mtime: statSync(join(backupPath, f)).mtime
        }));

      const toDeleteByDate = remainingFiles.filter(f => f.mtime < cutoffDate);
      console.log(`📅 날짜 기준 삭제 대상: ${toDeleteByDate.length}개 (${config.retentionDays}일 이상 경과)`);

      for (const file of toDeleteByDate) {
        if (existsSync(file.path)) {
          unlinkSync(file.path);
          console.log(`  🗑️  삭제: ${file.name}`);
          deletedCount++;
        }
      }
    }

    console.log(`✅ 정리 완료: ${deletedCount}개 파일 삭제`);

    // 남은 파일 수 확인
    const remainingCount = readdirSync(backupPath)
      .filter(f => f.startsWith('nanumpay-backup-') && f.endsWith('.tar.gz'))
      .length;
    console.log(`📊 남은 백업 파일 수: ${remainingCount}개`);

  } catch (error) {
    console.error('❌ 백업 정리 실패:', error.message);
    throw error;
  }
}
