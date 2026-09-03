/**
 * The privacy policy's renderer.
 *
 * A unit test, not an integration one: it needs no database, and the property
 * worth pinning down is about the HTML this produces rather than about serving
 * it.
 *
 * The renderer is hand-written because a Markdown dependency for one static
 * document is a poor trade. The cost of that choice is that its escaping and
 * its link handling are ours to get right, so they are tested — including for
 * input the document does not currently contain, because "safe for the input
 * we happen to have" stops being true the moment someone pastes a link in.
 */
import { describe, expect, it } from 'vitest';
import { renderMarkdown } from '../src/routes/legal';

describe('renderMarkdown links', () => {
  it('renders an https link', () => {
    expect(renderMarkdown('[Brevo](https://www.brevo.com/legal/)')).toContain(
      '<a href="https://www.brevo.com/legal/" rel="noopener noreferrer">Brevo</a>',
    );
  });

  it('renders a mailto link, so the contact address is one tap', () => {
    const html = renderMarkdown('[me@example.com](mailto:me@example.com)');
    expect(html).toContain('<a href="mailto:me@example.com"');
    expect(html).toContain('>me@example.com</a>');
  });

  it('refuses a javascript: href, keeping only the label', () => {
    // The allowlist's reason for existing. An unknown scheme must degrade to
    // text rather than become a live href.
    const html = renderMarkdown('[click me](javascript:alert(1))');
    expect(html).not.toContain('<a');
    expect(html).not.toContain('javascript:');
    expect(html).toContain('click me');
  });

  it('refuses a data: href', () => {
    const html = renderMarkdown('[x](data:text/html;base64,PHNjcmlwdD4=)');
    expect(html).not.toContain('<a');
    expect(html).not.toContain('data:');
  });

  it('refuses a protocol-relative href', () => {
    // `//evil.example` inherits the page's scheme and is a real link. It is
    // not on the allowlist, so it must not become one.
    const html = renderMarkdown('[x](//evil.example)');
    expect(html).not.toContain('<a');
  });
});

describe('renderMarkdown escaping', () => {
  it('escapes markup before doing anything else', () => {
    const html = renderMarkdown('A <script>alert(1)</script> line');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('escapes a quote so it cannot break out of an attribute', () => {
    expect(renderMarkdown('say "hello"')).toContain('&quot;hello&quot;');
  });

  it('escapes an ampersand exactly once', () => {
    // Escaping & after < would double-encode into &amp;lt;.
    expect(renderMarkdown('Tom & Jerry')).toContain('Tom &amp; Jerry');
    expect(renderMarkdown('a < b')).toContain('a &lt; b');
    expect(renderMarkdown('a < b')).not.toContain('&amp;lt;');
  });
});

describe('renderMarkdown structure', () => {
  it('renders headings at their level', () => {
    expect(renderMarkdown('## Section')).toBe('<h2>Section</h2>');
    expect(renderMarkdown('#### Deep')).toBe('<h4>Deep</h4>');
  });

  it('joins a paragraph before formatting it', () => {
    // The bug this exists for: a bold span wrapping across two source lines
    // put its markers in different calls, and the asterisks reached the page.
    const html = renderMarkdown('This is **a bold\nspan** across lines.');
    expect(html).toContain('<strong>a bold span</strong>');
    expect(html).not.toContain('**');
  });

  it('renders a list, and closes it', () => {
    const html = renderMarkdown('- one\n- two\n\nafter');
    expect(html).toContain('<ul>\n<li>one</li>\n<li>two</li>\n</ul>');
    expect(html).toContain('<p>after</p>');
  });

  it('renders a table and drops the separator row', () => {
    const html = renderMarkdown('| A | B |\n| --- | --- |\n| 1 | 2 |');
    expect(html).toContain('<table><tbody>');
    expect(html).toContain('<td>A</td><td>B</td>');
    expect(html).toContain('<td>1</td><td>2</td>');
    expect(html).not.toContain('---');
  });

  it('renders a blockquote as one block', () => {
    const html = renderMarkdown('> first line\n> second line');
    expect(html).toBe('<blockquote>first line second line</blockquote>');
  });

  it('renders code spans and horizontal rules', () => {
    expect(renderMarkdown('use `argon2id` here')).toContain('<code>argon2id</code>');
    expect(renderMarkdown('---')).toBe('<hr>');
  });

  it('produces nothing for nothing', () => {
    expect(renderMarkdown('')).toBe('');
    expect(renderMarkdown('\n\n\n')).toBe('');
  });
});
