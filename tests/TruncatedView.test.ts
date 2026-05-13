import { describe, expect, it } from "bun:test";
import { TruncatedView } from "../src/TruncatedView.ts";

const SMALL_LINE_LIMIT = 10;
const SMALL_CHAR_LIMIT = 100;

describe("TruncatedView", () => {
  describe("no truncation", () => {
    it("returns full content when data fits in head entirely", () => {
      const view = new TruncatedView(SMALL_LINE_LIMIT, SMALL_CHAR_LIMIT);
      view.feed("hello\nworld\nfoo\n");
      expect(view.truncated).toBe(false);
      expect(view.renderedContent).toBe("hello\nworld\nfoo\n");
      expect(view.content?.join("")).toBe("hello\nworld\nfoo\n");
      expect(view.head.join("")).toBe("hello\nworld\nfoo\n");
      expect(view.tail.join("")).toBe("");
    });

    it("spills to tail when head budget exhausted but within total limits", () => {
      const view = new TruncatedView(SMALL_LINE_LIMIT, 20);
      view.feed("a\nb\nc\nd\ne\nf\ng\nh\ni\nj\n");
      expect(view.truncated).toBe(false);
      expect(view.totalCharacters).toBe(20);
      expect(view.content?.join("")).toBe("a\nb\nc\nd\ne\nf\ng\nh\ni\nj\n");
    });
  });

  describe("truncation by lines", () => {
    it("marks truncated and keeps head+tail when total lines exceed maxLines", () => {
      const view = new TruncatedView(6, 500);
      for (let i = 0; i < 10; i++) {
        view.feed(`line${i}\n`);
      }
      expect(view.truncated).toBe(true);
      expect(view.content).toBeNull();
      expect(view.renderedContent).toBeNull();

      const output = view.render(() => "...");
      expect(output).toContain("line0");
      expect(output).toContain("line9");
      expect(output).toContain("...");
    });

    it("head has first budget lines, tail has last budget lines", () => {
      const view = new TruncatedView(6, 500);
      for (let i = 0; i < 10; i++) {
        view.feed(`line${i}\n`);
      }
      const headLines = view.renderedHead.split("\n").filter(Boolean);
      const tailLines = view.renderedTail.split("\n").filter(Boolean);
      expect(headLines[0]).toBe("line0");
      expect(tailLines.at(-1)).toBe("line9");
    });
  });

  describe("truncation by characters", () => {
    it("marks truncated when total characters exceed maxCharacters", () => {
      const view = new TruncatedView(SMALL_LINE_LIMIT, 20);
      view.feed("a".repeat(30));
      expect(view.truncated).toBe(true);
      expect(view.content).toBeNull();
    });
  });

  describe("chunked feed with partial lines", () => {
    it("accumulates partial lines across feed calls", () => {
      const view = new TruncatedView(SMALL_LINE_LIMIT, SMALL_CHAR_LIMIT);
      view.feed("hel");
      view.feed("lo\n");
      view.feed("world\n");
      expect(view.renderedContent).toBe("hello\nworld\n");
      expect(view.totalLines).toBe(2);
    });

    it("handles multiple partial feeds then a complete feed", () => {
      const view = new TruncatedView(SMALL_LINE_LIMIT, SMALL_CHAR_LIMIT);
      view.feed("a");
      view.feed("b");
      view.feed("c\n");
      expect(view.renderedContent).toBe("abc\n");
      expect(view.totalLines).toBe(1);
    });
  });

  describe("mid-line budget split", () => {
    it("splits chunk mid-word at budget boundary and join('') reconstructs", () => {
      const view = new TruncatedView(SMALL_LINE_LIMIT, 15);
      view.feed("hello world\n");
      expect(view.renderedHead).toBe("hello wo");
      expect(view.renderedTail).toBe("rld\n");
      expect(view.renderedContent).toBe("hello world\n");
      expect(view.truncated).toBe(false);
    });
  });

  describe("tail eviction", () => {
    it("drops oldest tail chunks when tail exceeds character budget", () => {
      const view = new TruncatedView(SMALL_LINE_LIMIT, 30);
      view.feed(
        "a\nb\nc\nd\ne\nf\ng\nh\ni\nj\nk\nl\nm\nn\no\np\nq\nr\ns\nt\nu\nv\nw\nx\ny\nz\n",
      );
      expect(view.truncated).toBe(true);
      const combined = view.renderedHead + view.renderedTail;
      expect(combined.length).toBeLessThanOrEqual(30);
    });
  });

  describe("render()", () => {
    it("returns full content when not truncated", () => {
      const view = new TruncatedView(SMALL_LINE_LIMIT, SMALL_CHAR_LIMIT);
      view.feed("hello\nworld\n");
      expect(view.render(() => "...")).toBe("hello\nworld\n");
    });

    it("returns head + separator + tail when truncated", () => {
      const view = new TruncatedView(4, SMALL_CHAR_LIMIT);
      for (let i = 0; i < 8; i++) {
        view.feed(`line${i}\n`);
      }
      const result = view.render(() => "___SEP___");
      expect(result).toContain("line0");
      expect(result).toContain("line7");
      expect(result).toContain("___SEP___");
    });
  });

  describe("lineOverflowAt", () => {
    it("counts long physical lines as multiple visual lines for budget", () => {
      const view = new TruncatedView(4, 500, 20);
      const longLine = `${"x".repeat(60)}\n`;
      view.feed(longLine);
      expect(view.totalLines).toBe(3);
      expect(view.renderedContent).toBe(longLine);
    });

    it("counts partial trailing segment as a pending visual line", () => {
      const view = new TruncatedView(SMALL_LINE_LIMIT, 500, 20);
      view.feed("hello\n");
      view.feed("x".repeat(15));
      expect(view.totalLines).toBe(2);
    });
  });

  describe("empty content", () => {
    it("returns empty/zero for all getters with no feed calls", () => {
      const view = new TruncatedView(SMALL_LINE_LIMIT, SMALL_CHAR_LIMIT);
      expect(view.truncated).toBe(false);
      expect(view.head).toEqual([]);
      expect(view.tail).toEqual([]);
      expect(view.renderedHead).toBe("");
      expect(view.renderedTail).toBe("");
      expect(view.content).toEqual([]);
      expect(view.renderedContent).toBe("");
      expect(view.totalLines).toBe(0);
      expect(view.totalCharacters).toBe(0);
      expect(view.truncatedLines).toBe(0);
      expect(view.truncatedCharacters).toBe(0);
    });
  });

  describe("counters", () => {
    it("tracks totalCharacters and totalLines accurately", () => {
      const view = new TruncatedView(SMALL_LINE_LIMIT, SMALL_CHAR_LIMIT);
      view.feed("hello\nworld\n");
      expect(view.totalCharacters).toBe("hello\nworld\n".length);
      expect(view.totalLines).toBe(2);
    });

    it("tracks truncatedCharacters and truncatedLines", () => {
      const view = new TruncatedView(4, SMALL_CHAR_LIMIT);
      for (let i = 0; i < 8; i++) {
        view.feed(`line${i}\n`);
      }
      expect(view.truncatedLines).toBeGreaterThan(0);
      expect(view.truncatedCharacters).toBeGreaterThan(0);
    });
  });

  describe("carriage return handling", () => {
    it("strips \\r from line endings", () => {
      const view = new TruncatedView(SMALL_LINE_LIMIT, SMALL_CHAR_LIMIT);
      view.feed("hello\r\nworld\r\n");
      expect(view.renderedContent).toBe("hello\nworld\n");
      expect(view.totalLines).toBe(2);
    });
  });

  describe("empty feed data", () => {
    it("handles empty string feed", () => {
      const view = new TruncatedView(SMALL_LINE_LIMIT, SMALL_CHAR_LIMIT);
      view.feed("");
      expect(view.totalCharacters).toBe(0);
      expect(view.totalLines).toBe(0);
      expect(view.renderedContent).toBe("");
    });
  });
});
