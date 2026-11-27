import { describe, expect, it } from "vitest";
import { reviewWeight, toReviewAuthorRole } from "./author-role";

describe("리뷰 가중치", () => {
  it("교수 > 조교 > 학생 순으로 무겁다", () => {
    expect(reviewWeight("professor")).toBe(3);
    expect(reviewWeight("assistant")).toBe(2);
    expect(reviewWeight("student")).toBe(1);
  });

  it("과목 밖 사람의 리뷰는 학생 리뷰만큼 센다", () => {
    expect(reviewWeight(null)).toBe(1);
  });
});

describe("리뷰 배지 값", () => {
  it("DB가 돌려준 역할만 배지가 되고, 그 밖의 값은 배지가 없다", () => {
    expect(toReviewAuthorRole("assistant")).toBe("assistant");
    expect(toReviewAuthorRole(null)).toBeNull();
    expect(toReviewAuthorRole("admin")).toBeNull();
  });
});
