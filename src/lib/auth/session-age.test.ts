import { describe, expect, it } from "vitest";
import { isSessionExpired, SESSION_MAX_AGE_SECONDS } from "./session-age";

const LOGIN = 1_800_000_000;

describe("isSessionExpired", () => {
  it("로그인하고 1시간이 지나면 만료, 그 전에는 아니다", () => {
    const amr = [{ method: "password", timestamp: LOGIN }];

    expect(SESSION_MAX_AGE_SECONDS).toBe(3600);
    expect(isSessionExpired(amr, LOGIN + 3599)).toBe(false);
    expect(isSessionExpired(amr, LOGIN + 3601)).toBe(true);
  });

  it("인증한 기록이 여러 개면 가장 처음 로그인한 시각부터 잰다", () => {
    const amr = [
      { method: "otp", timestamp: LOGIN + 3000 },
      { method: "password", timestamp: LOGIN },
    ];

    expect(isSessionExpired(amr, LOGIN + 3601)).toBe(true);
  });

  it("시각이 없는 형식이면 만료로 보지 않는다", () => {
    expect(isSessionExpired(["password"], LOGIN + 99_999)).toBe(false);
    expect(isSessionExpired(undefined, LOGIN + 99_999)).toBe(false);
  });
});
