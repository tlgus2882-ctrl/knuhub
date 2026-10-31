import { describe, expect, it } from "vitest";
import { isIdleExpired, SESSION_IDLE_SECONDS } from "./session-age";

const ACTIVE = 1_800_000_000;

describe("isIdleExpired", () => {
  it("마지막 활동 후 1시간이 지나면 만료, 그 전에는 아니다", () => {
    expect(SESSION_IDLE_SECONDS).toBe(3600);
    expect(isIdleExpired(String(ACTIVE), ACTIVE + 3600)).toBe(false);
    expect(isIdleExpired(String(ACTIVE), ACTIVE + 3601)).toBe(true);
  });

  it("계속 쓰는 동안에는 로그인한 지 오래돼도 만료되지 않는다 (활동할 때마다 시각이 새로 적힌다)", () => {
    const fiveHoursLater = ACTIVE + 5 * 3600;
    expect(isIdleExpired(String(fiveHoursLater - 60), fiveHoursLater)).toBe(false);
  });

  it("활동 기록이 없거나 이상하면 만료로 보지 않는다 (로그인 직후 첫 요청)", () => {
    expect(isIdleExpired(undefined, ACTIVE)).toBe(false);
    expect(isIdleExpired("abc", ACTIVE)).toBe(false);
  });
});
