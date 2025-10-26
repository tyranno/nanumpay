# Nanumpay 설치 가이드

## 📦 패키지 내용

- `nanumpay_*.deb` - Nanumpay 메인 패키지
- `install.sh` - 자동 설치 스크립트 (권장)
- `README.md` - 이 파일

---

## 🚀 설치 방법

### 방법 1: 자동 설치 스크립트 (권장)

가장 간단한 방법입니다. 의존성을 자동으로 확인하고 설치합니다.

```bash
sudo ./install.sh
```

### 방법 2: apt 사용 (권장)

apt를 사용하면 의존성을 자동으로 처리합니다.

```bash
sudo apt install ./nanumpay_*.deb
```

### 방법 3: dpkg 직접 사용

```bash
# 1. DEB 패키지 설치 시도
sudo dpkg -i nanumpay_*.deb

# 2. 의존성 에러 발생 시 자동 해결
sudo apt-get install -f
```

---

## 📋 필수 요구사항

### 자동 설치되는 항목
- **nginx** - 웹 서버 (포트 80 리버스 프록시)
- adduser
- systemd
- bash

### 별도 설치 필요 (선택사항)
- **MongoDB** - 데이터베이스 (localhost:27017)
- **mongosh** - MongoDB 관리 도구

---

## 🔧 MongoDB 설치 (필수)

Nanumpay는 MongoDB를 사용합니다. 아직 설치하지 않았다면:

```bash
# MongoDB 8.0 설치 (Ubuntu)
wget -qO - https://www.mongodb.org/static/pgp/server-8.0.asc | sudo apt-key add -
echo "deb [ arch=amd64,arm64 ] https://repo.mongodb.org/apt/ubuntu $(lsb_release -cs)/mongodb-org/8.0 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-8.0.list
sudo apt-get update
sudo apt-get install -y mongodb-org mongosh

# MongoDB 시작 및 자동 시작 설정
sudo systemctl start mongod
sudo systemctl enable mongod
```

---

## ✅ 설치 확인

### 1. 서비스 상태 확인
```bash
sudo systemctl status nanumpay
sudo systemctl status nginx
sudo systemctl status mongod
```

### 2. 웹 접속
브라우저에서 다음 주소로 접속:
- **메인**: http://localhost
- **관리자**: http://localhost/admin

### 3. 기본 계정
- **아이디**: 관리자
- **비밀번호**: admin1234!!

> ⚠️ **보안**: 설치 후 반드시 관리자 비밀번호를 변경하세요!

---

## 🛠️ 서비스 관리

### Nanumpay 서비스
```bash
# 상태 확인
sudo systemctl status nanumpay

# 시작
sudo systemctl start nanumpay

# 중지
sudo systemctl stop nanumpay

# 재시작
sudo systemctl restart nanumpay

# 로그 확인
sudo journalctl -u nanumpay -f

# 로그 (최근 100줄)
sudo journalctl -u nanumpay -n 100
```

### Nginx 서비스
```bash
# 상태 확인
sudo systemctl status nginx

# 설정 테스트
sudo nginx -t

# 재시작
sudo systemctl restart nginx

# 로그 확인
sudo tail -f /var/log/nginx/error.log
sudo tail -f /var/log/nginx/nanumpay-access.log
```

### MongoDB 서비스
```bash
# 상태 확인
sudo systemctl status mongod

# 접속
mongosh mongodb://localhost:27017/nanumpay
```

---

## 📂 설치 위치

```
/opt/nanumpay/          # 메인 디렉토리
├── nanumpay            # 실행 파일 (단일 바이너리)
├── backups/            # 백업 파일
├── db/                 # DB 스크립트
├── logs/               # 로그 파일
├── bin/                # 유틸리티
└── tools/              # 관리 도구

/etc/nanumpay/          # 설정 파일
└── nanumpay.env        # 환경 변수

/etc/nginx/sites-available/
└── nanumpay            # Nginx 설정

/etc/systemd/system/
└── nanumpay.service    # systemd 서비스
```

---

## 🔐 환경 변수 설정

설정 파일: `/etc/nanumpay/nanumpay.env`

```bash
PORT=3100
HOST=0.0.0.0
MONGODB_URI=mongodb://localhost:27017/nanumpay
JWT_SECRET=change-me-in-production
JWT_EXPIRES=7d
```

> ⚠️ **중요**: 프로덕션 환경에서는 반드시 `JWT_SECRET`을 변경하세요!

설정 변경 후:
```bash
sudo systemctl restart nanumpay
```

---

## 🗑️ 제거

```bash
# Nanumpay 제거
sudo apt-get remove nanumpay

# 완전 제거 (설정 파일 포함)
sudo apt-get purge nanumpay

# 설치 파일 정리
sudo rm -rf /opt/nanumpay
sudo rm -f /etc/nginx/sites-enabled/nanumpay
sudo rm -f /etc/nginx/sites-available/nanumpay
```

---

## 🆘 문제 해결

### 포트 80이 접속되지 않음
```bash
# Nginx 상태 확인
sudo systemctl status nginx

# Nginx 설정 테스트
sudo nginx -t

# Nginx 재시작
sudo systemctl restart nginx

# 포트 확인
sudo lsof -i:80
```

### 백엔드 서버가 시작되지 않음
```bash
# 로그 확인
sudo journalctl -u nanumpay -n 50

# 포트 3100 확인
sudo lsof -i:3100

# 서비스 재시작
sudo systemctl restart nanumpay
```

### MongoDB 연결 실패
```bash
# MongoDB 상태 확인
sudo systemctl status mongod

# MongoDB 시작
sudo systemctl start mongod

# 연결 테스트
mongosh mongodb://localhost:27017/nanumpay
```

---

## 📞 지원

- **문서**: /opt/nanumpay/README.md
- **로그**: /opt/nanumpay/logs/
- **Nginx 로그**: /var/log/nginx/

---

## 📝 버전 정보

설치된 버전 확인:
```bash
dpkg -l | grep nanumpay
```

---

**© 2024 나눔에셋 (Nanum Asset)**
