interface CheckboxInfo {
  lineIndex: number;
  checked: boolean;
  indentation: number;
}

const CHECKBOX_RE = /^(\s*)- \[([ xX])\] /;

export function findCheckboxes(markdown: string): CheckboxInfo[] {
  const lines = markdown.split("\n");
  const result: CheckboxInfo[] = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(CHECKBOX_RE);
    if (m) {
      result.push({
        lineIndex: i,
        checked: m[2] !== " ",
        indentation: m[1].length,
      });
    }
  }
  return result;
}

/**
 * Find the contiguous group of checkbox lines at the same indentation level
 * surrounding the given line index.
 */
function findChecklistGroup(
  lines: string[],
  lineIndex: number,
  indent: number
): number[] {
  const group: number[] = [lineIndex];

  // Walk upward
  for (let i = lineIndex - 1; i >= 0; i--) {
    const m = lines[i].match(CHECKBOX_RE);
    if (m && m[1].length === indent) {
      group.unshift(i);
    } else {
      break;
    }
  }

  // Walk downward
  for (let i = lineIndex + 1; i < lines.length; i++) {
    const m = lines[i].match(CHECKBOX_RE);
    if (m && m[1].length === indent) {
      group.push(i);
    } else {
      break;
    }
  }

  return group;
}

/**
 * Toggle the Nth checkbox in the markdown, then sort its contiguous group
 * (unchecked first, checked last, stable within each partition).
 */
export function toggleCheckbox(
  markdown: string,
  checkboxIndex: number
): string {
  const checkboxes = findCheckboxes(markdown);
  if (checkboxIndex < 0 || checkboxIndex >= checkboxes.length) return markdown;

  const lines = markdown.split("\n");
  const target = checkboxes[checkboxIndex];

  // Toggle the checkbox
  const line = lines[target.lineIndex];
  if (target.checked) {
    lines[target.lineIndex] = line.replace("- [x] ", "- [ ] ").replace("- [X] ", "- [ ] ");
  } else {
    lines[target.lineIndex] = line.replace("- [ ] ", "- [x] ");
  }

  // Find the contiguous group and sort: unchecked first, checked last
  const group = findChecklistGroup(lines, target.lineIndex, target.indentation);
  const groupLines = group.map((i) => lines[i]);

  const unchecked: string[] = [];
  const checked: string[] = [];
  for (const gl of groupLines) {
    const m = gl.match(CHECKBOX_RE);
    if (m && m[2] !== " ") {
      checked.push(gl);
    } else {
      unchecked.push(gl);
    }
  }

  const sorted = [...unchecked, ...checked];
  for (let i = 0; i < group.length; i++) {
    lines[group[i]] = sorted[i];
  }

  return lines.join("\n");
}
