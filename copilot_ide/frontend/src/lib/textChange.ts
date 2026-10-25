/* -- Smallest single replacement that turns one text into another ----
 * Used to apply edits made outside the editor (agent edits, reverts) as one
 * change, so the cursor, folds and undo history around it stay put.
 */
export interface TextChange {
  from: number;
  to: number;
  insert: string;
}

export function minimalChange(prev: string, next: string): TextChange {
  const max = Math.min(prev.length, next.length);
  let start = 0;
  while (start < max && prev.charCodeAt(start) === next.charCodeAt(start)) start++;

  let endPrev = prev.length;
  let endNext = next.length;
  while (endPrev > start && endNext > start && prev.charCodeAt(endPrev - 1) === next.charCodeAt(endNext - 1)) {
    endPrev--;
    endNext--;
  }
  return { from: start, to: endPrev, insert: next.slice(start, endNext) };
}
