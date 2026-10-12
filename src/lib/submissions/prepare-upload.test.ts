import { describe, expect, it } from "vitest";
import { zipSync } from "fflate";
import { entriesFromZip, prepareUpload, UploadTooLargeError } from "./prepare-upload";

const text = (s: string) => new TextEncoder().encode(s);

describe("prepareUpload", () => {
  it("node_modules, .git 같은 제외 경로의 파일은 빼고 나머지만 남긴다", () => {
    const result = prepareUpload([
      { path: "project/src/main.js", data: text("console.log(1)") },
      { path: "project/node_modules/lodash/index.js", data: text("x") },
      { path: "project/.git/HEAD", data: text("ref") },
      { path: "__MACOSX/project/._main.js", data: text("x") },
      { path: "project/.DS_Store", data: text("x") },
    ]);

    expect(result.ok && result.files.map((f) => f.path)).toEqual(["project/src/main.js"]);
  });

  it("제외한 뒤 총용량이 딱 20MB면 통과하고, 1바이트라도 넘으면 거부한다", () => {
    const MB = 1024 * 1024;
    const half = new Uint8Array(10 * MB);

    const exactly = prepareUpload([
      { path: "a.bin", data: half },
      { path: "b.bin", data: half },
      { path: "node_modules/big.bin", data: new Uint8Array(30 * MB) },
    ]);
    const over = prepareUpload([
      { path: "a.bin", data: half },
      { path: "b.bin", data: new Uint8Array(10 * MB + 1) },
    ]);

    // Compare only the verdict: diffing 10MB arrays on failure would exhaust memory.
    expect(exactly.ok).toBe(true);
    expect(over.ok ? "ok" : [over.reason, over.totalBytes]).toEqual(["too-large", 20 * MB + 1]);
  });

  it("제외하고 나서 남은 파일이 없으면 거부한다", () => {
    expect(prepareUpload([{ path: ".git/HEAD", data: text("ref") }])).toEqual({
      ok: false,
      reason: "empty",
      totalBytes: 0,
    });
  });

  it("UTF-8로 읽히는 파일은 텍스트, 아니면 바이너리로 분류한다", () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
    const latin1 = new Uint8Array([0x63, 0x61, 0x66, 0xe9]); // "café" in Latin-1, not UTF-8

    const result = prepareUpload([
      { path: "main.py", data: text("print('안녕')\n") },
      { path: "README", data: text("확장자 없는 텍스트") },
      { path: "empty.txt", data: new Uint8Array() },
      { path: "logo.png", data: png },
      { path: "old.txt", data: latin1 },
    ]);

    expect(result.ok && result.files.map((f) => [f.path, f.kind])).toEqual([
      ["main.py", "text"],
      ["README", "text"],
      ["empty.txt", "text"],
      ["logo.png", "binary"],
      ["old.txt", "binary"],
    ]);
  });

  it("폴더 구조(중첩 경로)를 유지하고, 경로 표기는 / 로 맞춘다", () => {
    const result = prepareUpload([
      { path: "project/src/util/math.js", data: text("a") },
      { path: "project\\docs\\guide.md", data: text("b") },
      { path: "./project/./README.md", data: text("c") },
      { path: "/project/../etc/passwd", data: text("d") },
    ]);

    expect(result.ok && result.files.map((f) => f.path)).toEqual([
      "project/src/util/math.js",
      "project/docs/guide.md",
      "project/README.md",
      "project/etc/passwd",
    ]);
  });
});

describe("entriesFromZip", () => {
  it("zip을 풀어 파일들을 경로와 함께 돌려주고, 폴더 항목과 제외 경로는 풀지 않는다", () => {
    const zip = zipSync({
      "과제/": new Uint8Array(),
      "과제/src/main.py": text("print(1)"),
      "과제/node_modules/x.js": text("x"),
    });

    const entries = entriesFromZip(zip);

    expect(entries.map((e) => [e.path, new TextDecoder().decode(e.data)])).toEqual([
      ["과제/src/main.py", "print(1)"],
    ]);
  });

  it("풀었을 때 20MB를 넘는 zip은 다 풀기 전에 멈춘다", () => {
    const zip = zipSync({ "a.bin": new Uint8Array(15 * 1024 * 1024), "b.bin": new Uint8Array(15 * 1024 * 1024) });

    expect(() => entriesFromZip(zip)).toThrow(UploadTooLargeError);
  });
});
