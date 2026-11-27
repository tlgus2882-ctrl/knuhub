import { describe, expect, it } from "vitest";
import { changeOf, countChanges, diffText, pairFiles, sameBytes, type VersionFile } from "./compare";

const text = (path: string, size = 10): VersionFile => ({ path, kind: "text", size });
const binary = (path: string, size = 10): VersionFile => ({ path, kind: "binary", size });

describe("제출 이력 비교: 파일 짝짓기", () => {
  it("두 버전의 파일을 경로로 짝짓고 경로 순으로 늘어놓는다", () => {
    const pairs = pairFiles([text("b.py"), text("a.py")], [text("c.py"), text("a.py")]);

    expect(pairs.map((p) => [p.path, Boolean(p.before), Boolean(p.after)])).toEqual([
      ["a.py", true, true],
      ["b.py", true, false],
      ["c.py", false, true],
    ]);
  });

  it("새로 생긴 파일, 지워진 파일, 바뀐 파일, 그대로인 파일을 구분한다", () => {
    const [added] = pairFiles([], [text("new.py")]);
    const [removed] = pairFiles([text("old.py")], []);
    const [resized] = pairFiles([text("a.py", 10)], [text("a.py", 12)]);
    const [same] = pairFiles([binary("logo.png", 10)], [binary("logo.png", 10)]);

    expect(changeOf(added, () => true)).toBe("added");
    expect(changeOf(removed, () => true)).toBe("removed");
    expect(changeOf(resized, () => true)).toBe("changed");
    expect(changeOf(same, () => true)).toBe("unchanged");
    expect(changeOf(same, () => false)).toBe("changed");
  });

  it("크기가 다르면 내용을 읽지 않고 바뀐 파일로 본다", () => {
    const [pair] = pairFiles([binary("a.bin", 1)], [binary("a.bin", 2)]);
    let read = false;

    changeOf(pair, () => (read = true));

    expect(read).toBe(false);
  });

  it("바이너리 파일은 바이트가 모두 같아야 그대로다", () => {
    expect(sameBytes(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 3]))).toBe(true);
    expect(sameBytes(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 4]))).toBe(false);
    expect(sameBytes(new Uint8Array([1, 2]), new Uint8Array([1, 2, 3]))).toBe(false);
  });
});

describe("제출 이력 비교: 줄 차이", () => {
  it("더해진 줄과 빠진 줄을 이전·이후 줄 번호와 함께 보여 준다", () => {
    const hunks = diffText("a\nb\nc\n", "a\nB\nc\nd\n");

    expect(hunks).toEqual([
      {
        oldStart: 1,
        newStart: 1,
        lines: [
          { type: "context", oldNo: 1, newNo: 1, text: "a" },
          { type: "removed", oldNo: 2, text: "b" },
          { type: "added", newNo: 2, text: "B" },
          { type: "context", oldNo: 3, newNo: 3, text: "c" },
          { type: "added", newNo: 4, text: "d" },
        ],
      },
    ]);
    expect(countChanges(hunks)).toEqual({ added: 2, removed: 1 });
  });

  it("바뀐 곳에서 멀리 떨어진 줄은 보여 주지 않고 앞뒤 3줄만 보여 준다", () => {
    const before = Array.from({ length: 20 }, (_, i) => `line ${i + 1}`).join("\n");
    const after = before.replace("line 10", "LINE 10");

    const [hunk] = diffText(before, after);

    expect(hunk.oldStart).toBe(7);
    expect(hunk.lines.map((l) => l.text)).toEqual(["line 7", "line 8", "line 9", "line 10", "LINE 10", "line 11", "line 12", "line 13"]);
  });

  it("줄바꿈 방식(CRLF·LF)이나 마지막 줄바꿈만 다르면 바뀐 줄이 없다", () => {
    expect(diffText("a\r\nb\r\n", "a\nb")).toEqual([]);
  });

  it("빈 파일에 내용이 생기면 모두 더해진 줄이다", () => {
    expect(countChanges(diffText("", "x\ny\n"))).toEqual({ added: 2, removed: 0 });
  });
});
