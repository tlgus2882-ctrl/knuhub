-- 학기 형식 고정 (#17)
--
-- 학기는 "연도-학기"이고 학기는 1, 여름, 2, 겨울 중 하나다 (예: 2026-2, 2026-여름).
-- 자유 입력이면 "2026-2"와 "2026 2학기"가 서로 다른 학기로 묶이고 순서도 어긋난다.
-- 이미 열린 과목은 건드리지 않고(not valid), 새로 열거나 고치는 과목부터 적용한다.
alter table public.course
  add constraint course_semester_format
  check (semester ~ '^[0-9]{4}-(1|여름|2|겨울)$') not valid;
