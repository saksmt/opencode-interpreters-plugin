export class TruncatedView {
  private readonly headChunks: string[] = [];
  private readonly tailChunks: string[] = [];
  private readonly tailVisualLines: number[] = [];

  private readonly headCharacterBudget: number;
  private readonly headLineBudget: number;
  private readonly tailCharacterBudget: number;
  private readonly tailLineBudget: number;

  private headUsedCharacters = 0;
  private headUsedVisualLines = 0;
  private tailUsedCharacters = 0;
  private tailUsedVisualLines = 0;
  private totalVisualLines = 0;
  private truncatedVisualLines = 0;
  private carryoverVisualSegmentLength = 0;
  private pendingVisualLineCount = 0;

  private _totalCharacters = 0;
  private _truncatedCharacters = 0;
  private _truncated = false;

  constructor(
    private readonly maximumLines: number,
    private readonly maximumCharacters: number,
    private readonly lineOverflowAt: number | null = null,
  ) {
    this.headLineBudget = Math.ceil(maximumLines / 2);
    this.tailLineBudget = Math.floor(maximumLines / 2);
    this.headCharacterBudget = Math.ceil(maximumCharacters / 2);
    this.tailCharacterBudget = Math.floor(maximumCharacters / 2);
  }

  feed(data: string): void {
    if (data.length === 0) {
      return;
    }

    const savedCarryover = this.carryoverVisualSegmentLength;

    this._totalCharacters += data.length;

    const { count: newVisualLines, endSegmentLength: trailingSegmentLength } = this.countVisualLines(
      data,
      savedCarryover,
    );
    this.carryoverVisualSegmentLength = trailingSegmentLength;
    this.totalVisualLines += newVisualLines;

    if (this._truncated) {
      this.pushTail(data, newVisualLines);
      this.evictTailToBudget();
    } else if (this.totalVisualLines > this.maximumLines || this._totalCharacters > this.maximumCharacters) {
      this.pushTail(data, newVisualLines);
      this._truncated = true;
      this.evictTailToBudget();
    } else {
      this.fillHeadAndTail(data, newVisualLines, savedCarryover);
    }

    if (trailingSegmentLength > 0) {
      this.pendingVisualLineCount =
        this.lineOverflowAt === null
          ? 1
          : Math.max(1, Math.ceil(trailingSegmentLength / this.lineOverflowAt));
    } else {
      this.pendingVisualLineCount = 0;
    }
  }

  get truncated(): boolean {
    return this._truncated;
  }

  get head(): string[] {
    return this.headChunks;
  }

  get tail(): string[] {
    return this.tailChunks;
  }

  get renderedHead(): string {
    return this.headChunks.join("");
  }

  get renderedTail(): string {
    return this.tailChunks.join("");
  }

  get content(): string[] | null {
    if (this._truncated) {
      return null;
    }
    return [...this.headChunks, ...this.tailChunks];
  }

  get renderedContent(): string | null {
    if (this._truncated) {
      return null;
    }
    return this.headChunks.join("") + this.tailChunks.join("");
  }

  get totalLines(): number {
    return this.totalVisualLines + this.pendingVisualLineCount;
  }

  get totalCharacters(): number {
    return this._totalCharacters;
  }

  get truncatedLines(): number {
    return this.truncatedVisualLines;
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

  private countVisualLines(
    data: string,
    carryoverSegmentLength: number,
  ): { count: number; endSegmentLength: number } {
    let count = 0;
    let segmentLength = carryoverSegmentLength;

    if (this.lineOverflowAt === null) {
      for (const character of data) {
        if (character === "\n") {
          count++;
          segmentLength = 0;
        } else {
          segmentLength++;
        }
      }
      return { count, endSegmentLength: segmentLength };
    }

    for (const character of data) {
      if (character === "\n") {
        count += Math.max(1, Math.ceil(segmentLength / this.lineOverflowAt));
        segmentLength = 0;
      } else {
        segmentLength++;
      }
    }
    return { count, endSegmentLength: segmentLength };
  }

  private pushTail(data: string, visualLines: number): void {
    this.tailChunks.push(data);
    this.tailVisualLines.push(visualLines);
    this.tailUsedCharacters += data.length;
    this.tailUsedVisualLines += visualLines;
  }

  private fillHeadAndTail(data: string, totalVisualLines: number, savedCarryover: number): void {
    let remaining = data;
    let remainingVisualLines = totalVisualLines;

    const headCharacterRoom = this.headCharacterBudget - this.headUsedCharacters;
    const headLineRoom = this.headLineBudget - this.headUsedVisualLines;

    if (headCharacterRoom > 0 && headLineRoom > 0 && remaining.length > 0) {
      const take = Math.min(remaining.length, headCharacterRoom);
      const headPortion = remaining.slice(0, take);
      const { count: headPortionVisualLines } = this.countVisualLines(headPortion, savedCarryover);
      const headVisualLines = Math.min(headPortionVisualLines, headLineRoom);
      this.headChunks.push(headPortion);
      this.headUsedCharacters += headPortion.length;
      this.headUsedVisualLines += headVisualLines;
      remaining = remaining.slice(take);
      remainingVisualLines -= headVisualLines;
    }

    if (remaining.length > 0) {
      this.pushTail(remaining, remainingVisualLines);
    }
  }

  private evictTailToBudget(): void {
    while (
      this.tailUsedCharacters > this.tailCharacterBudget ||
      this.tailUsedVisualLines > this.tailLineBudget
    ) {
      const oldest = this.tailChunks.shift();
      const oldestLines = this.tailVisualLines.shift();
      if (oldest === undefined || oldestLines === undefined) {
        break;
      }
      this.tailUsedCharacters -= oldest.length;
      this.tailUsedVisualLines -= oldestLines;
      this._truncatedCharacters += oldest.length;
      this.truncatedVisualLines += oldestLines;
    }
  }
}
