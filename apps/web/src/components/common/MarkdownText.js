import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/*
 * アシスタント回答用 Markdown レンダラ
 * - DBには生のMarkdown文字列を保存し、表示時にレンダリングする（再読込・履歴でも同じ見た目になる）
 * - 生HTMLは描画しない（react-markdown既定）+ javascript: 等のURLは除去されるためXSS安全
 * - 単一改行は表示上も改行として扱う（whitespace-pre-line）
 */
const linkClass =
  "text-blue-600 underline-offset-2 hover:text-blue-800 hover:underline transition-colors";

const components = {
  h1: (p) => <h1 className="mb-3 mt-6 text-xl font-bold text-zinc-900 first:mt-0" {...strip(p)} />,
  h2: (p) => (
    <h2
      className="mb-3 mt-6 border-b border-zinc-200 pb-1 text-lg font-bold text-zinc-900 first:mt-0"
      {...strip(p)}
    />
  ),
  h3: (p) => <h3 className="mb-2 mt-5 text-base font-bold text-zinc-900 first:mt-0" {...strip(p)} />,
  h4: (p) => <h4 className="mb-2 mt-4 text-sm font-bold text-zinc-900 first:mt-0" {...strip(p)} />,
  h5: (p) => <h5 className="mb-2 mt-4 text-sm font-semibold text-zinc-900 first:mt-0" {...strip(p)} />,
  h6: (p) => <h6 className="mb-2 mt-4 text-sm font-semibold text-zinc-700 first:mt-0" {...strip(p)} />,
  p: (p) => <p className="my-3 whitespace-pre-line first:mt-0 last:mb-0" {...strip(p)} />,
  strong: (p) => <strong className="font-bold text-zinc-900" {...strip(p)} />,
  em: (p) => <em className="italic" {...strip(p)} />,
  del: (p) => <del className="text-zinc-500" {...strip(p)} />,
  a: ({ node: _node, ...rest }) => (
    <a
      {...rest}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      className={linkClass}
    />
  ),
  ul: (p) => <ul className="my-3 list-disc space-y-1 pl-6 marker:text-zinc-400" {...strip(p)} />,
  ol: (p) => <ol className="my-3 list-decimal space-y-1 pl-6 marker:text-zinc-500" {...strip(p)} />,
  li: (p) => <li className="pl-1 [&>ol]:my-1 [&>p]:my-1 [&>ul]:my-1" {...strip(p)} />,
  blockquote: (p) => (
    <blockquote
      className="my-3 border-l-4 border-blue-200 bg-blue-50/40 py-1 pl-4 text-zinc-700"
      {...strip(p)}
    />
  ),
  hr: () => <hr className="my-5 border-zinc-200" />,
  pre: (p) => (
    <pre
      className="my-3 overflow-x-auto rounded-lg bg-zinc-900 p-3 text-xs leading-relaxed text-zinc-100 [&_code]:bg-transparent [&_code]:p-0 [&_code]:text-inherit"
      {...strip(p)}
    />
  ),
  code: (p) => (
    <code
      className="rounded bg-zinc-100 px-1 py-0.5 font-mono text-[0.85em] text-zinc-800"
      {...strip(p)}
    />
  ),
  table: (p) => (
    <div className="my-3 overflow-x-auto">
      <table className="min-w-full border-collapse text-sm" {...strip(p)} />
    </div>
  ),
  thead: (p) => <thead className="bg-zinc-100" {...strip(p)} />,
  th: (p) => (
    <th
      className="border border-zinc-200 px-3 py-2 text-left font-semibold text-zinc-800"
      {...strip(p)}
    />
  ),
  td: (p) => <td className="border border-zinc-200 px-3 py-2 align-top" {...strip(p)} />,
};

// react-markdown が渡す `node` を DOM に流さない
function strip({ node: _node, ...rest }) {
  return rest;
}

export default function MarkdownText({ content }) {
  return (
    <div className="text-sm leading-relaxed [overflow-wrap:anywhere]">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {content || ""}
      </ReactMarkdown>
    </div>
  );
}
