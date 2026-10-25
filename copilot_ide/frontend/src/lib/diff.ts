/* -- 3-Tier Resilient Search & Replace Diff Engine ----------- */
export interface DiffBlock {
  search: string;
  replace: string;
}

export function parseDiffBlocks(text: string): DiffBlock[] {
  const blocks: DiffBlock[] = [];
  if (!text) return blocks;

  const regex = /<{3,9}\s*SEARCH\r?\n([\s\S]*?)\r?\n={3,9}\r?\n([\s\S]*?)(?:\r?\n>{0,9}\s*REPLACE|\r?\n(?=<{3,9}\s*SEARCH)|$)/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    let search = match[1].trimEnd();
    let replace = match[2].trimEnd();

    // Strip any trailing delimiter artifacts
    replace = replace.replace(/\r?\n>{0,9}\s*REPLACE\s*$/, '').trimEnd();
    if (replace === '>>>>>>> REPLACE' || replace === '>>>> REPLACE' || replace === 'REPLACE') {
      replace = '';
    }
    
    // Strip leading SEARCH markers if present
    search = search.replace(/^<{3,9}\s*SEARCH\r?\n/, '').trimEnd();

    if (search.length > 0 || replace.length > 0) {
      blocks.push({ search, replace });
    }
  }
  return blocks;
}

export function preprocessMarkdownDiffs(content: string): string {
  if (!content) return '';
  const parts = content.split(/(```[\s\S]*?```)/g);
  return parts.map(part => {
    if (part.startsWith('```')) return part;
    if (part.includes('SEARCH') && (part.includes('<<<<') || part.includes('===='))) {
      return part.replace(
        /((?:<{3,9}\s*SEARCH[\s\S]*?(?:>{0,9}\s*REPLACE|\n(?=<{3,9}\s*SEARCH)|$))+)/g,
        '\n```diff\n$1\n```\n'
      );
    }
    return part;
  }).join('');
}

export function applyDiffBlocks(originalContent: string, diffText: string): { success: boolean; newContent: string; appliedCount: number; errors: string[] } {
  const blocks = parseDiffBlocks(diffText);
  if (blocks.length === 0) {
    return { success: false, newContent: originalContent, appliedCount: 0, errors: ["No valid <<<<<<< SEARCH / ======= / >>>>>>> REPLACE blocks found."] };
  }

  let currentContent = originalContent;
  let appliedCount = 0;
  const errors: string[] = [];

  for (let i = 0; i < blocks.length; i++) {
    const { search, replace } = blocks[i];
    if (!search.trim()) continue;

    // ── Tier 1: Exact Substring Match ──
    if (currentContent.includes(search)) {
      currentContent = currentContent.replace(search, replace);
      appliedCount++;
      continue;
    }

    // ── Tier 2: Line-by-Line Whitespace/Indentation-Tolerant Match ──
    const fileLines = currentContent.split('\n');
    const searchLines = search.split('\n').map(l => l.trimEnd());
    const searchLinesTrimmed = searchLines.map(l => l.trim());
    
    let matchedStartIdx = -1;
    for (let fIdx = 0; fIdx <= fileLines.length - searchLines.length; fIdx++) {
      let isMatch = true;
      for (let sIdx = 0; sIdx < searchLines.length; sIdx++) {
        if (fileLines[fIdx + sIdx].trim() !== searchLinesTrimmed[sIdx]) {
          isMatch = false;
          break;
        }
      }
      if (isMatch) {
        matchedStartIdx = fIdx;
        break;
      }
    }

    if (matchedStartIdx !== -1) {
      const matchedFirstLine = fileLines[matchedStartIdx];
      const matchIndent = matchedFirstLine.match(/^(\s*)/)?.[1] || '';
      
      const searchFirstLine = search.split('\n')[0] || '';
      const searchIndent = searchFirstLine.match(/^(\s*)/)?.[1] || '';

      const replaceLines = replace.split('\n').map(line => {
        if (!line.trim()) return line;
        if (line.startsWith(searchIndent)) {
          return matchIndent + line.substring(searchIndent.length);
        }
        return matchIndent + line.trimStart();
      });

      fileLines.splice(matchedStartIdx, searchLines.length, ...replaceLines);
      currentContent = fileLines.join('\n');
      appliedCount++;
      continue;
    }

    // ── Tier 3: Anchor Match (First & Last Line Match with bounded interior) ──
    if (searchLinesTrimmed.length >= 3) {
      const firstSearchLine = searchLinesTrimmed[0];
      const lastSearchLine = searchLinesTrimmed[searchLinesTrimmed.length - 1];

      let anchorStart = -1;
      let anchorEnd = -1;

      for (let fIdx = 0; fIdx < fileLines.length; fIdx++) {
        if (fileLines[fIdx].trim() === firstSearchLine) {
          for (let look = fIdx + 1; look < Math.min(fileLines.length, fIdx + searchLines.length + 6); look++) {
            if (fileLines[look].trim() === lastSearchLine) {
              anchorStart = fIdx;
              anchorEnd = look;
              break;
            }
          }
          if (anchorStart !== -1) break;
        }
      }

      if (anchorStart !== -1 && anchorEnd !== -1) {
        const replaceLines = replace.split('\n');
        fileLines.splice(anchorStart, anchorEnd - anchorStart + 1, ...replaceLines);
        currentContent = fileLines.join('\n');
        appliedCount++;
        continue;
      }
    }

    errors.push(`Diff block #${i + 1} could not be matched in active file.`);
  }

  return {
    success: appliedCount > 0,
    newContent: currentContent,
    appliedCount,
    errors
  };
}
