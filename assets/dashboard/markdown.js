/**
 * Escape text that will be inserted into HTML.
 * @param {string} value
 */
export function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Drop schemes other than http(s) and relative paths.
 * @param {string} raw
 */
function safeHref(raw) {
  let href = String(raw || "").trim();
  if (href.startsWith("<") && href.endsWith(">")) href = href.slice(1, -1);
  const titled = href.match(/^(\S+)\s+["']/);
  if (titled) href = titled[1];
  if (/^https?:\/\//i.test(href)) return href;
  if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith("//")) return "";
  return href;
}

/**
 * @param {string} token
 */
function renderToken(token) {
  if (token.startsWith("`")) {
    return `<code>${escapeHtml(token.slice(1, -1))}</code>`;
  }
  if (token.startsWith("**")) {
    return `<strong>${escapeHtml(token.slice(2, -2))}</strong>`;
  }
  if (token.startsWith("*")) {
    return `<em>${escapeHtml(token.slice(1, -1))}</em>`;
  }
  const link = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
  if (!link) return escapeHtml(token);
  const href = safeHref(link[2]);
  const label = escapeHtml(link[1]);
  if (!href) return label;
  const attr = escapeHtml(href);
  if (/^https?:\/\//i.test(href)) {
    return `<a href="${attr}" target="_blank" rel="noopener noreferrer">${label}</a>`;
  }
  return `<a href="${attr}" data-path="${attr}">${label}</a>`;
}

/**
 * @param {string} src
 */
function renderInline(src) {
  const re = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*\n]+\*|\[[^\]]+\]\([^)]+\))/g;
  let out = "";
  let last = 0;
  let match;
  while ((match = re.exec(src))) {
    out += escapeHtml(src.slice(last, match.index));
    out += renderToken(match[1]);
    last = match.index + match[0].length;
  }
  return out + escapeHtml(src.slice(last));
}

/**
 * @param {string} block
 */
function renderBlock(block) {
  const lines = block.split("\n").filter((line) => line.trim().length > 0);
  if (lines.length === 0) return "";
  const heading = lines.length === 1 ? lines[0].match(/^(#{1,6})\s+(.+)$/) : null;
  if (heading) {
    const level = heading[1].length;
    return `<h${level}>${renderInline(heading[2])}</h${level}>`;
  }
  if (lines.every((line) => /^---+$/.test(line.trim()))) return "<hr>";
  if (lines.every((line) => /^[-*]\s+/.test(line))) {
    const items = lines.map((line) => `<li>${renderInline(line.replace(/^[-*]\s+/, ""))}</li>`).join("");
    return `<ul>${items}</ul>`;
  }
  if (lines.every((line) => /^\d+\.\s+/.test(line))) {
    const items = lines.map((line) => `<li>${renderInline(line.replace(/^\d+\.\s+/, ""))}</li>`).join("");
    return `<ol>${items}</ol>`;
  }
  if (lines.every((line) => /^>\s?/.test(line))) {
    const quote = lines.map((line) => line.replace(/^>\s?/, "")).join(" ");
    return `<blockquote>${renderInline(quote)}</blockquote>`;
  }
  return `<p>${lines.map((line) => renderInline(line)).join("<br>")}</p>`;
}

/**
 * @param {string} src
 */
function renderBlocks(src) {
  return src
    .split(/\n{2,}/)
    .map((block) => renderBlock(block))
    .filter(Boolean)
    .join("");
}

/**
 * Render a Mental body as HTML. Raw HTML in the source is escaped.
 * @param {string} src
 */
export function renderMarkdown(src) {
  const text = String(src || "").replace(/\r\n/g, "\n");
  if (!text.trim()) return "";
  const parts = [];
  const fence = /```[^\n]*\n([\s\S]*?)```/g;
  let last = 0;
  let match;
  while ((match = fence.exec(text))) {
    parts.push(renderBlocks(text.slice(last, match.index)));
    parts.push(`<pre class="md-code"><code>${escapeHtml(match[1].replace(/\n$/, ""))}</code></pre>`);
    last = match.index + match[0].length;
  }
  parts.push(renderBlocks(text.slice(last)));
  return parts.join("");
}

/**
 * Frontmatter as a definition list. Values are plain text.
 * @param {Record<string, unknown> | null | undefined} data
 */
export function renderFrontmatter(data) {
  if (!data || typeof data !== "object") return "";
  const rows = Object.entries(data).filter(([, value]) => {
    if (value == null || value === "") return false;
    if (Array.isArray(value) && value.length === 0) return false;
    return true;
  });
  if (rows.length === 0) return "";
  const body = rows
    .map(([key, value]) => {
      const shown = Array.isArray(value)
        ? value.join(", ")
        : typeof value === "object"
          ? JSON.stringify(value)
          : String(value);
      return `<div><dt>${escapeHtml(key)}</dt><dd>${escapeHtml(shown)}</dd></div>`;
    })
    .join("");
  return `<dl class="fm">${body}</dl>`;
}
