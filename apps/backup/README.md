# NanumPay 백업 시스템

MongoDB 데이터베이스 자동 백업 시스템

## 기능

- ✅ MongoDB mongodump 기반 백업
- ✅ tar.gz 압축
- ✅ AWS S3 업로드 (선택)
- ✅ FTP 업로드 (선택)
- ✅ 보관 정책 (개수/날짜 기반)
- ✅ DB 기반 설정 (설정 파일 불필요)
- ✅ Bun으로 단일 실행 파일 생성

## 빌드

```bash
cd apps/backup
./build.sh
```

빌드 결과: `build/nanumpay-backup` (~25MB)

## 설정

MongoDB의 `admins` 컬렉션에서 백업 설정을 읽습니다.

```javascript
{
  systemSettings: {
    backupSettings: {
      enabled: true,
      backupPath: "/opt/nanumpay/backups",
      retentionDays: 7,        // 7일 이상 경과한 백업 삭제
      retentionCount: 5,       // 최대 5개 백업 유지
      s3: {
        enabled: false,
        bucket: "my-bucket",
        accessKeyId: "...",
        secretAccessKey: "...",
        region: "us-east-1",
        prefix: "backups/"
      },
      ftp: {
        enabled: false,
        host: "ftp.example.com",
        port: 21,
        user: "username",
        password: "password",
        remotePath: "/backups"
      }
    }
  }
}
```

## 실행

### 수동 실행
```bash
./build/nanumpay-backup
```

### Crontab 등록 (매일 새벽 2시)
```bash
0 2 * * * /opt/nanumpay/bin/nanumpay-backup >> /opt/nanumpay/logs/backup.log 2>&1
```

## 테스트

### 개발 환경 테스트
```bash
# 1. MongoDB 실행 확인
mongosh mongodb://localhost:27017/nanumpay

# 2. 백업 설정 활성화
db.admins.updateOne({}, {
  $set: {
    "systemSettings.backupSettings.enabled": true,
    "systemSettings.backupSettings.backupPath": "/tmp/nanumpay-backups-test"
  }
})

# 3. 백업 실행
./build/nanumpay-backup

# 4. 백업 파일 확인
ls -lh /tmp/nanumpay-backups-test/
```

### 보관 정책 테스트
```bash
# 여러 번 실행하여 백업 파일 생성
for i in {1..10}; do
  ./build/nanumpay-backup
  sleep 2
done

# 개수 제한 확인 (retentionCount: 5)
ls /tmp/nanumpay-backups-test/*.tar.gz | wc -l
# 결과: 5개
```

### S3 업로드 테스트
```bash
# S3 설정 활성화
db.admins.updateOne({}, {
  $set: {
    "systemSettings.backupSettings.s3.enabled": true,
    "systemSettings.backupSettings.s3.bucket": "your-bucket",
    "systemSettings.backupSettings.s3.accessKeyId": "...",
    "systemSettings.backupSettings.s3.secretAccessKey": "...",
    "systemSettings.backupSettings.s3.region": "us-east-1"
  }
})

# 백업 실행 (S3 업로드 포함)
./build/nanumpay-backup

# S3 확인
aws s3 ls s3://your-bucket/backups/
```

## 배포

DEB 패키지에 포함됩니다:
- 실행 파일: `/opt/nanumpay/bin/nanumpay-backup`
- 로그: `/opt/nanumpay/logs/backup.log`
- 백업 저장소: `/opt/nanumpay/backups/`

Crontab은 웹 UI에서 관리됩니다.

## 로그 확인

```bash
# 실시간 로그 확인
tail -f /opt/nanumpay/logs/backup.log

# 최근 로그 확인
tail -n 100 /opt/nanumpay/logs/backup.log
```

## 문제 해결

### MongoDB 연결 실패
```bash
# MongoDB 상태 확인
sudo systemctl status mongod

# MongoDB 재시작
sudo systemctl restart mongod
```

### mongodump 명령 없음
```bash
# MongoDB Database Tools 설치
sudo apt-get install mongodb-database-tools
```

### 권한 오류
```bash
# 백업 디렉토리 권한 확인
ls -ld /opt/nanumpay/backups

# 권한 수정
sudo chown -R nanumpay:nanumpay /opt/nanumpay/backups
sudo chmod 755 /opt/nanumpay/backups
```
