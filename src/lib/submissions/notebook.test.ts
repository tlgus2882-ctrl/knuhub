import { describe, expect, it } from "vitest";
import { parseNotebook } from "./notebook";

const notebook = (cells: unknown[], metadata: unknown = { kernelspec: { language: "python" } }) =>
  JSON.stringify({ nbformat: 4, nbformat_minor: 5, metadata, cells });

describe("parseNotebook", () => {
  it("마크다운·코드 셀과 실행 번호, 텍스트·이미지 출력을 읽는다 (source는 줄 배열이어도 된다)", () => {
    const result = parseNotebook(
      notebook([
        { cell_type: "markdown", source: ["# 제목\n", "설명"], metadata: {} },
        {
          cell_type: "code",
          execution_count: 3,
          source: "print(1)\nplt.plot()",
          metadata: {},
          outputs: [
            { output_type: "stream", name: "stdout", text: ["1\n"] },
            { output_type: "display_data", data: { "image/png": "iVBORw0KGgo=\n", "text/plain": ["<Figure>"] } },
            { output_type: "execute_result", execution_count: 3, data: { "text/plain": "42", "text/html": "<b>42</b>" } },
          ],
        },
      ]),
    );

    expect(result).toEqual({
      language: "python",
      cells: [
        { type: "markdown", source: "# 제목\n설명", executionCount: null, outputs: [] },
        {
          type: "code",
          source: "print(1)\nplt.plot()",
          executionCount: 3,
          outputs: [
            { kind: "text", text: "1\n", error: false },
            { kind: "image", mime: "image/png", data: "iVBORw0KGgo=" },
            { kind: "text", text: "42", error: false },
          ],
        },
      ],
    });
  });

  it("오류 출력은 터미널 색 코드를 빼고 오류로 표시한다", () => {
    const result = parseNotebook(
      notebook([
        {
          cell_type: "code",
          source: "1/0",
          execution_count: 1,
          outputs: [{ output_type: "error", ename: "ZeroDivisionError", evalue: "division by zero", traceback: ["\u001b[0;31mZeroDivisionError\u001b[0m: division by zero"] }],
        },
      ]),
    );

    expect(result?.cells[0].outputs).toEqual([{ kind: "text", text: "ZeroDivisionError: division by zero", error: true }]);
  });

  it("언어는 커널 정보에서 읽고, 없으면 파이썬으로 본다", () => {
    expect(parseNotebook(notebook([], { language_info: { name: "R" } }))?.language).toBe("r");
    expect(parseNotebook(notebook([], {}))?.language).toBe("python");
  });

  it("노트북 형식이 아니면 null (JSON이 아니거나 cells가 없음)", () => {
    expect(parseNotebook("not json")).toBeNull();
    expect(parseNotebook(JSON.stringify({ hello: 1 }))).toBeNull();
  });

  it("SVG·HTML만 있는 출력은 이미지로 넣지 않고 글자 출력으로 대신한다", () => {
    const result = parseNotebook(
      notebook([
        {
          cell_type: "code",
          source: "x",
          outputs: [{ output_type: "display_data", data: { "image/svg+xml": "<svg onload=alert(1)>", "text/plain": "<IPython.core.display.SVG>" } }],
        },
      ]),
    );

    expect(result?.cells[0].outputs).toEqual([{ kind: "text", text: "<IPython.core.display.SVG>", error: false }]);
  });
});
