import type { ReactNode } from "react";

export function MarkdownPreview({ markdown }: { markdown: string }) {
  const body = markdown.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/u, "");
  const lines = body.split(/\r?\n/u);
  const blocks: ReactNode[] = [];
  let listItems: string[] = [];

  const flushList = () => {
    if (!listItems.length) return;
    blocks.push(
      <ul key={`list-${blocks.length}`}>
        {listItems.map((item, index) => (
          <li key={`${item}-${index}`}>{cleanInline(item)}</li>
        ))}
      </ul>,
    );
    listItems = [];
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      flushList();
      continue;
    }
    const listMatch = line.match(/^[-*]\s+(.+)$/u);
    if (listMatch) {
      listItems.push(listMatch[1]);
      continue;
    }
    flushList();
    const heading = line.match(/^(#{1,3})\s+(.+)$/u);
    if (heading) {
      const text = cleanInline(heading[2]);
      if (heading[1].length === 1) {
        blocks.push(<h1 key={`h1-${blocks.length}`}>{text}</h1>);
      } else if (heading[1].length === 2) {
        blocks.push(<h2 key={`h2-${blocks.length}`}>{text}</h2>);
      } else {
        blocks.push(<h3 key={`h3-${blocks.length}`}>{text}</h3>);
      }
      continue;
    }
    if (line.startsWith("> ")) {
      blocks.push(
        <blockquote key={`quote-${blocks.length}`}>
          {cleanInline(line.slice(2))}
        </blockquote>,
      );
      continue;
    }
    blocks.push(<p key={`p-${blocks.length}`}>{cleanInline(line)}</p>);
  }
  flushList();
  return blocks;
}

function cleanInline(value: string): string {
  return value
    .replace(/!\[([^\]]*)\]\([^)]+\)/gu, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/gu, "$1")
    .replace(/[*_`]/gu, "")
    .trim();
}
