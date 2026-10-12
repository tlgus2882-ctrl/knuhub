# knuhub

강남대 과제 공유 & 리뷰 플랫폼. 인공지능서비스개발 팀 프로젝트.

- 기획: [과제공유플랫폼_상세기획.md](과제공유플랫폼_상세기획.md)
- 용어: [GLOSSARY.md](GLOSSARY.md) / 기술 결정: [docs/adr/](docs/adr/)
- 스펙과 티켓: [이슈 #2](https://github.com/tlgus2882-ctrl/knuhub/issues/2)

## 준비물

- Node 24 이상, npm
- Docker 호환 런타임 (OrbStack 또는 Docker Desktop). 실행 중이어야 한다
- Supabase CLI: `brew install supabase/tap/supabase`

## 처음 설정

```bash
npm install
cp .env.example .env.local   # 값 채우기 (아래 환경변수 표 참고)
npm run db:start             # 로컬 Supabase 실행 (처음엔 이미지 받느라 몇 분 걸림)
npm run dev                  # http://localhost:3000
```

`npm run dev`는 `.env.local`의 Supabase(기본은 클라우드 프로젝트)에 연결한다. 로컬 Supabase로 화면을 띄우고 싶으면 `supabase status`에 나오는 로컬 URL과 키로 `.env.local`을 바꾼다.

## 환경변수

| 이름 | 공개 | 설명 |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | 공개 | Supabase Project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | 공개 | Publishable key (`sb_publishable_…`) |
| `NEXT_PUBLIC_SITE_URL` | 공개 | 가입 인증 링크가 돌아올 주소. 로컬은 `http://localhost:3000`, 배포는 Vercel 주소 (끝에 `/` 없이) |
| `SUPABASE_SECRET_KEY` | **비밀** | Secret key (`sb_secret_…`). RLS를 우회하므로 서버에서만 쓴다 (학번 로그인 조회 등, ADR-0002). 없으면 학번 로그인과 비밀번호 재설정이 동작하지 않는다. 채팅·코드·커밋에 절대 넣지 않는다 |

값은 Supabase 대시보드 → Project Settings → API Keys에 있다.

## 명령어

| 명령 | 하는 일 |
|---|---|
| `npm run dev` | 개발 서버 |
| `npm run typecheck` | 타입 검사 |
| `npm run lint` | 린트 |
| `npm test` | 전체 테스트 (로컬 Supabase가 떠 있어야 함) |
| `npm run test:unit` | 단위 테스트만 (`src/**/*.test.ts`) |
| `npm run test:db` | 권한 테스트만 (`tests/db/**/*.test.ts`, 로컬 Supabase 필요) |
| `npm run db:start` / `db:stop` | 로컬 Supabase 실행 / 종료 |
| `npm run db:types` | 로컬 DB에서 TypeScript 타입 재생성 |

## 테스트

접근 규칙은 DB의 RLS에만 둔다 ([ADR-0002](docs/adr/0002-rls-as-single-guard-server-first-data.md)). 그래서 핵심 테스트는 로컬 Supabase에 실제 사용자를 만들고, 그 사용자로 로그인한 클라이언트로 읽기·쓰기를 시도해 결과를 확인한다.

```ts
import { createTestUser, anonClient } from "../support/supabase";

const student = await createTestUser();        // 무작위 메일로 새 사용자 + 로그인된 클라이언트
const { data } = await student.client.from("...").select();
```

- 테스트마다 새 사용자와 데이터를 만들어 서로 섞이지 않게 한다. DB는 초기화하지 않는다.
- 테스트 도구는 `supabase status`에서 로컬 URL과 키를 읽어 온다. `.env.local`의 클라우드 키는 쓰지 않는다.

## DB 변경 절차

1. 마이그레이션 만들기: `supabase migration new <이름>` → `supabase/migrations/`에 SQL 작성
2. 로컬에 적용: `supabase db reset` (로컬 DB를 마이그레이션으로 다시 만든다)
3. 타입 재생성: `npm run db:types` (CI가 최신인지 검사한다)
4. 테스트 통과 확인 후 PR

### 클라우드에 반영 (`main` 머지 후, 사람이 직접)

```bash
supabase login                                   # 처음 한 번
supabase link --project-ref mcbyiibwinhgckpqegiw # 처음 한 번 (DB 비밀번호 필요)
supabase db push                                 # 아직 적용 안 된 마이그레이션 반영
```

자동 반영은 하지 않는다. DB 비밀번호를 GitHub에 맡겨야 하고, 실수한 마이그레이션이 바로 운영 DB에 들어가기 때문이다.

## 역할 바꾸기 (관리자)

관리자 페이지는 v2에서 만든다. 그 전까지 관리자 작업은 Supabase 대시보드 → Table Editor에서 직접 한다.

| 작업 | 방법 |
|---|---|
| 교수로 승격 | `profile` 테이블에서 그 사용자의 `role`을 `professor`로 바꾼다 |
| 관리자 지정 | 같은 곳에서 `role`을 `admin`으로 바꾼다 |
| 학번 정정 | `profile.student_number`를 고친다 (다른 사용자와 겹칠 수 없다) |
| 전화번호 확인 | `profile_private.phone` |

사용자 본인은 역할과 학번을 바꿀 수 없다. 가입 규칙(강남대 메일, 개인정보 동의, 학번 중복 금지)은 DB 트리거가 검사한다. 학번은 메일 인증을 마친 순간 프로필에 붙으므로, 인증하지 않은 가입은 학번을 차지하지 못하고 같은 학번이면 먼저 인증한 사람이 갖는다. 인증 전 학번은 `profile_private.pending_student_number`에 있다.

## 배포 (Vercel)

1. vercel.com에서 GitHub 레포 `tlgus2882-ctrl/knuhub`를 Import
2. Framework는 Next.js, Node.js Version은 24.x
3. Environment Variables에 위 환경변수 4개를 입력 (`NEXT_PUBLIC_SITE_URL`은 Vercel 주소)
4. 이후 `main`에 머지하면 자동으로 배포된다

배포 후 Supabase 대시보드 → Authentication → URL Configuration에서 다음을 해야 인증 메일 링크가 올바른 곳으로 간다.

- **Site URL**: Vercel 주소
- **Redirect URLs**: `https://<Vercel 주소>/**`와 `http://localhost:3000/**` 추가

## 메일 템플릿

인증 메일 문구는 `supabase/templates/`에 있다. 로컬 Supabase는 `config.toml`로 이 파일을 쓰고, 클라우드는 대시보드 → Authentication → Emails → Templates에 **직접 붙여 넣어야** 한다. 파일을 고치면 클라우드에도 다시 붙여 넣는다.

| 대시보드 탭 | 파일 | 제목 |
|---|---|---|
| Confirm signup | `confirmation.html` | [knuhub] 메일 인증을 마무리해 주세요 |
| Reset Password | `recovery.html` | [knuhub] 비밀번호 재설정 |
| Change Email Address | `email_change.html` | [knuhub] 메일 주소 변경 확인 |

가입 인증과 비밀번호 재설정 링크는 메일에 담긴 일회용 토큰(`token_hash`)을 `/auth/confirm`이 확인하는 방식이라, 휴대폰이나 다른 브라우저에서 열어도 동작한다. 링크 주소는 `{{ .RedirectTo }}`(앱이 넘긴 `NEXT_PUBLIC_SITE_URL/auth/confirm`)라서, 그 주소가 Supabase의 Redirect URLs에 있어야 한다.

메일 발송은 Brevo SMTP를 쓴다 (대시보드 → Authentication → Emails → SMTP Settings). Brevo의 Authorized IPs 차단은 꺼 둬야 Supabase 서버에서 보낼 수 있다.

## CI

PR과 `main` 푸시마다 GitHub Actions가 로컬 Supabase를 띄우고 DB 타입 최신 여부, 타입 검사, 린트, 단위 테스트, 권한 테스트를 돌린다 ([.github/workflows/ci.yml](.github/workflows/ci.yml)).
