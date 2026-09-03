/**
 * The public privacy policy.
 *
 * Served by the API rather than hosted elsewhere for three reasons: it needs a
 * stable public URL that outlives any hosting choice, an app store listing will
 * demand one, and a policy that lives with the code is one that gets updated in
 * the same pull request as the behaviour it describes.
 *
 * `docs/privacy-policy.md` is the source of truth. It is read at boot and
 * rendered to HTML here — so there is exactly one copy, and it cannot drift out
 * of step with the version in the repository.
 *
 * Deliberately **unauthenticated**: a privacy policy nobody can read without an
 * account is not a privacy policy.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance } from 'fastify';

/**
 * Locating the file works from both `src/` under tsx and `dist/` after tsup,
 * which flattens the tree. Trying each candidate is simpler than threading a
 * build-time constant through, and the failure is caught at boot rather than on
 * the first request.
 */
function loadPolicy(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    // Bundled: tsup inlines this file into dist/index.js and the build copies
    // the document to dist/docs, so this is the one that matters in production.
    path.resolve(here, 'docs/privacy-policy.md'),
    // Running from source under tsx, where this file is at src/routes.
    path.resolve(here, '../../../../docs/privacy-policy.md'),
    // Whole repo present, whatever the working directory.
    path.resolve(process.cwd(), 'docs/privacy-policy.md'),
    path.resolve(process.cwd(), '../../docs/privacy-policy.md'),
  ];

  for (const candidate of candidates) {
    try {
      return readFileSync(candidate, 'utf8');
    } catch {
      // Try the next one.
    }
  }
  throw new Error('privacy-policy.md not found; checked: ' + candidates.join(', '));
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * A deliberately small Markdown subset: headings, tables, lists, blockquotes,
 * links, bold, code.
 *
 * A parser dependency for one static document would be a poor trade, and the
 * input is a file in this repository rather than anything a user supplies.
 * Everything is escaped first regardless, so a future editor cannot introduce
 * markup by accident.
 */
export function renderMarkdown(source: string): string {
  const inline = (text: string): string =>
    escapeHtml(text)
      /*
       * Links, against a scheme ALLOWLIST rather than a blocklist. Anything
       * not matched renders as its label alone, so an unexpected scheme
       * degrades to plain text instead of becoming a live `javascript:` or
       * `data:` href. This document is written by us, but a renderer that is
       * only safe for trusted input is one copy-paste away from not being.
       *
       * `mailto:` is on the list so the contact address is one tap. It cannot
       * execute anything — it hands the address to the mail client.
       */
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label: string, href: string) =>
        /^(https?:\/\/|mailto:)/.test(href)
          ? `<a href="${href}" rel="noopener noreferrer">${label}</a>`
          : label,
      )
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/`([^`]+)`/g, '<code>$1</code>');

  const out: string[] = [];
  let inList = false;
  let inTable = false;
  let quoted: string[] = [];
  /**
   * Consecutive prose lines, buffered until the paragraph ends.
   *
   * Rendering line by line looked fine until a `**bold span**` wrapped across
   * two source lines: the opening and closing markers landed in different
   * calls and neither matched, so the asterisks appeared on the page. Joining
   * the paragraph first is both the fix and what Markdown actually specifies.
   */
  let paragraph: string[] = [];

  const closeList = () => {
    if (inList) {
      out.push('</ul>');
      inList = false;
    }
  };
  const closeTable = () => {
    if (inTable) {
      out.push('</tbody></table>');
      inTable = false;
    }
  };
  const closeQuote = () => {
    if (quoted.length > 0) {
      // Joined before `inline`, so a bold span may wrap across source lines.
      out.push(`<blockquote>${inline(quoted.join(' '))}</blockquote>`);
      quoted = [];
    }
  };
  const closeParagraph = () => {
    if (paragraph.length > 0) {
      out.push(`<p>${inline(paragraph.join(' '))}</p>`);
      paragraph = [];
    }
  };

  for (const raw of source.split('\n')) {
    const line = raw.trimEnd();

    if (line.startsWith('> ')) {
      closeParagraph();
      closeList();
      closeTable();
      quoted.push(line.slice(2));
      continue;
    }
    closeQuote();

    if (line.trim() === '') {
      closeParagraph();
      closeList();
      closeTable();
      continue;
    }
    if (line.startsWith('---')) {
      closeParagraph();
      closeList();
      closeTable();
      out.push('<hr>');
      continue;
    }

    const heading = /^(#{1,4})\s+(.*)$/.exec(line);
    if (heading) {
      closeParagraph();
      closeList();
      closeTable();
      const level = heading[1]?.length ?? 1;
      out.push(`<h${level}>${inline(heading[2] ?? '')}</h${level}>`);
      continue;
    }

    if (line.startsWith('|')) {
      const cells = line
        .split('|')
        .slice(1, -1)
        .map((cell) => cell.trim());
      // The |---|---| separator row carries no content.
      if (cells.every((cell) => /^:?-{2,}:?$/.test(cell))) continue;

      if (!inTable) {
        closeParagraph();
        closeList();
        inTable = true;
        out.push('<table><tbody>');
      }
      out.push(`<tr>${cells.map((cell) => `<td>${inline(cell)}</td>`).join('')}</tr>`);
      continue;
    }
    closeTable();

    if (line.startsWith('- ')) {
      closeParagraph();
      if (!inList) {
        out.push('<ul>');
        inList = true;
      }
      out.push(`<li>${inline(line.slice(2))}</li>`);
      continue;
    }
    closeList();

    paragraph.push(line);
  }

  closeParagraph();
  closeList();
  closeTable();
  closeQuote();
  return out.join('\n');
}

/** Ascension's own palette, so the page looks like the app rather than a default. */
const STYLE = `
:root { color-scheme: dark light; }
* { box-sizing: border-box; }
body {
  margin: 0; padding: 40px 20px 80px;
  background: #050D1F; color: #DCECFF;
  font: 16px/1.65 system-ui, -apple-system, 'Segoe UI', sans-serif;
}
main { max-width: 720px; margin: 0 auto; }
h1 { font-size: 30px; letter-spacing: 4px; margin: 0 0 4px; }
h2 { font-size: 20px; margin: 40px 0 12px; color: #FFFFFF; }
h3 { font-size: 16px; margin: 28px 0 8px; color: #8CC8FF; }
p, li { color: #C2D6F0; }
a { color: #8CC8FF; }
strong { color: #FFFFFF; }
code {
  background: #122745; padding: 2px 6px; border-radius: 3px;
  font: 13px/1.4 ui-monospace, monospace; color: #DCECFF;
}
hr { border: none; border-top: 1px solid #16294A; margin: 36px 0; }
blockquote {
  margin: 24px 0; padding: 14px 18px;
  background: #0A1830; border-left: 3px solid #8CC8FF; border-radius: 3px;
  color: #C2D6F0;
}
table { width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 15px; }
td { padding: 9px 12px; border-bottom: 1px solid #16294A; vertical-align: top; }
tr td:first-child { color: #FFFFFF; width: 34%; }
.tagline { color: #6E88AD; letter-spacing: 2px; font-size: 12px; margin: 0 0 32px; }
@media (max-width: 560px) {
  table, tbody, tr, td { display: block; width: 100% !important; }
  td { border: none; padding: 2px 0; }
  tr { border-bottom: 1px solid #16294A; padding: 10px 0; display: block; }
}
`;

export async function legalRoutes(app: FastifyInstance): Promise<void> {
  // Read once at boot. A failure here stops the process, which is correct: a
  // deployment that cannot serve its privacy policy is misconfigured.
  const body = renderMarkdown(loadPolicy());

  const page = `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Privacy Policy — Ascension</title>
<style>${STYLE}</style>
</head><body><main>
<p class="tagline">ASCENSION · TRAIN. RANK. REPEAT.</p>
${body}
</main></body></html>`;

  app.get('/privacy', async (_request, reply) => {
    // An hour: long enough to be cheap, short enough that a correction reaches
    // readers the same day.
    return reply
      .header('content-type', 'text/html; charset=utf-8')
      .header('cache-control', 'public, max-age=3600')
      .send(page);
  });

  /** The same document as Markdown, for anyone who would rather read the source. */
  app.get('/privacy.md', async (_request, reply) =>
    reply
      .header('content-type', 'text/markdown; charset=utf-8')
      .header('cache-control', 'public, max-age=3600')
      .send(loadPolicy()),
  );
}
