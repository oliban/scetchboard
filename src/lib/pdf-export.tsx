import React from "react";
import {
  Document,
  Page,
  Text,
  View,
  Image,
  StyleSheet,
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
  code: {
    fontFamily: "Courier",
    fontSize: 10,
    backgroundColor: "#f3f4f6",
    padding: 2,
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
});

interface NoteDocumentProps {
  title: string;
  content: string;
  sketchImage?: string | null;
}

function parseMarkdownToPdfElements(content: string): React.ReactNode[] {
  const lines = content.split("\n");
  const elements: React.ReactNode[] = [];
  let inCodeBlock = false;
  let codeBlockContent = "";
  let listCounter = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Code block toggle
    if (line.trim().startsWith("```")) {
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
          {h1Match[1]}
        </Text>
      );
      continue;
    }

    const h2Match = line.match(/^## (.+)/);
    if (h2Match) {
      elements.push(
        <Text key={`h2-${i}`} style={styles.h2}>
          {h2Match[1]}
        </Text>
      );
      continue;
    }

    const h3Match = line.match(/^###+ (.+)/);
    if (h3Match) {
      elements.push(
        <Text key={`h3-${i}`} style={styles.h3}>
          {h3Match[1]}
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
          <Text>{bqMatch[1]}</Text>
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
          <Text style={styles.listContent}>{formatInlineText(ulMatch[1])}</Text>
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
          <Text style={styles.listContent}>{formatInlineText(olMatch[2])}</Text>
        </View>
      );
      continue;
    }

    // Regular paragraph
    listCounter = 0;
    elements.push(
      <Text key={`p-${i}`} style={styles.paragraph}>
        {formatInlineText(line)}
      </Text>
    );
  }

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

function formatInlineText(text: string): string {
  // Strip markdown inline formatting for PDF (bold, italic, code, links)
  return text
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/__(.+?)__/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/_(.+?)_/g, "$1")
    .replace(/`(.+?)`/g, "$1")
    .replace(/\[(.+?)\]\(.+?\)/g, "$1")
    .replace(/!\[.*?\]\(.+?\)/g, "[image]");
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
