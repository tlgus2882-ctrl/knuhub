# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

## Before exploring, read these

- **`GLOSSARY.md`** at the repo root, or
- **`GLOSSARY-MAP.md`** at the repo root if it exists: it points at one `GLOSSARY.md` per context. Read each one relevant to the topic.
- **`docs/adr/`**: read ADRs that touch the area you're about to work in. In multi-context repos, also check `src/<context>/docs/adr/` for context-scoped decisions.

If any of these files don't exist, **proceed silently**. Don't flag their absence; don't suggest creating them upfront. The `/domain-modeling` skill (reached via `/grill-with-docs` and `/improve-codebase-architecture`) creates them lazily when terms or decisions actually get resolved.

## File structure

Single-context repo (most repos):

```
/
├── GLOSSARY.md
├── docs/adr/
│   ├── 0001-event-sourced-orders.md
│   └── 0002-postgres-for-write-model.md
└── src/
```

Multi-context repo (presence of `GLOSSARY-MAP.md` at the root):

```
/
├── GLOSSARY-MAP.md
├── docs/adr/                          ← system-wide decisions
└── src/
    ├── ordering/
    │   ├── GLOSSARY.md
    │   └── docs/adr/                  ← context-specific decisions
    └── billing/
        ├── GLOSSARY.md
        └── docs/adr/
```

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, a test name), use the term as defined in `GLOSSARY.md`. Don't drift to synonyms the glossary explicitly avoids.

If the concept you need isn't in the glossary yet, that's a signal: either you're inventing language the project doesn't use (reconsider) or there's a real gap (note it for `/domain-modeling`).

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently overriding:

> _Contradicts ADR-0007 (event-sourced orders), but worth reopening because…_

## Code names

Code (tables, columns, types, variables) uses these English names for the `GLOSSARY.md` terms. Don't invent synonyms.

| 용어 | 코드 이름 |
|---|---|
| 사용자 / 프로필 | `profile` |
| 과목 | `course` |
| 수강생 | `enrollment` (수강 관계) |
| 조교 | `course_assistant` |
| 과제 | `assignment` |
| 마감일 | `due_at` |
| 과제 공개 | `published` (`true` = 공개, `false` = 비공개) |
| 공개 범위 | `visibility`: `private` / `course` / `campus` |
| 제출물 | `submission` |
| 제출 파일 | `submission_file` |
| 제출 이력 | `submission_history` (이전 파일 묶음 하나), `submission_history_file` (그 파일들) |
| 파일 종류 (텍스트·바이너리) | `file_kind`: `text` / `binary` |
| 리뷰 | `review` |
| 연락처 공개 범위 | `contact_visibility`: `public` / `course` / `private` |
| 첨부파일 | `assignment_file` |
| 채점 항목 | `grading_criterion` (목록을 저장할 때마다 과제의 `criteria_version`이 오른다) |
| 셀프 점검 | `self_check` (결과 하나, 그 학생만 읽음), `self_check_usage` (과제당 쓴 횟수, 제출물과 따로), 한도는 `self_check_limit()` |
| 1차 검사 | `first_check` (제출물마다 최신 결과 하나, `status`: `reviewed` / `unreviewable` 검사할 수 없음, `suspicious` 의심), `first_check_queue` (검사 대기열), `first_check_run` (진행 상황) |
| AI 검토 의견 | `Opinion` (`verdict`: `met` 충족 / `not_met` 부족 / `uncertain` 판단 불가) |
| 보관된 과목 | `archived_course` (과제·첨부파일·제출물·제출 파일·리뷰는 `archived_assignment`, `archived_assignment_file`, `archived_grading_criterion`, `archived_submission`, `archived_first_check`, `archived_submission_file`, `archived_submission_history`, `archived_submission_history_file`, `archived_review`) |
| 초대 코드 | `invite_code` (테이블 `course_invite`: 담당 교수만 읽도록 과목과 분리) |
