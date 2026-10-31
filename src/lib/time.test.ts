import { describe, expect, it } from "vitest";
import { addDaysToInput, defaultDueInput, fromKstInputValue, toKstInputValue } from "./time";

describe("마감 입력값", () => {
  it("날짜를 며칠 뒤로 옮겨도 시각은 그대로이고, 달·해가 넘어가도 맞다", () => {
    expect(addDaysToInput("2026-10-28T23:59", 7)).toBe("2026-11-04T23:59");
    expect(addDaysToInput("2026-12-30T09:00", 3)).toBe("2027-01-02T09:00");
    expect(addDaysToInput("2028-02-28T18:00", 1)).toBe("2028-02-29T18:00");
  });

  it("새 과제의 기본 마감은 한국 시간으로 오늘부터 1주 뒤 23:59다 (밤 9시 UTC면 한국은 이미 다음 날)", () => {
    expect(defaultDueInput(new Date("2026-10-28T03:00:00Z"))).toBe("2026-11-04T23:59");
    expect(defaultDueInput(new Date("2026-10-28T21:00:00Z"))).toBe("2026-11-05T23:59");
  });

  it("입력값은 한국 시간으로 읽고 쓴다", () => {
    expect(fromKstInputValue("2026-11-04T23:59")).toBe("2026-11-04T14:59:00.000Z");
    expect(toKstInputValue("2026-11-04T14:59:00.000Z")).toBe("2026-11-04T23:59");
  });
});
