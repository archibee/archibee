# rexondex.github.io Wayback 저장

공개 사이트맵 `https://rexondex.github.io/sitemap`을 실행할 때마다 직접 읽고 페이지 URL을 Wayback Machine Save Page Now API에 등록합니다. 페이지 URL의 중복을 제거하며 이미지 항목은 별도로 요청하지 않습니다. 사이트맵 데이터를 따로 내려받을 필요는 없습니다.

Node.js 18 이상과 Internet Archive 계정의 [S3 API 키](https://archive.org/account/s3.php)가 필요합니다. Git Bash에서 프로젝트 루트부터 실행합니다.

```bash
cd rexondex-github-io-wayback
npm install
npm run archive:rexondex -- --dry-run
export IA_ACCESS_KEY='발급받은-access-key'
export IA_SECRET_KEY='발급받은-secret-key'
npm run archive:rexondex
unset IA_ACCESS_KEY IA_SECRET_KEY
```

`--dry-run`은 저장 요청 없이 현재 사이트맵의 페이지 목록을 표시합니다. 실제 실행은 각 페이지를 순서대로 요청하고 작업 완료 여부를 확인합니다. 기본 요청 간격은 25초입니다. 결과와 작업 ID는 이 폴더의 `reports/rexondex-github-io-wayback-report.json`에 기록됩니다. 중단되거나 확인에 실패한 작업은 보고서의 작업 ID로 확인하세요. 재실행하면 전체 목록을 다시 요청합니다. API 제한이나 서비스 상태에 따라 저장이 실패하거나 완료 확인이 지연될 수 있습니다.

```bash
# 요청 간격 변경 또는 도움말 확인
npm run archive:rexondex -- --delay 30
npm run archive:rexondex -- --help
```

다른 사이트맵을 시험할 때는 `--sitemap URL`을 지정할 수 있고, 결과 파일은 `--report FILE`로 바꿀 수 있습니다. 상대 결과 경로는 명령을 실행한 디렉터리를 기준으로 합니다. 인증 키는 파일에 저장하거나 Git에 커밋하지 마세요. PowerShell에서 `npm` 실행 정책 오류가 나면 `npm.cmd`를 사용하거나 위 Git Bash 명령을 사용하세요.
