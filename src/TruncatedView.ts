/**
 * Represents a truncated view of a text stream with a maximum number of lines and characters.
 * When stream exceeds the maximum number of lines or characters view only keeps it's head and tail
 * There's an option to count lines not only by '\n' but also by their visible representation based on
 * line overflow limit. ASCII escape codes are not taken into account.
 *
 * Usage:
 * ```
 * const myView = new TruncatedView(10, 1000, 80)
 *
 * // repeatedly feed output of some stream:
 * myView.feed(data)
 * // ...
 *
 * myView.truncated // check if view is truncated
 * myView.renderedHead // get rendered head of the view
 * myView.renderedTail // get rendered tail of the view
 * myView.renderedContent // get full content of the view or null if it was truncated
 *
 * myView.totalLines // get total number of lines passed to this view
 * myView.totalCharacters // get total number of characters passed to this view
 * myView.truncatedLines // get number of lines that were omitted
 * myView.truncatedCharacters // get number of characters that were omitted
 *
 * // render view - either returns full content or head+user-specified-separator+tail
 * myView.render(() => `... omitted ${myView.truncatedCharacters} characters ...`)
 * ```
 */
export class TruncatedView {
  private readonly _headChunks: string[] = [];
  private readonly _tailChunks: string[] = [];
  private readonly _tailVisualLines: number[] = [];

  private _headUsedCharacters = 0;
  private _headUsedVisualLines = 0;
  private readonly _headCharacterBudget: number;
  private readonly _headLineBudget: number;

  private _tailUsedCharacters = 0;
  private _tailUsedVisualLines = 0;
  private readonly _tailCharacterBudget: number;
  private readonly _tailLineBudget: number;

  private _totalCharacters = 0;
  private _totalVisualLines = 0;
  private _truncatedCharacters = 0;
  private _truncatedVisualLines = 0;

  private _truncated = false;
  private _carryoverVisualSegmentLength = 0;
  private _pendingVisualLineCount = 0;

  constructor(
    private readonly maxLines: number,
    private readonly maxCharacters: number,
    private readonly lineOverflowAt: number | null = null,
  ) {
    this._headLineBudget = Math.ceil(maxLines / 2);
    this._tailLineBudget = Math.floor(maxLines / 2);
    this._headCharacterBudget = Math.ceil(maxCharacters / 2);
    this._tailCharacterBudget = Math.floor(maxCharacters / 2);
  }

  feed(data: string): void {
    if (data.length === 0) {
      return;
    }

    const cleanData = data.replace(/\r/g, "");
    const savedCarryover = this._carryoverVisualSegmentLength;

    this._totalCharacters += cleanData.length;

    const { count: newVisualLines, endSegmentLength: trailingSegmentLen } =
      this._countVisualLines(cleanData, savedCarryover);
    this._carryoverVisualSegmentLength = trailingSegmentLen;
    this._totalVisualLines += newVisualLines;

    if (this._truncated) {
      this._pushTail(cleanData, newVisualLines);
      this._evictTailToBudget();
    } else if (
      this._totalVisualLines > this.maxLines ||
      this._totalCharacters > this.maxCharacters
    ) {
      this._pushTail(cleanData, newVisualLines);
      this._truncated = true;
      this._evictTailToBudget();
    } else {
      this._fillHeadAndTail(cleanData, newVisualLines, savedCarryover);
    }

    if (trailingSegmentLen > 0) {
      this._pendingVisualLineCount =
        this.lineOverflowAt === null
          ? 1
          : Math.max(1, Math.ceil(trailingSegmentLen / this.lineOverflowAt));
    } else {
      this._pendingVisualLineCount = 0;
    }
  }

  private _fillHeadAndTail(
    data: string,
    totalVisualLines: number,
    savedCarryover: number,
  ): void {
    let remaining = data;
    let remainingVisualLines = totalVisualLines;

    const headCharRoom = this._headCharacterBudget - this._headUsedCharacters;
    const headLineRoom = this._headLineBudget - this._headUsedVisualLines;

    if (headCharRoom > 0 && headLineRoom > 0 && remaining.length > 0) {
      const take = Math.min(remaining.length, headCharRoom);
      const headPortion = remaining.slice(0, take);
      const { count: headPortionVLines } = this._countVisualLines(
        headPortion,
        savedCarryover,
      );
      const headVLines = Math.min(headPortionVLines, headLineRoom);
      this._headChunks.push(headPortion);
      this._headUsedCharacters += headPortion.length;
      this._headUsedVisualLines += headVLines;
      remaining = remaining.slice(take);
      remainingVisualLines -= headVLines;
    }

    if (remaining.length > 0) {
      this._pushTail(remaining, remainingVisualLines);
    }
  }

  private _pushTail(data: string, visualLines: number): void {
    this._tailChunks.push(data);
    this._tailVisualLines.push(visualLines);
    this._tailUsedCharacters += data.length;
    this._tailUsedVisualLines += visualLines;
  }

  private _evictTailToBudget(): void {
    while (
      this._tailUsedCharacters > this._tailCharacterBudget ||
      this._tailUsedVisualLines > this._tailLineBudget
    ) {
      const oldest = this._tailChunks.shift();
      const oldestLines = this._tailVisualLines.shift();
      if (oldest === undefined || oldestLines === undefined) {
        break;
      }
      this._tailUsedCharacters -= oldest.length;
      this._tailUsedVisualLines -= oldestLines;
      this._truncatedCharacters += oldest.length;
      this._truncatedVisualLines += oldestLines;
    }
  }

  private _countVisualLines(
    data: string,
    carryoverSegmentLength: number,
  ): { count: number; endSegmentLength: number } {
    let count = 0;
    let segLen = carryoverSegmentLength;

    if (this.lineOverflowAt === null) {
      for (const char of data) {
        if (char === "\n") {
          count++;
          segLen = 0;
        } else {
          segLen++;
        }
      }
      return { count, endSegmentLength: segLen };
    }

    for (const char of data) {
      if (char === "\n") {
        count += Math.max(1, Math.ceil(segLen / this.lineOverflowAt));
        segLen = 0;
      } else {
        segLen++;
      }
    }
    return { count, endSegmentLength: segLen };
  }

  get truncated(): boolean {
    return this._truncated;
  }

  get head(): string[] {
    return this._headChunks;
  }

  get tail(): string[] {
    return this._tailChunks;
  }

  get renderedHead(): string {
    return this._headChunks.join("");
  }

  get renderedTail(): string {
    return this._tailChunks.join("");
  }

  get content(): string[] | null {
    if (this._truncated) {
      return null;
    }
    return [...this._headChunks, ...this._tailChunks];
  }

  get renderedContent(): string | null {
    if (this._truncated) {
      return null;
    }
    return this._headChunks.join("") + this._tailChunks.join("");
  }

  get totalLines(): number {
    return this._totalVisualLines + this._pendingVisualLineCount;
  }

  get totalCharacters(): number {
    return this._totalCharacters;
  }

  get truncatedLines(): number {
    return this._truncatedVisualLines;
  }

  get truncatedCharacters(): number {
    return this._truncatedCharacters;
  }

  render(headTailSeparator: () => string): string {
    if (!this._truncated) {
      return this.renderedContent ?? "";
    }
    return `${this.renderedHead}${headTailSeparator()}${this.renderedTail}`;
  }
}
