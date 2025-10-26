// storage/ftp.js - FTP 업로드
import FTP from 'ftp';
import { createReadStream, statSync } from 'fs';
import { basename, join } from 'path';

export async function uploadToFTP(filePath, config) {
  if (!config.ftp || !config.ftp.enabled) {
    console.log('ℹ️  FTP 업로드가 비활성화되어 있습니다.');
    return false;
  }

  return new Promise((resolve) => {
    try {
      console.log('📡 FTP 업로드 시작...');

      const client = new FTP();
      const fileName = basename(filePath);
      const remotePath = join(config.ftp.remotePath || '/backups', fileName);

      // 파일 크기 확인
      const fileSize = statSync(filePath).size;
      const fileSizeMB = (fileSize / (1024 * 1024)).toFixed(2);
      console.log(`📤 업로드 중: ${fileName} (${fileSizeMB} MB)`);

      client.on('ready', () => {
        console.log('✅ FTP 연결 성공');

        // 원격 디렉토리 확인 및 생성
        const remoteDir = config.ftp.remotePath || '/backups';
        client.mkdir(remoteDir, true, (mkdirErr) => {
          if (mkdirErr && mkdirErr.code !== 550) { // 550 = 디렉토리 이미 존재
            console.warn(`⚠️  디렉토리 생성 실패 (무시): ${mkdirErr.message}`);
          }

          // 파일 업로드
          client.put(createReadStream(filePath), remotePath, (err) => {
            if (err) {
              console.error('❌ FTP 업로드 실패:', err.message);
              client.end();
              resolve(false);
              return;
            }

            console.log(`✅ FTP 업로드 완료: ${remotePath}`);
            client.end();
            resolve(true);
          });
        });
      });

      client.on('error', (err) => {
        console.error('❌ FTP 연결 실패:', err.message);
        resolve(false);
      });

      // FTP 연결
      client.connect({
        host: config.ftp.host,
        port: config.ftp.port || 21,
        user: config.ftp.user,
        password: config.ftp.password
      });

    } catch (error) {
      console.error('❌ FTP 업로드 실패:', error.message);
      resolve(false);
    }
  });
}
