// config.js - MongoDB에서 백업 설정 읽기
import mongoose from 'mongoose';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/nanumpay';

// Admin 모델 정의 (설정 읽기용) - 기존 UI 구조에 맞춤
const adminSchema = new mongoose.Schema({
  systemSettings: {
    backup: {
      enabled: { type: Boolean, default: false },
      frequency: { type: String, default: 'daily' }, // 'daily', 'weekly', 'monthly'
      time: { type: String, default: '02:00' }, // 'HH:mm'
      dayOfWeek: { type: Number, default: 0 }, // 0=일요일, 6=토요일
      dayOfMonth: { type: Number, default: 1 }, // 1-31
      retention: {
        count: { type: Number, default: 7 },
        days: { type: Number, default: 30 },
        compress: { type: Boolean, default: true }
      },
      storage: {
        type: { type: String, default: 'ftp' }, // 's3' or 'ftp'
        s3: {
          region: String,
          bucket: String,
          accessKeyId: String,
          secretAccessKey: String,
          prefix: String
        },
        ftp: {
          host: String,
          port: { type: Number, default: 21 },
          username: String,
          password: String,
          remotePath: String,
          secure: { type: Boolean, default: false }
        }
      }
    }
  }
}, { collection: 'admins' });

const Admin = mongoose.model('Admin', adminSchema);

export async function connectDB() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ MongoDB 연결 성공');
    return true;
  } catch (error) {
    console.error('❌ MongoDB 연결 실패:', error.message);
    return false;
  }
}

export async function getBackupConfig() {
  try {
    const admin = await Admin.findOne().select('systemSettings.backup');
    if (!admin || !admin.systemSettings?.backup) {
      console.error('❌ 백업 설정을 찾을 수 없습니다.');
      return null;
    }

    const backup = admin.systemSettings.backup;

    // 백업 활성화 확인
    if (!backup.enabled) {
      console.log('ℹ️  백업이 비활성화되어 있습니다.');
      return null;
    }

    // 기존 UI 구조를 백업 앱이 사용하는 구조로 변환
    const config = {
      enabled: backup.enabled,
      // 개발 환경에서는 /tmp, 프로덕션에서는 /opt/nanumpay/backups
      backupPath: process.env.BACKUP_PATH || '/opt/nanumpay/backups',
      retentionDays: backup.retention?.days || 30,
      retentionCount: backup.retention?.count || 7,
      s3: null,
      ftp: null
    };

    // S3 설정 변환
    if (backup.storage?.type === 's3' && backup.storage.s3) {
      config.s3 = {
        enabled: true,
        bucket: backup.storage.s3.bucket || '',
        accessKeyId: backup.storage.s3.accessKeyId || '',
        secretAccessKey: backup.storage.s3.secretAccessKey || '',
        region: backup.storage.s3.region || 'us-east-1',
        prefix: backup.storage.s3.prefix || 'backups/'
      };
    }

    // FTP 설정 변환
    if (backup.storage?.type === 'ftp' && backup.storage.ftp) {
      config.ftp = {
        enabled: true,
        host: backup.storage.ftp.host || '',
        port: backup.storage.ftp.port || 21,
        user: backup.storage.ftp.username || '',
        password: backup.storage.ftp.password || '',
        remotePath: backup.storage.ftp.remotePath || '/backups'
      };
    }

    return config;
  } catch (error) {
    console.error('❌ 백업 설정 읽기 실패:', error.message);
    return null;
  }
}

export async function disconnectDB() {
  try {
    await mongoose.disconnect();
    console.log('✅ MongoDB 연결 종료');
  } catch (error) {
    console.error('❌ MongoDB 연결 종료 실패:', error.message);
  }
}
