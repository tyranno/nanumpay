# 배포 및 SSL 설정 가이드

## 개요

NanumPay 서버 배포 자동화 및 HTTPS/SSL 설정에 관한 문서입니다.

---

## 1. 배포 명령어

### 테스트 서버 (www.nanumpay.xyz)
```bash
pnpm release:deploy:test
```

### 본 서버 (www.nanumasset.com)
```bash
pnpm release:deploy:web
```

### HTTPS 전용 모드 (나중에 사용)
```bash
# HTTP → HTTPS 리다이렉트 활성화
pnpm release:deploy:test --redirect
pnpm release:deploy:web --redirect
```

---

## 2. 배포 프로세스

배포 스크립트 실행 시 자동으로 처리되는 항목:

| 순서 | 작업 | 설명 |
|-----|------|------|
| 1 | 빌드 | `pnpm build:web` + `pnpm release:linux` |
| 2 | SSH 연결 테스트 | 서버 접속 확인 |
| 3 | 패키지 업로드 | .deb, install.sh, README.md |
| 4 | install.sh 실행 | MongoDB, Nginx, Nanumpay 설치 |
| 5 | SSL 설정 | Let's Encrypt 인증서 발급 |
| 6 | 상태 확인 | 서비스 상태 점검 |

---

## 3. SSL/HTTPS 설정

### 3.1 동작 모드

| 모드 | 설명 | 옵션 |
|-----|------|------|
| HTTP+HTTPS 병행 | 두 프로토콜 모두 지원 (기본값) | 없음 |
| HTTPS 전용 | HTTP → HTTPS 리다이렉트 | `--redirect` |

### 3.2 Let's Encrypt 인증서

- **발급**: 배포 시 자동 발급
- **유효 기간**: 90일
- **자동 갱신**: systemd timer로 하루 2회 (03:00, 15:00)
- **갱신 조건**: 만료 30일 전부터 갱신 시도

### 3.3 수동 SSL 관리

```bash
# 인증서 상태 확인
sudo certbot certificates

# 수동 갱신
sudo certbot renew

# 갱신 테스트 (dry-run)
sudo certbot renew --dry-run

# 수동 SSL 설정 (필요시)
sudo /opt/nanumpay/ssl/setup-ssl.sh www.nanumpay.xyz
sudo /opt/nanumpay/ssl/setup-ssl.sh www.nanumasset.com --redirect
```

---

## 4. 정적 페이지 (앱스토어용)

### 4.1 개요

앱스토어 등록 시 필요한 개인정보처리방침과 이용약관 페이지입니다.
인증 없이 누구나 접근 가능합니다.

### 4.2 접근 URL

| 페이지 | 테스트 서버 | 본 서버 |
|-------|------------|--------|
| 개인정보처리방침 | https://www.nanumpay.xyz/privacy | https://www.nanumasset.com/privacy |
| 이용약관 | https://www.nanumpay.xyz/terms | https://www.nanumasset.com/terms |

### 4.3 파일 위치

**소스 (개발):**
```
apps/web/install/linux/static/
├── privacy.html    # 개인정보처리방침
└── terms.html      # 이용약관
```

**서버 (설치 후):**
```
/opt/nanumpay/static/
├── privacy.html
└── terms.html
```

### 4.4 Nginx 설정

```nginx
# /privacy, /terms는 인증 없이 정적 파일로 직접 서빙
location = /privacy {
    alias /opt/nanumpay/static/privacy.html;
    default_type text/html;
}

location = /terms {
    alias /opt/nanumpay/static/terms.html;
    default_type text/html;
}
```

### 4.5 내용 수정

1. `apps/web/install/linux/static/` 폴더의 HTML 파일 수정
2. 재배포: `pnpm release:deploy:test` 또는 `pnpm release:deploy:web`

---

## 5. 서버 정보

### 테스트 서버
- **호스트**: nanumpay.xyz
- **도메인**: www.nanumpay.xyz
- **SSH 키**: ~/.ssh/gcp_verify
- **사용자**: tyranno

### 본 서버
- **IP**: 34.170.107.151
- **도메인**: www.nanumasset.com
- **SSH 키**: ~/.ssh/ocp_tyranno
- **사용자**: tyranno
- **포트**: 3100 (직접 접속용)

---

## 6. 트러블슈팅

### SSL 발급 실패
```bash
# 서버에 SSH 접속 후
ssh -i ~/.ssh/gcp_verify tyranno@nanumpay.xyz

# 수동으로 SSL 설정
sudo /opt/nanumpay/ssl/setup-ssl.sh www.nanumpay.xyz

# 로그 확인
sudo journalctl -u certbot-renew -f
```

### Nginx 오류
```bash
# 설정 테스트
sudo nginx -t

# 재시작
sudo systemctl restart nginx

# 로그 확인
sudo tail -f /var/log/nginx/nanumpay-error.log
```

### 서비스 상태 확인
```bash
sudo systemctl status nanumpay
sudo systemctl status nginx
sudo systemctl status mongod
```

---

## 7. 관련 파일

| 파일 | 설명 |
|-----|------|
| `apps/web/scripts/deploy.cjs` | 본 서버 배포 스크립트 |
| `apps/web/scripts/deploy2.cjs` | 테스트 서버 배포 스크립트 |
| `apps/web/scripts/release-linux.cjs` | deb 패키지 생성 스크립트 |
| `apps/web/install/linux/ssl/setup-ssl.sh` | SSL 설정 스크립트 |
| `apps/web/install/linux/nginx/nanumpay` | Nginx 설정 파일 |
| `apps/web/install/linux/static/` | 정적 페이지 (privacy, terms) |

---

## 8. 앱스토어 등록 시 제출 URL

### Google Play Store
- 개인정보처리방침 URL: `https://www.nanumasset.com/privacy`

### Apple App Store
- 개인정보처리방침 URL: `https://www.nanumasset.com/privacy`
- App Privacy Details에 데이터 수집 항목 입력 필요

---

**최종 수정**: 2025-12-12
**작성자**: Claude Code
