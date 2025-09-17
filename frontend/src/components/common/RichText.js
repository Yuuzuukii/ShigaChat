import React from "react";

/*
 * 軽量リンクレンダラ（外部パッケージなし）
 * - 裸URL: https://example.com
 * - Markdownリンク: [表示名](https://example.com/path)
 * XSS回避: 文字列分割で<a>を生成（dangerouslySetInnerHTML 不使用）
 */
export default function RichText({ content }) {
  const text = content || "";

  // Helper: render plain text with support for <strong>..</strong>,
  // <span class="highlighted">..</span>, and <br/> as actual line breaks.
  const renderHighlightAndBreaks = (seg, keyPrefix = "h") => {
    if (!seg) return [];
    // Normalize span.highlighted to strong
    let s = String(seg)
      .replace(/<span[^>]*class=["']highlighted["'][^>]*>/gi, "<strong>")
      .replace(/<\/span>/gi, "</strong>");
    const nodes = [];
    const brSplit = s.split(/(<br\s*\/?\s*>)/i);
    let globalIndex = 0;
    brSplit.forEach((part) => {
      if (!part) return;
      if (/^<br\s*\/?\s*>$/i.test(part)) {
        nodes.push(<br key={`${keyPrefix}-br-${globalIndex++}`} />);
        return;
      }
      // Split by <strong>...</strong>
      const strongRe = /<strong>([\s\S]*?)<\/strong>/gi;
      let idx = 0;
      let m;
      while ((m = strongRe.exec(part)) !== null) {
        const start = m.index;
        if (start > idx) {
          nodes.push(
            <span key={`${keyPrefix}-t-${globalIndex++}`}>{part.slice(idx, start)}</span>
          );
        }
        nodes.push(
          <span
            key={`${keyPrefix}-s-${globalIndex++}`}
            className="rt-strong"
            style={{ color: "#dc2626", fontWeight: 700 }}
          >
            {m[1]}
          </span>
        );
        idx = start + m[0].length;
      }
      if (idx < part.length) {
        nodes.push(
          <span key={`${keyPrefix}-t-${globalIndex++}`}>{part.slice(idx)}</span>
        );
      }
    });
    return nodes;
  };

  // 1) Markdownリンクを抽出 → {type:'link'|'text', text, url} の配列へ
  const parts = [];
  const mdLinkRe = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;

  let lastIndex = 0;
  let m = null;

  while ((m = mdLinkRe.exec(text)) !== null) {
    const full = m[0];
    const label = m[1];
    const url = m[2];
    const start = m.index;
    if (start > lastIndex) {
      parts.push({ type: "text", text: text.slice(lastIndex, start) });
    }
    parts.push({ type: "link", text: label, url });
    lastIndex = start + full.length;
  }
  if (lastIndex < text.length) {
    parts.push({ type: "text", text: text.slice(lastIndex) });
  }

  // 2) 残りの text 部分に含まれる「裸URL」をリンク化
  const urlRe = /(https?:\/\/[^\s)<>]+)(?![^<]*>)/g;

  const nodes = [];
  parts.forEach((p, i) => {
    if (p.type === "link" && p.url) {
      nodes.push(
        <a
          key={`md-${i}`}
          href={p.url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
        >
          {renderHighlightAndBreaks(p.text, `mdlbl-${i}`)}
        </a>
      );
    } else {
      const seg = p.text;
      let last = 0;
      let mm = null;
      while ((mm = urlRe.exec(seg)) !== null) {
        const url = mm[1];
        const s = mm.index;
        if (s > last)
          nodes.push(
            <span key={`t-${i}-${last}`}>
              {renderHighlightAndBreaks(seg.slice(last, s), `txt-${i}-${last}`)}
            </span>
          );
        nodes.push(
          <a
            key={`u-${i}-${s}`}
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
          >
            {url}
          </a>
        );
        last = s + url.length;
      }
      if (last < seg.length)
        nodes.push(
          <span key={`t-${i}-end`}>
            {renderHighlightAndBreaks(seg.slice(last), `txt-${i}-end`)}
          </span>
        );
    }
  });

  return <span>{nodes}</span>;
}
