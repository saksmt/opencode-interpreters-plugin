# Truncated View — Streaming Head/Tail Truncation

**Status:** accepted · **Date:** 2026-05-13

## Context

A shell tool needs to display streaming command output truncated to a maximum size, showing the head (beginning) and tail (end) with an ellipsis in between. The `feed()` method is called on every chunk and must be fast. Getters and `render()` are called rarely (once per command completion).

## Decisions

### 1. Raw-chunk storage, not line-based

Store incoming strings verbatim in `headChunks`/`tailChunks`. Count visual lines on the fly during `feed()` using a character-by-character scan. This avoids O(n) string copying/splitting on every `feed()` call at the cost of O(n) work in rarely-called getters.

### 2. Char budget is primary, line budget is secondary

Head/tail each get `ceil/floor(max/2)` of both character and line budgets. Character budget is the primary constraint; line budget caps it to prevent one extremely long line from monopolizing head space.

### 3. Truncation boundary at feed-call granularity

Before truncation, `fillHeadAndTail()` fills head budget and spills the remainder to tail (both are "visible" via `content`). On the first `feed()` call where total exceeds limits, the *entire* chunk goes directly to tail — no head fill is attempted. All subsequent chunks also go to tail with eviction.

Rationale: head is a frozen record of content up to the truncation point. If we allowed head fill during the overflow call, the head would non-deterministically contain partial overflow data. Keeping the boundary at feed-call granularity ensures the head content is exactly what was received before the limit was crossed, regardless of chunk size.

### 4. Tail eviction via simple `shift()`

Tail is a `string[]` with a parallel `tailVisualLines: number[]`. When over budget, oldest entries are `shift()`ed off. `shift()` is O(n) but budget bounds the array to small sizes, making the simplicity worthwhile.

### 5. Pending line for unterminated segments

If `feed()` data doesn't end with `\n`, the trailing segment is counted as a pending line in `totalLines` (1 line, or `ceil(segmentLength / lineOverflowAt)` with overflow). The pending count is stored separately and reset on the next `feed()` that ends with `\n`.

## Consequences

- `feed()` is O(n) with n = chunk length (single pass, no copying). Cheap relative to I/O.
- Getters/render do `join("")` over head/tail arrays — O(total length) but called once per command.
- Partial lines across `feed()` calls are tracked correctly via carryover state.
- Tail underutilization is bounded by the largest single `feed()` chunk (acceptable since chunks are typically small).
