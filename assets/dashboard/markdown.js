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
 * Headings and lists count even when the source has no blank line before them.
 * @param {string} line
 */
function structural(line) {
  return /^(#{1,6})\s+/.test(line) || /^---+$/.test(line.trim()) || /^[-*]\s+/.test(line) || /^\d+\.\s+/.test(line) || /^>\s?/.test(line);
}

/**
 * @param {string} src
 */
function renderBlocks(src) {
  const lines = src.split("\n");
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i += 1;
      continue;
    }
    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      const level = heading[1].length;
      out.push(`<h${level}>${renderInline(heading[2])}</h${level}>`);
      i += 1;
      continue;
    }
    if (/^---+$/.test(line.trim())) {
      out.push("<hr>");
      i += 1;
      continue;
    }
    if (/^[-*]\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i])) {
        items.push(`<li>${renderInline(lines[i].replace(/^[-*]\s+/, ""))}</li>`);
        i += 1;
      }
      out.push(`<ul>${items.join("")}</ul>`);
      continue;
    }
    if (/^\d+\.\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i])) {
        items.push(`<li>${renderInline(lines[i].replace(/^\d+\.\s+/, ""))}</li>`);
        i += 1;
      }
      out.push(`<ol>${items.join("")}</ol>`);
      continue;
    }
    if (/^>\s?/.test(line)) {
      const quote = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        quote.push(lines[i].replace(/^>\s?/, ""));
        i += 1;
      }
      out.push(`<blockquote>${renderInline(quote.join(" "))}</blockquote>`);
      continue;
    }
    const para = [];
    while (i < lines.length && lines[i].trim() && !structural(lines[i])) {
      para.push(lines[i]);
      i += 1;
    }
    if (para.length) out.push(`<p>${para.map((row) => renderInline(row)).join("<br>")}</p>`);
  }
  return out.join("");
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
