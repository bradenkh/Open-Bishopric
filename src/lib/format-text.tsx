import React from "react";

/**
 * Parse a simple markdown subset (**bold**, *italic*, newlines) into React nodes.
 * Safe — no dangerouslySetInnerHTML.
 */
export function formatText(text: string): React.ReactNode {
  if (!text) return null;

  const lines = text.split("\n");
  const result: React.ReactNode[] = [];

  for (let i = 0; i < lines.length; i++) {
    if (i > 0) result.push(<br key={`br-${i}`} />);
    result.push(...parseInline(lines[i], `l${i}`));
  }

  return result;
}

const INLINE_RE = /(\*\*(.+?)\*\*|\*(.+?)\*)/g;

function parseInline(text: string, keyPrefix: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  let lastIndex = 0;
  let k = 0;

  for (const match of text.matchAll(INLINE_RE)) {
    const idx = match.index!;
    if (idx > lastIndex) {
      nodes.push(text.slice(lastIndex, idx));
    }

    if (match[2] !== undefined) {
      nodes.push(<strong key={`${keyPrefix}-${k++}`}>{match[2]}</strong>);
    } else if (match[3] !== undefined) {
      nodes.push(<em key={`${keyPrefix}-${k++}`}>{match[3]}</em>);
    }

    lastIndex = idx + match[0].length;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes;
}
