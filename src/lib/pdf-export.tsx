import React from "react";
import {
  Document,
  Page,
  Text,
  View,
  Image,
  StyleSheet,
  Link,
} from "@react-pdf/renderer";

const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontFamily: "Helvetica",
    fontSize: 12,
    lineHeight: 1.6,
  },
  title: {
    fontSize: 24,
    fontFamily: "Helvetica-Bold",
    marginBottom: 16,
  },
  h1: {
    fontSize: 22,
    fontFamily: "Helvetica-Bold",
    marginTop: 16,
    marginBottom: 8,
  },
  h2: {
    fontSize: 18,
    fontFamily: "Helvetica-Bold",
    marginTop: 14,
    marginBottom: 6,
  },
  h3: {
    fontSize: 15,
    fontFamily: "Helvetica-Bold",
    marginTop: 12,
    marginBottom: 4,
  },
  paragraph: {
    marginBottom: 8,
  },
  bold: {
    fontFamily: "Helvetica-Bold",
  },
  italic: {
    fontFamily: "Helvetica-Oblique",
  },
  boldItalic: {
    fontFamily: "Helvetica-BoldOblique",
  },
  inlineCode: {
    fontFamily: "Courier",
    fontSize: 10,
    backgroundColor: "#f3f4f6",
  },
  codeBlock: {
    fontFamily: "Courier",
    fontSize: 10,
    backgroundColor: "#f3f4f6",
    padding: 12,
    marginBottom: 8,
    borderRadius: 4,
  },
  listItem: {
    flexDirection: "row",
    marginBottom: 4,
    paddingLeft: 16,
  },
  listBullet: {
    width: 16,
  },
  listContent: {
    flex: 1,
  },
  checkboxChecked: {
    width: 11,
    height: 11,
    borderWidth: 1,
    borderColor: "#3b82f6",
    backgroundColor: "#3b82f6",
    borderRadius: 2,
    marginRight: 6,
    marginTop: 2,
  },
  checkboxUnchecked: {
    width: 11,
    height: 11,
    borderWidth: 1,
    borderColor: "#9ca3af",
    borderRadius: 2,
    marginRight: 6,
    marginTop: 2,
  },
  checkmark: {
    fontSize: 7,
    color: "#ffffff",
    textAlign: "center",
    lineHeight: 1.4,
  },
  strikethrough: {
    textDecoration: "line-through",
    color: "#9ca3af",
  },
  blockquote: {
    borderLeftWidth: 3,
    borderLeftColor: "#d1d5db",
    paddingLeft: 12,
    marginBottom: 8,
    color: "#6b7280",
  },
  hr: {
    borderBottomWidth: 1,
    borderBottomColor: "#d1d5db",
    marginVertical: 12,
  },
  link: {
    color: "#2563eb",
    textDecoration: "underline",
  },
  sketchSection: {
    marginTop: 24,
    borderTopWidth: 1,
    borderTopColor: "#d1d5db",
    paddingTop: 16,
  },
  sketchLabel: {
    fontSize: 14,
    fontFamily: "Helvetica-Bold",
    marginBottom: 8,
    color: "#6b7280",
  },
  sketchImage: {
    maxWidth: "100%",
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#d1d5db",
  },
  tableHeaderRow: {
    flexDirection: "row",
    borderBottomWidth: 2,
    borderBottomColor: "#9ca3af",
    backgroundColor: "#f3f4f6",
  },
  tableCell: {
    flex: 1,
    padding: 4,
    fontSize: 11,
  },
  tableCellHeader: {
    flex: 1,
    padding: 4,
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
  },
  tableContainer: {
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 2,
  },
});

interface NoteDocumentProps {
  title: string;
  content: string;
  sketchImage?: string | null;
}

// Inline token types for rich text rendering
type InlineToken =
  | { type: "text"; text: string }
  | { type: "bold"; text: string }
  | { type: "italic"; text: string }
  | { type: "boldItalic"; text: string }
  | { type: "code"; text: string }
  | { type: "strikethrough"; text: string }
  | { type: "link"; text: string; href: string };

function tokenizeInline(text: string): InlineToken[] {
  const tokens: InlineToken[] = [];
  // Order matters: bold-italic before bold/italic, bold before italic
  const regex =
    /(\*\*\*(.+?)\*\*\*|___(.+?)___|\*\*(.+?)\*\*|__(.+?)__|~~(.+?)~~|\*(.+?)\*|_(.+?)_|`(.+?)`|\[(.+?)\]\((.+?)\)|!\[.*?\]\(.+?\))/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    // Push plain text before this match
    if (match.index > lastIndex) {
      tokens.push({ type: "text", text: text.slice(lastIndex, match.index) });
    }

    if (match[2] || match[3]) {
      // ***bold italic*** or ___bold italic___
      tokens.push({ type: "boldItalic", text: match[2] || match[3] });
    } else if (match[4] || match[5]) {
      // **bold** or __bold__
      tokens.push({ type: "bold", text: match[4] || match[5] });
    } else if (match[6]) {
      // ~~strikethrough~~
      tokens.push({ type: "strikethrough", text: match[6] });
    } else if (match[7] || match[8]) {
      // *italic* or _italic_
      tokens.push({ type: "italic", text: match[7] || match[8] });
    } else if (match[9]) {
      // `inline code`
      tokens.push({ type: "code", text: match[9] });
    } else if (match[10] && match[11]) {
      // [link text](url)
      tokens.push({ type: "link", text: match[10], href: match[11] });
    }
    // ![alt](url) images are silently dropped

    lastIndex = match.index + match[0].length;
  }

  // Remaining plain text
  if (lastIndex < text.length) {
    tokens.push({ type: "text", text: text.slice(lastIndex) });
  }

  return tokens;
}

function renderInlineTokens(
  tokens: InlineToken[],
  keyPrefix: string
): React.ReactNode[] {
  return tokens.map((token, j) => {
    const key = `${keyPrefix}-${j}`;
    switch (token.type) {
      case "bold":
        return (
          <Text key={key} style={styles.bold}>
            {token.text}
          </Text>
        );
      case "italic":
        return (
          <Text key={key} style={styles.italic}>
            {token.text}
          </Text>
        );
      case "boldItalic":
        return (
          <Text key={key} style={styles.boldItalic}>
            {token.text}
          </Text>
        );
      case "code":
        return (
          <Text key={key} style={styles.inlineCode}>
            {token.text}
          </Text>
        );
      case "strikethrough":
        return (
          <Text key={key} style={styles.strikethrough}>
            {token.text}
          </Text>
        );
      case "link":
        return (
          <Link key={key} src={token.href} style={styles.link}>
            {token.text}
          </Link>
        );
      default:
        return <Text key={key}>{token.text}</Text>;
    }
  });
}

function renderInlineText(
  text: string,
  keyPrefix: string
): React.ReactNode[] {
  return renderInlineTokens(tokenizeInline(text), keyPrefix);
}

function parseMarkdownToPdfElements(content: string): React.ReactNode[] {
  const lines = content.split("\n");
  const elements: React.ReactNode[] = [];
  let inCodeBlock = false;
  let codeBlockContent = "";
  let listCounter = 0;
  let tableRows: string[][] = [];
  let inTable = false;

  function flushTable(endIndex: number) {
    if (tableRows.length === 0) return;
    const headerRow = tableRows[0];
    // Skip separator row (row index 1), data starts at index 2
    const dataRows = tableRows.slice(2);
    elements.push(
      <View key={`table-${endIndex}`} style={styles.tableContainer}>
        <View style={styles.tableHeaderRow}>
          {headerRow.map((cell, ci) => (
            <Text key={`th-${endIndex}-${ci}`} style={styles.tableCellHeader}>
              {cell.trim()}
            </Text>
          ))}
        </View>
        {dataRows.map((row, ri) => (
          <View key={`tr-${endIndex}-${ri}`} style={styles.tableRow}>
            {row.map((cell, ci) => (
              <Text key={`td-${endIndex}-${ri}-${ci}`} style={styles.tableCell}>
                {cell.trim()}
              </Text>
            ))}
          </View>
        ))}
      </View>
    );
    tableRows = [];
    inTable = false;
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Code block toggle
    if (line.trim().startsWith("```")) {
      if (inTable) flushTable(i);
      if (inCodeBlock) {
        elements.push(
          <Text key={`code-${i}`} style={styles.codeBlock}>
            {codeBlockContent.trimEnd()}
          </Text>
        );
        codeBlockContent = "";
        inCodeBlock = false;
      } else {
        inCodeBlock = true;
      }
      continue;
    }

    if (inCodeBlock) {
      codeBlockContent += (codeBlockContent ? "\n" : "") + line;
      continue;
    }

    // Table detection: line contains | and isn't a different block element
    const isTableLine =
      line.includes("|") && !line.match(/^(#{1,6}\s|>\s|[-*+]\s|\d+\.\s)/);
    if (isTableLine) {
      const cells = line
        .split("|")
        .map((c) => c.trim())
        .filter((_, idx, arr) => idx > 0 && idx < arr.length); // strip empty first/last from leading/trailing |
      if (cells.length > 0) {
        tableRows.push(cells);
        inTable = true;
        continue;
      }
    } else if (inTable) {
      flushTable(i);
    }

    // Empty line
    if (!line.trim()) {
      listCounter = 0;
      continue;
    }

    // Headings
    const h1Match = line.match(/^# (.+)/);
    if (h1Match) {
      elements.push(
        <Text key={`h1-${i}`} style={styles.h1}>
          {renderInlineText(h1Match[1], `h1-${i}`)}
        </Text>
      );
      continue;
    }

    const h2Match = line.match(/^## (.+)/);
    if (h2Match) {
      elements.push(
        <Text key={`h2-${i}`} style={styles.h2}>
          {renderInlineText(h2Match[1], `h2-${i}`)}
        </Text>
      );
      continue;
    }

    const h3Match = line.match(/^###+ (.+)/);
    if (h3Match) {
      elements.push(
        <Text key={`h3-${i}`} style={styles.h3}>
          {renderInlineText(h3Match[1], `h3-${i}`)}
        </Text>
      );
      continue;
    }

    // Horizontal rule
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(line.trim())) {
      elements.push(<View key={`hr-${i}`} style={styles.hr} />);
      continue;
    }

    // Blockquote
    const bqMatch = line.match(/^>\s?(.*)/);
    if (bqMatch) {
      elements.push(
        <View key={`bq-${i}`} style={styles.blockquote}>
          <Text>{renderInlineText(bqMatch[1], `bq-${i}`)}</Text>
        </View>
      );
      continue;
    }

    // Checkbox list items: - [x] or - [ ]
    const checkboxMatch = line.match(/^[-*+]\s+\[([ xX])\]\s+(.*)/);
    if (checkboxMatch) {
      const checked = checkboxMatch[1].toLowerCase() === "x";
      elements.push(
        <View key={`cb-${i}`} style={styles.listItem}>
          <View
            style={checked ? styles.checkboxChecked : styles.checkboxUnchecked}
          >
            {checked ? <Text style={styles.checkmark}>✓</Text> : null}
          </View>
          <Text
            style={
              checked
                ? [styles.listContent, styles.strikethrough]
                : styles.listContent
            }
          >
            {renderInlineText(checkboxMatch[2], `cb-${i}`)}
          </Text>
        </View>
      );
      continue;
    }

    // Unordered list
    const ulMatch = line.match(/^[-*+]\s+(.*)/);
    if (ulMatch) {
      elements.push(
        <View key={`ul-${i}`} style={styles.listItem}>
          <Text style={styles.listBullet}>{"\u2022 "}</Text>
          <Text style={styles.listContent}>
            {renderInlineText(ulMatch[1], `ul-${i}`)}
          </Text>
        </View>
      );
      continue;
    }

    // Ordered list
    const olMatch = line.match(/^(\d+)\.\s+(.*)/);
    if (olMatch) {
      listCounter++;
      elements.push(
        <View key={`ol-${i}`} style={styles.listItem}>
          <Text style={styles.listBullet}>{`${listCounter}. `}</Text>
          <Text style={styles.listContent}>
            {renderInlineText(olMatch[2], `ol-${i}`)}
          </Text>
        </View>
      );
      continue;
    }

    // Regular paragraph
    listCounter = 0;
    elements.push(
      <Text key={`p-${i}`} style={styles.paragraph}>
        {renderInlineText(line, `p-${i}`)}
      </Text>
    );
  }

  // Flush any remaining table
  if (inTable) flushTable(lines.length);

  // Close unclosed code block
  if (inCodeBlock && codeBlockContent) {
    elements.push(
      <Text key="code-final" style={styles.codeBlock}>
        {codeBlockContent.trimEnd()}
      </Text>
    );
  }

  return elements;
}

export function NoteDocument({
  title,
  content,
  sketchImage,
}: NoteDocumentProps) {
  const contentElements = parseMarkdownToPdfElements(content);

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {title ? <Text style={styles.title}>{title}</Text> : null}
        {contentElements}
        {sketchImage ? (
          <View style={styles.sketchSection}>
            <Text style={styles.sketchLabel}>Sketch</Text>
            <Image style={styles.sketchImage} src={sketchImage} />
          </View>
        ) : null}
      </Page>
    </Document>
  );
}
