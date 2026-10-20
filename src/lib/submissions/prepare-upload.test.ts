import { describe, expect, it } from "vitest";
import { zipSync } from "fflate";
import { entriesFromGitHubArchive, parseGitHubRepo } from "./github";
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

  it("UTF-8이나 CP949로 읽히는 파일은 텍스트, 아니면 바이너리로 분류한다", () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
    const latin1 = new Uint8Array([0x63, 0x61, 0x66, 0xe9]); // "café" in Latin-1, not UTF-8

    const result = prepareUpload([
      { path: "main.py", data: text("print('안녕')\n") },
      { path: "README", data: text("확장자 없는 텍스트") },
      { path: "옛날.c", data: new Uint8Array([0x2f, 0x2f, 0x20, 0xb0, 0xfa, 0xc1, 0xa6, 0x0a]) }, // "// 과제\n" in CP949
      { path: "empty.txt", data: new Uint8Array() },
      { path: "logo.png", data: png },
      { path: "old.txt", data: latin1 },
    ]);

    expect(result.ok && result.files.map((f) => [f.path, f.kind])).toEqual([
      ["main.py", "text"],
      ["README", "text"],
      ["옛날.c", "text"],
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

  it("경로를 정리했더니 같은 경로가 되는 파일이 있으면 거부한다", () => {
    const result = prepareUpload([
      { path: "project/a/b.txt", data: text("1") },
      { path: "project/a/./b.txt", data: text("2") },
    ]);

    expect(result.ok ? "ok" : result.reason).toBe("duplicate-paths");
  });

  it("파일이 1000개를 넘으면 거부한다", () => {
    const many = (n: number) => Array.from({ length: n }, (_, i) => ({ path: `f${i}.txt`, data: text("x") }));

    expect(prepareUpload(many(1000)).ok).toBe(true);
    const over = prepareUpload(many(1001));
    expect(over.ok ? "ok" : over.reason).toBe("too-many-files");
  });

  it("__pycache__, 가상환경, 편집기 설정 폴더도 뺀다", () => {
    const result = prepareUpload([
      { path: "app/main.py", data: text("x") },
      { path: "app/__pycache__/main.cpython-312.pyc", data: text("x") },
      { path: "app/.venv/bin/python", data: text("x") },
      { path: "app/venv/lib/site.py", data: text("x") },
      { path: "app/.idea/workspace.xml", data: text("x") },
      { path: "app/.vscode/settings.json", data: text("x") },
    ]);

    expect(result.ok && result.files.map((f) => f.path)).toEqual(["app/main.py"]);
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

  it("UTF-8 표시 없이 CP949로 저장된 한글 파일 이름(윈도우 탐색기 zip)도 제대로 읽는다", () => {
    // "과제/a.txt" in CP949, written as Latin-1 characters so fflate stores the raw bytes without the UTF-8 flag.
    const cp949Name = String.fromCharCode(0xb0, 0xfa, 0xc1, 0xa6) + "/a.txt";
    const zip = zipSync({ [cp949Name]: text("x") });

    expect(entriesFromZip(zip).map((e) => e.path)).toEqual(["과제/a.txt"]);
  });

  it("UTF-8 표시 없이 UTF-8로 저장된 이름도 제대로 읽는다", () => {
    const utf8AsLatin1 = String.fromCharCode(...new TextEncoder().encode("과제")) + "/a.txt";
    const zip = zipSync({ [utf8AsLatin1]: text("x") });

    expect(entriesFromZip(zip).map((e) => e.path)).toEqual(["과제/a.txt"]);
  });
});

describe("GitHub 저장소로 제출", () => {
  it("저장소 주소를 여러 모양으로 넣어도 소유자·저장소·브랜치를 읽는다", () => {
    expect(parseGitHubRepo("https://github.com/kim/stack-hw", "main")).toEqual({ owner: "kim", repo: "stack-hw", branch: "main" });
    expect(parseGitHubRepo("github.com/kim/stack-hw.git", "")).toEqual({ owner: "kim", repo: "stack-hw", branch: null });
    expect(parseGitHubRepo("  https://www.github.com/kim/stack-hw/  ", " dev ")).toEqual({ owner: "kim", repo: "stack-hw", branch: "dev" });
    // 브라우저 주소창에서 복사한 브랜치 주소: 브랜치 칸이 비어 있으면 주소의 브랜치를 쓴다
    expect(parseGitHubRepo("https://github.com/kim/stack-hw/tree/feature/list", "")).toEqual({
      owner: "kim",
      repo: "stack-hw",
      branch: "feature/list",
    });
  });

  it("GitHub 저장소 주소가 아니면 거부한다", () => {
    for (const input of ["", "kim/stack-hw", "https://gitlab.com/kim/stack-hw", "https://github.com/kim", "https://github.com/kim/stack hw", "javascript:alert(1)"]) {
      expect(parseGitHubRepo(input, "main"), input).toBeNull();
    }
    expect(parseGitHubRepo("https://github.com/kim/stack-hw", "../etc"), "브랜치 이름").toBeNull();
  });

  it("압축 파일을 감싼 최상위 폴더(저장소-브랜치)를 벗기고, zip 업로드와 같은 규칙(제외 폴더, 텍스트·바이너리)을 거친다", () => {
    const zip = zipSync({
      "stack-hw-main/": new Uint8Array(),
      "stack-hw-main/src/Stack.java": text("class Stack {}"),
      "stack-hw-main/node_modules/x/index.js": text("x"),
      "stack-hw-main/logo.png": new Uint8Array([0x89, 0x50, 0, 0]),
    });

    const result = prepareUpload(entriesFromGitHubArchive(zip));

    expect(result.ok && result.files.map((f) => [f.path, f.kind])).toEqual([
      ["src/Stack.java", "text"],
      ["logo.png", "binary"],
    ]);
  });

  it("풀었을 때 20MB를 넘는 저장소는 다 풀기 전에 멈춘다", () => {
    const zip = zipSync({ "r-main/a.bin": new Uint8Array(15 * 1024 * 1024), "r-main/b.bin": new Uint8Array(15 * 1024 * 1024) });

    expect(() => entriesFromGitHubArchive(zip)).toThrow(UploadTooLargeError);
  });
});
