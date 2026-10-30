const SANDBOX_PERMISSIONS = 'allow-scripts allow-modals allow-downloads allow-same-origin';
const MAX_TOOL_HTML_CHARS = 180_000;
const TOOL_POLICY = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline' data:; img-src data: blob:; font-src data:; media-src data: blob:; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'">`;

export function prepareToolHtml(input) {
  let html = String(input || '').trim();
  if (!html || html.length > MAX_TOOL_HTML_CHARS) throw new Error('टूल का HTML खाली है या बहुत बड़ा है।');
  if (!/<html\b/i.test(html)) {
    html = /<head\b/i.test(html)
      ? `<!doctype html><html lang="hi">${html}</html>`
      : `<!doctype html><html lang="hi"><head></head><body>${html}</body></html>`;
  }
  if (!/<head\b/i.test(html)) html = html.replace(/<html\b[^>]*>/i, '$&<head></head>');

  html = html.replace(/<meta\b[^>]*charset\s*=\s*["']?[^\s"'/>]+[^>]*>/i, '');
  html = html.replace(/<meta\b(?=[^>]*\bhttp-equiv\s*=\s*["']?\s*(?:content-security-policy|refresh)\b)[^>]*>/gi, '');
  html = html.replace(/<script\b(?=[^>]*\bsrc\s*=)[^>]*>[\s\S]*?<\/script\s*>/gi, '');
  html = html.replace(/<link\b(?=[^>]*\bhref\s*=\s*["']?https?:)[^>]*>/gi, '');
  html = html.replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe\s*>/gi, '');
  html = html.replace(/<iframe\b[^>]*\/?\s*>/gi, '');
  html = html.replace(/<\/?(?:object|embed)\b[^>]*>/gi, '');
  html = html.replace(/<base\b[^>]*>/gi, '');
  html = html.replace(/\s(?:formaction|action)\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '');
  html = html.replace(/\s(href|src)\s*=\s*(?:"\s*javascript:[^"]*"|'\s*javascript:[^']*'|\s*javascript:[^\s>]+)/gi, ' $1="#"');

  html = html.replace(/<head\b[^>]*>/i, (head) => `${head}<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">${TOOL_POLICY}`);
  if (!/^\s*<!doctype\s+html/i.test(html)) html = `<!doctype html>\n${html}`;
  return html;
}

export function renderTool(iframe, html) {
  const documentText = prepareToolHtml(html);
  iframe.setAttribute('sandbox', SANDBOX_PERMISSIONS);
  iframe.setAttribute('referrerpolicy', 'no-referrer');
  // data: documents have an opaque origin; generated scripts cannot access the studio origin.
  iframe.src = `data:text/html;charset=utf-8,${encodeURIComponent(documentText)}`;
  iframe.hidden = false;
  return documentText;
}

export function downloadStandaloneTool(tool) {
  const documentText = prepareToolHtml(tool.html);
  const blob = new Blob([documentText], { type: 'text/html;charset=utf-8' });
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  const safeName = String(tool.cleanName || tool.name || 'Nischay-Tool')
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60) || 'Nischay-Tool';
  anchor.href = href;
  anchor.download = `Nischay-${safeName}.html`;
  anchor.rel = 'noopener';
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(href), 30_000);
}
