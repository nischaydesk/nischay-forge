const SANDBOX_PERMISSIONS = 'allow-scripts allow-modals allow-downloads allow-forms';
const MAX_TOOL_HTML_CHARS = 350_000;

// सुरक्षित लेकिन लचीली CSP ताकि AI टूल्स (फॉन्ट, स्टाइल, आइकन्स) बिना टूटे काम करें
const TOOL_POLICY = `<meta http-equiv="Content-Security-Policy" content="default-src 'self' 'unsafe-inline' data: blob:; script-src 'unsafe-inline' 'unsafe-eval' data: blob:; style-src 'unsafe-inline' https://fonts.googleapis.com data:; font-src https://fonts.gstatic.com data:; img-src * data: blob:; media-src * data: blob:;">`;

export function prepareToolHtml(input) {
  let html = String(input || '').trim();
  if (!html || html.length > MAX_TOOL_HTML_CHARS) {
    throw new Error('टूल का कोड खाली है या सीमा से अधिक बड़ा है।');
  }

  // अगर पूरा HTML स्ट्रक्चर नहीं है तो जोड़ें
  if (!/<html\b/i.test(html)) {
    html = /<head\b/i.test(html)
      ? `<!doctype html><html lang="hi">${html}</html>`
      : `<!doctype html><html lang="hi"><head></head><body>${html}</body></html>`;
  }
  if (!/<head\b/i.test(html)) {
    html = html.replace(/<html\b[^>]*>/i, '$&<head></head>');
  }

  // पुरानी या खतरनाक मेटा/टैग्स साफ़ करें
  html = html.replace(/<meta\b[^>]*charset\s*=\s*["']?[^\s"'/>]+[^>]*>/i, '');
  html = html.replace(/<meta\b(?=[^>]*\bhttp-equiv\s*=\s*["']?\s*(?:content-security-policy|refresh)\b)[^>]*>/gi, '');
  html = html.replace(/<\/?(?:object|embed|applet)\b[^>]*>/gi, '');
  html = html.replace(/<base\b[^>]*>/gi, '');

  // UTF-8, मोबाइल व्यूपोर्ट और सेफ पॉलिसी जोड़ें
  const metaInject = `<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">${TOOL_POLICY}`;
  html = html.replace(/<head\b[^>]*>/i, (head) => `${head}${metaInject}`);

  if (!/^\s*<!doctype\s+html/i.test(html)) {
    html = `<!doctype html>\n${html}`;
  }

  return html;
}

export function renderTool(iframe, html) {
  if (!iframe) return '';
  const documentText = prepareToolHtml(html);

  iframe.setAttribute('sandbox', SANDBOX_PERMISSIONS);
  iframe.setAttribute('referrerpolicy', 'no-referrer');

  // srcdoc आधुनिक ब्राउज़रों में सबसे तेज़ और सुरक्षित काम करता है
  if ('srcdoc' in iframe) {
    iframe.srcdoc = documentText;
  } else {
    // पुराने या फॉलबैक डिवाइसेस के लिए Blob URL
    try {
      const blob = new Blob([documentText], { type: 'text/html;charset=utf-8' });
      iframe.src = URL.createObjectURL(blob);
    } catch (e) {
      iframe.src = `data:text/html;charset=utf-8,${encodeURIComponent(documentText)}`;
    }
  }

  iframe.hidden = false;
  return documentText;
}

export function downloadStandaloneTool(tool) {
  const documentText = prepareToolHtml(tool.html);
  const blob = new Blob([documentText], { type: 'text/html;charset=utf-8' });
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement('a');

  const rawName = tool.cleanName || tool.name || 'Nischay-Tool';
  const safeName = String(rawName)
    .trim()
    .replace(/[^\w\u0900-\u097F-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50) || 'Tool';

  anchor.href = href;
  anchor.download = `Nischay-${safeName}.html`;
  anchor.rel = 'noopener';
  document.body.append(anchor);
  anchor.click();
  anchor.remove();

  setTimeout(() => URL.revokeObjectURL(href), 40_000);
}
