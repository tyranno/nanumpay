# Nginx 리버스 프록시 통합

**날짜**: 2025-10-26
**상태**: ✅ 완료

---

## 📋 개요

Nanumpay 애플리케이션에 Nginx 리버스 프록시를 통합하여 80/443 포트로 서비스할 수 있도록 구성했습니다.

### 변경 전/후

#### 변경 전
- **직접 접속**: http://[IP]:3100
- **포트**: 3100 (자체 서비스)
- **SSL**: 미지원
- **압축**: 미지원

#### 변경 후
- **Nginx 프록시**: http://[IP]:80 → http://localhost:3100
- **포트**: 80 (HTTP), 443 (HTTPS - 설정 시)
- **SSL**: Nginx에서 설정 가능
- **압축**: Gzip 압축 활성화
- **업로드**: 최대 10MB (Excel 파일)

---

## 🔧 구조

### 애플리케이션 계층
```
[사용자] → http://[IP]:80
    ↓
[Nginx Reverse Proxy] → http://localhost:3100
    ↓
[Nanumpay exe-sveltekit 앱]
    ↓
[MongoDB]
```

### 왜 Nginx를 사용하나?

#### exe-sveltekit 직접 포트 바인딩 (80/443)
- ❌ root 권한 필요 (보안 위험)
- ❌ SSL/TLS 직접 구현 복잡
- ❌ 압축/캐싱 기능 제한적
- ❌ 로그 관리 어려움

#### Nginx 리버스 프록시
- ✅ root 권한 불필요 (Nginx만 80/443 바인딩)
- ✅ SSL/TLS 인증서 관리 용이 (Let's Encrypt 등)
- ✅ Gzip 압축 자동 처리
- ✅ 정적 파일 캐싱
- ✅ 로드 밸런싱 가능 (향후)
- ✅ 강력한 로그 관리
- ✅ DDoS 방어 기능

---

## 📁 통합된 파일

### 1. Nginx 설정 파일
**위치**: `apps/web/install/linux/nginx/nanumpay`

**설정 내용**:
```nginx
server {
    listen 80;
    listen [::]:80;
    server_name _;

    # 최대 업로드 크기 (Excel 파일)
    client_max_body_size 10M;

    # 로그
    access_log /var/log/nginx/nanumpay-access.log;
    error_log /var/log/nginx/nanumpay-error.log;

    # 프록시 설정
    location / {
        proxy_pass http://localhost:3100;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;

        # 타임아웃
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # Gzip 압축
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css text/xml text/javascript
               application/x-javascript application/xml+rss
               application/json application/javascript;
}
```

### 2. DEB 패키지 빌드 스크립트
**위치**: `apps/web/scripts/release-linux.cjs`

**변경 내용**:

#### (1) Nginx 디렉토리 생성
```javascript
const nginxAvailableDir = path.join(pkgDir, 'etc', 'nginx', 'sites-available');
[debian, optDir, etcDir, sysdDir, nginxAvailableDir, dbDir, toolsDir, binDir].forEach((d) =>
    fs.mkdirSync(d, { recursive: true })
);
```

#### (2) Nginx 설정 복사
```javascript
// 4-2) Nginx 설정 파일 복사
const nginxConfigSrc = path.join(ROOT, 'install', 'linux', 'nginx', 'nanumpay');
if (fs.existsSync(nginxConfigSrc)) {
    fs.copyFileSync(nginxConfigSrc, path.join(nginxAvailableDir, 'nanumpay'));
    console.log('[nginx] ✅ Nginx 설정 파일 포함 완료');
} else {
    console.warn('[nginx] ⚠️  Nginx 설정 파일 없음 (건너뜀)');
}
```

#### (3) 의존성 추가
```javascript
Depends: adduser, systemd, bash
Recommends: nginx, mongosh, apache2-utils | whois
```

#### (4) conffiles 업데이트
```
/etc/nanumpay/nanumpay.env
/etc/nginx/sites-available/nanumpay
```

### 3. postinst (설치 후 스크립트)
**변경 내용**:

```bash
# Nginx 설정 (Nginx가 설치되어 있는 경우)
if command -v nginx >/dev/null 2>&1; then
    echo "Configuring Nginx reverse proxy..."

    # sites-enabled 심볼릭 링크 생성
    if [ -f "/etc/nginx/sites-available/nanumpay" ]; then
        # 기존 심볼릭 링크 제거
        rm -f /etc/nginx/sites-enabled/nanumpay

        # 새 심볼릭 링크 생성
        ln -s /etc/nginx/sites-available/nanumpay /etc/nginx/sites-enabled/nanumpay

        # Nginx 설정 테스트
        if nginx -t 2>/dev/null; then
            echo "Nginx configuration valid - reloading..."
            systemctl reload nginx || systemctl restart nginx
            echo "✅ Nginx reverse proxy configured (http://[your-ip]:80 → http://localhost:3100)"
        else
            echo "⚠️  Nginx configuration test failed - please check manually"
            rm -f /etc/nginx/sites-enabled/nanumpay
        fi
    fi
else
    echo "⚠️  Nginx not installed - application will run on port 3100"
    echo "   To use port 80/443, install nginx and run: sudo dpkg-reconfigure nanumpay"
fi
```

### 4. prerm (제거 전 스크립트)
**변경 내용**:

```bash
# Nginx 설정 제거
if [ -L "/etc/nginx/sites-enabled/nanumpay" ]; then
    echo "Removing Nginx configuration..."
    rm -f /etc/nginx/sites-enabled/nanumpay
    if command -v nginx >/dev/null 2>&1; then
        systemctl reload nginx || systemctl restart nginx || true
    fi
fi
```

---

## 🚀 사용 방법

### 1. DEB 패키지 빌드
```bash
cd /home/tyranno/project/bill/nanumpay/apps/web
pnpm release:linux
```

**빌드 과정**:
1. SvelteKit 앱 빌드
2. exe-sveltekit으로 단일 실행 파일 생성
3. 백업 앱 빌드
4. **Nginx 설정 파일 포함** ⭐
5. DEB 패키지 생성

### 2. 서버에 설치

#### Nginx 미설치 시
```bash
# 1. Nginx 설치
sudo apt update
sudo apt install -y nginx

# 2. DEB 패키지 설치
sudo dpkg -i nanumpay_*.deb
sudo apt-get install -f  # 의존성 해결
```

**설치 후 자동 처리**:
- ✅ Nginx 설정 파일 복사: `/etc/nginx/sites-available/nanumpay`
- ✅ 심볼릭 링크 생성: `/etc/nginx/sites-enabled/nanumpay`
- ✅ Nginx 설정 테스트
- ✅ Nginx 리로드
- ✅ Nanumpay 서비스 시작

#### Nginx 이미 설치된 경우
```bash
# DEB 패키지 설치만
sudo dpkg -i nanumpay_*.deb
sudo apt-get install -f
```

**자동으로 Nginx 설정 적용됨!**

### 3. 접속 확인

#### HTTP (80포트)
```bash
curl http://localhost
# 또는
curl http://[서버IP]
```

#### 브라우저
- **로컬**: http://localhost
- **네트워크**: http://[서버IP]
- **관리자**: http://[서버IP]/admin

#### Nginx가 없는 경우
- **직접 접속**: http://[서버IP]:3100

---

## 🔍 문제 해결

### 1. 80 포트 접속 안 됨

#### Nginx 상태 확인
```bash
sudo systemctl status nginx
```

#### Nginx 설정 테스트
```bash
sudo nginx -t
```

#### 심볼릭 링크 확인
```bash
ls -la /etc/nginx/sites-enabled/nanumpay
# → /etc/nginx/sites-available/nanumpay
```

#### Nginx 재시작
```bash
sudo systemctl restart nginx
```

### 2. Nginx 설정 수동 적용
```bash
# 1. 심볼릭 링크 생성
sudo ln -s /etc/nginx/sites-available/nanumpay /etc/nginx/sites-enabled/nanumpay

# 2. 설정 테스트
sudo nginx -t

# 3. Nginx 리로드
sudo systemctl reload nginx
```

### 3. Nginx 로그 확인
```bash
# 접속 로그
sudo tail -f /var/log/nginx/nanumpay-access.log

# 에러 로그
sudo tail -f /var/log/nginx/nanumpay-error.log
```

### 4. Nanumpay 앱 상태 확인
```bash
# 서비스 상태
sudo systemctl status nanumpay

# 3100 포트 확인
curl http://localhost:3100

# 로그 확인
sudo journalctl -u nanumpay -f
```

### 5. 방화벽 확인
```bash
# UFW 확인
sudo ufw status

# 80 포트 허용
sudo ufw allow 80/tcp

# 443 포트 허용 (HTTPS 사용 시)
sudo ufw allow 443/tcp
```

---

## 🔒 HTTPS (SSL/TLS) 설정

### Let's Encrypt 인증서 (무료)

#### 1. Certbot 설치
```bash
sudo apt install -y certbot python3-certbot-nginx
```

#### 2. 인증서 발급 및 Nginx 자동 설정
```bash
sudo certbot --nginx -d yourdomain.com
```

#### 3. 자동 갱신 확인
```bash
sudo certbot renew --dry-run
```

**Certbot이 자동으로**:
- ✅ SSL 인증서 발급
- ✅ Nginx 설정 업데이트 (443 포트 추가)
- ✅ HTTP → HTTPS 리디렉션 설정
- ✅ 자동 갱신 cron 설정

### 수동 SSL 설정

#### 인증서가 있는 경우
`/etc/nginx/sites-available/nanumpay` 수정:

```nginx
server {
    listen 80;
    server_name yourdomain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name yourdomain.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    # ... 기존 location / 설정 ...
}
```

```bash
sudo nginx -t
sudo systemctl reload nginx
```

---

## 📊 성능 최적화

### 정적 파일 캐싱
`/etc/nginx/sites-available/nanumpay`에 추가:

```nginx
# 정적 파일 캐싱
location ~* \.(jpg|jpeg|png|gif|ico|css|js|svg|woff|woff2|ttf)$ {
    proxy_pass http://localhost:3100;
    expires 1y;
    add_header Cache-Control "public, immutable";
}
```

### 연결 제한 (DDoS 방어)
```nginx
# rate limiting
limit_req_zone $binary_remote_addr zone=nanumpay:10m rate=10r/s;

server {
    # ...
    limit_req zone=nanumpay burst=20;
}
```

---

## 🗂️ 파일 위치 정리

### 개발 환경
```
/home/tyranno/project/bill/nanumpay/
├── apps/web/
│   ├── install/linux/nginx/
│   │   └── nanumpay              # Nginx 설정 원본
│   └── scripts/
│       └── release-linux.cjs     # DEB 빌드 스크립트
└── docs/
    └── Nginx_리버스프록시_통합.md
```

### 배포 환경 (설치 후)
```
/opt/nanumpay/
├── nanumpay                      # 실행 파일
└── bin/
    └── nanumpay-backup           # 백업 앱

/etc/nanumpay/
└── nanumpay.env                  # 환경 설정

/etc/nginx/
├── sites-available/
│   └── nanumpay                  # Nginx 설정
└── sites-enabled/
    └── nanumpay → ../sites-available/nanumpay  # 심볼릭 링크

/etc/systemd/system/
└── nanumpay.service              # systemd 서비스

/var/log/nginx/
├── nanumpay-access.log          # 접속 로그
└── nanumpay-error.log           # 에러 로그
```

---

## ✅ 검증 체크리스트

### 빌드 단계
- [ ] `pnpm release:linux` 실행
- [ ] `[nginx] ✅ Nginx 설정 파일 포함 완료` 메시지 확인
- [ ] DEB 파일 생성 확인

### 설치 단계
- [ ] Nginx 설치 확인
- [ ] DEB 패키지 설치
- [ ] postinst에서 Nginx 설정 메시지 확인

### 동작 확인
- [ ] `curl http://localhost` → 정상 응답
- [ ] 브라우저: http://[IP] → 로그인 화면
- [ ] 관리자 로그인: http://[IP]/admin
- [ ] Nginx 로그 기록 확인

### SSL 설정 (선택)
- [ ] Certbot 설치
- [ ] 인증서 발급
- [ ] https://[도메인] 접속 확인
- [ ] HTTP → HTTPS 리디렉션 확인

---

## 📚 참고 문서

1. [백업_시스템_최종_통합.md](백업_시스템_최종_통합.md) - 백업 시스템 통합
2. [systemd service](../apps/web/install/linux/nanumpay.service) - systemd 설정
3. [Nginx 설정](../apps/web/install/linux/nginx/nanumpay) - Nginx 원본 설정

---

**작성자**: Claude AI Assistant
**최종 수정일**: 2025-10-26
