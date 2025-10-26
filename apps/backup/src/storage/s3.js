// storage/s3.js - AWS S3 업로드
import AWS from 'aws-sdk';
import { readFileSync, statSync } from 'fs';
import { basename } from 'path';

export async function uploadToS3(filePath, config) {
  if (!config.s3 || !config.s3.enabled) {
    console.log('ℹ️  S3 업로드가 비활성화되어 있습니다.');
    return false;
  }

  try {
    console.log('☁️  S3 업로드 시작...');

    // S3 클라이언트 설정
    const s3 = new AWS.S3({
      accessKeyId: config.s3.accessKeyId,
      secretAccessKey: config.s3.secretAccessKey,
      region: config.s3.region || 'us-east-1'
    });

    // 파일 읽기
    const fileContent = readFileSync(filePath);
    const fileName = basename(filePath);
    const s3Key = (config.s3.prefix || 'backups/') + fileName;

    // 업로드 파라미터
    const params = {
      Bucket: config.s3.bucket,
      Key: s3Key,
      Body: fileContent,
      ContentType: 'application/gzip'
    };

    // 파일 크기 확인
    const fileSize = statSync(filePath).size;
    const fileSizeMB = (fileSize / (1024 * 1024)).toFixed(2);
    console.log(`📤 업로드 중: ${fileName} (${fileSizeMB} MB)`);

    // S3 업로드
    await s3.upload(params).promise();

    console.log(`✅ S3 업로드 완료: s3://${config.s3.bucket}/${s3Key}`);
    return true;

  } catch (error) {
    console.error('❌ S3 업로드 실패:', error.message);
    return false;
  }
}
