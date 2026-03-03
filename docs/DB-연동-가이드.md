# Supabase(테이블 편집기) 연동 가이드

## 1. 연동 방법

### 1) Supabase에서 연결 정보 복사

1. [Supabase](https://supabase.com) 로그인 → 해당 프로젝트 선택
2. **Settings** (왼쪽 하단 톱니바퀴) → **Database**
3. **Connection string** 섹션에서 **URI** 선택
4. **Copy** 한 뒤, 비밀번호 부분을 본인 DB 비밀번호로 바꿉니다.
   - 형식: `postgresql://postgres.[프로젝트참조]:[비밀번호]@aws-0-[리전].pooler.supabase.com:6543/postgres?pgbouncer=true&sslmode=require`

### 2) 프로젝트에 연결 문자열 넣기

1. 프로젝트 루트의 **`.env`** 파일 열기
2. 다음 한 줄이 있는지 확인하고, 없으면 추가 (이미 있으면 값만 수정):

```env
DATABASE_URL="postgresql://postgres.xxxx:비밀번호@aws-0-ap-northeast-2.pooler.supabase.com:6543/postgres?pgbouncer=true&sslmode=require"
```

- `xxxx` 부분: Supabase에서 복사한 Connection string의 해당 부분 그대로 사용
- `비밀번호`: Supabase 프로젝트 생성 시 설정한 DB 비밀번호 (특수문자 있으면 URL 인코딩)

### 3) 테이블이 없을 때만 — 스키마 적용

Supabase **테이블 편집기**에 `User` 등 테이블이 아직 없으면:

1. Supabase 대시보드 → **SQL Editor**
2. 프로젝트의 `prisma/supabase-schema.sql` 파일 내용을 복사해 SQL Editor에 붙여넣기
3. **Run** 실행

또는 터미널에서:

```bash
npx prisma db push
```

(이미 테이블이 있으면 위 단계는 생략해도 됩니다.)

---

## 2. 연동이 잘 되었는지 체크하는 방법

### 방법 A: 스크립트로 한 번에 확인 (권장)

프로젝트 루트에서:

```bash
npm run check-db
```

- **연결 성공**: `연결: ✅ 성공` 이 나오고, User 테이블에 있는 **이메일 목록**이 출력됩니다.
- **연결 실패**: `연결: ❌ 실패` 와 에러 메시지가 나옵니다. `.env`의 `DATABASE_URL`과 Supabase Connection string을 다시 비교하세요.

출력된 이메일을 **그대로 복사**해서 로그인 화면의 이메일 란에 붙여넣으면, “이메일 오타”로 인한 로그인 실패를 줄일 수 있습니다.

### 방법 B: 특정 이메일로 사용자만 확인

```bash
npm run check-user lookathetop@naver.com
```

- 해당 이메일로 사용자가 있으면: `결과: 사용자 존재` 와 id, email, name, role 등이 출력됩니다.
- 없으면: `해당 이메일로 등록된 사용자가 없습니다` 가 나옵니다.

### 방법 C: Prisma로 스키마/연결 확인

```bash
npx prisma generate
npx prisma db pull
```

- `db pull` 이 에러 없이 끝나면, 현재 DB와 Prisma 스키마가 같은 DB에 연결된 상태로 보면 됩니다.

---

## 3. 자주 하는 실수

| 증상 | 확인할 것 |
|------|------------|
| `DATABASE_URL` 없음 | `.env`에 `DATABASE_URL="..."` 이 있는지 |
| 연결 거부 / 타임아웃 | URL의 호스트·포트·리전이 Supabase Connection string과 동일한지 |
| 비밀번호 오류 | DB 비밀번호가 맞는지, 특수문자면 URL 인코딩 했는지 |
| 로그인 “이메일 또는 비밀번호 불일치” | **이메일 오타** (예: `lookatthatop` vs `lookathetop`). `npm run check-db` 로 출력된 이메일을 복사해 사용 |
| 테이블 없음 | Supabase SQL Editor에서 `supabase-schema.sql` 실행 또는 `npx prisma db push` |

---

## 4. 요약

1. **연동**: Supabase Database → Connection string(URI) 복사 → `.env`의 `DATABASE_URL`에 붙여넣기 (비밀번호 수정).
2. **체크**: 터미널에서 `npm run check-db` 실행 → `✅ 성공` 이고 이메일 목록이 보이면 연동된 것이고, 그 이메일로 로그인하면 됩니다.
