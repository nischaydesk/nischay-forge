import { generateFromPrompt } from './ai-engine.js';
import { downloadStandaloneTool, renderTool } from './sandbox.js';
import { initVoice } from './voice.js';

const $ = (selector, root = document) => root.querySelector(selector);
const STORAGE_KEY = 'nischay-forge-tools-v1';
const RUN_KEY = 'nischay-forge-run-once';
const MAX_TERMINAL_CHARS = 3_200;
let activeTool = null;
let busy = false;
let toastTimer = null;
let installPrompt = null;

function readTools() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.filter((tool) => tool && typeof tool.id === 'string' && typeof tool.html === 'string') : [];
  } catch {
    return [];
  }
}

function writeTools(tools) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tools));
    return true;
  } catch {
    return false;
  }
}

function makeId() {
  return globalThis.crypto?.randomUUID?.() || `tool-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function showToast(message) {
  const toast = $('#toast');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('is-visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('is-visible'), 3_000);
}

function updatePromptCount() {
  const input = $('#promptInput');
  const count = $('#promptCount');
  if (input && count) count.textContent = `${input.value.length} / 4000`;
}

function flyPrompt(text, source) {
  const layer = $('#flyingLayer');
  if (!layer || !source || !text) return;
  const tag = document.createElement('span');
  tag.className = 'flying-tag';
  tag.textContent = text;
  layer.append(tag);
  const sourceRect = source.getBoundingClientRect();
  const tagRect = tag.getBoundingClientRect();
  const startX = Math.max(8, sourceRect.left + Math.min(sourceRect.width / 2, 130) - tagRect.width / 2);
  const startY = Math.max(8, sourceRect.top - Math.min(12, tagRect.height));
  tag.style.left = `${startX}px`;
  tag.style.top = `${startY}px`;
  const dx = Math.max(0, window.innerWidth - tagRect.width - 18 - startX);
  const dy = 76 - startY;
  const animation = tag.animate([
    { opacity: 0, transform: 'translate(0, 14px) scale(.92)' },
    { opacity: 1, offset: .18, transform: 'translate(0, 0) scale(1)' },
    { opacity: 1, transform: `translate(${dx}px, ${dy}px) scale(.88)` },
  ], { duration: 980, easing: 'cubic-bezier(.2,.72,.2,1)' });
  animation.onfinish = () => tag.remove();
}

function setBusy(value) {
  busy = value;
  const button = $('#generateBtn');
  const preview = $('#previewCard');
  if (button) {
    button.disabled = value;
    button.setAttribute('aria-busy', String(value));
    const label = $('span:first-child', button);
    if (label) label.textContent = value ? 'बन रहा है…' : 'बनाइए';
  }
  preview?.classList.toggle('is-generating', value);
  const previewStatus = $('#previewStatus');
  if (previewStatus && value) previewStatus.textContent = 'आपका टूल आकार ले रहा है…';
  const terminalStatus = $('#terminalStatus');
  if (terminalStatus && value) terminalStatus.innerHTML = '<i></i> FORGING';
  const progress = $('#terminalProgress');
  if (progress && value) progress.textContent = 'BUILDING YOUR IDEA';
}

function cleanName(value) {
  const words = String(value || 'Quick Utility')
    .replace(/[^a-zA-Z0-9\s-]/g, ' ')
    .split(/[\s-]+/)
    .filter(Boolean)
    .slice(0, 3);
  if (words.length === 0) words.push('Quick', 'Utility');
  if (words.length === 1) words.push('Tool');
  return words.map((word) => word[0].toUpperCase() + word.slice(1).toLowerCase()).join(' ');
}

function updateSavedButton() {
  const button = $('#saveToolBtn');
  if (!button || !activeTool) return;
  const isSaved = readTools().some((tool) => tool.id === activeTool.id);
  button.classList.toggle('is-saved', isSaved);
  button.textContent = isSaved ? '♥' : '♡';
  button.setAttribute('aria-label', isSaved ? 'लाइब्रेरी से हटाएँ' : 'लाइब्रेरी में सेव करें');
  button.title = isSaved ? 'लाइब्रेरी से हटाएँ' : 'लाइब्रेरी में सेव करें';
}

function updateLibraryCounts() {
  const total = readTools().length;
  const badge = $('#libraryCount');
  if (badge) badge.textContent = String(total);
  const count = $('#libraryTotal');
  if (count) count.textContent = String(total).padStart(2, '0');
  const subtitle = $('#librarySubtitle');
  if (subtitle) subtitle.textContent = total ? `${total} सेव ${total === 1 ? 'टूल' : 'टूल्स'} — इसी डिवाइस पर` : 'यहाँ आपकी अगली उपयोगी चीज़ का इंतज़ार है।';
}

function showToolHeader(tool) {
  const title = $('#toolTitle');
  if (title) title.textContent = tool.name;
  const eyebrow = $('#toolEyebrow');
  if (eyebrow) eyebrow.textContent = 'GENERATED TOOL';
  const actions = $('#toolActions');
  if (actions) actions.hidden = false;
  const placeholder = $('#previewPlaceholder');
  if (placeholder) placeholder.hidden = true;
  const status = $('#previewStatus');
  if (status) status.textContent = 'आपका टूल तैयार है';
  const dot = $('#previewDot');
  if (dot) dot.classList.add('is-ready');
  const download = $('#downloadStandaloneBtn');
  if (download) download.disabled = false;
  updateSavedButton();
}

function resetToolPreviewForChat() {
  activeTool = null;
  const frame = $('#toolFrame');
  if (frame) {
    frame.removeAttribute('src');
    frame.hidden = true;
  }
  const placeholder = $('#previewPlaceholder');
  if (placeholder) placeholder.hidden = false;
  const title = $('#toolTitle');
  if (title) title.textContent = 'Nischay Forge Studio';
  const eyebrow = $('#toolEyebrow');
  if (eyebrow) eyebrow.textContent = 'YOUR NEXT TOOL';
  const actions = $('#toolActions');
  if (actions) actions.hidden = true;
  const download = $('#downloadStandaloneBtn');
  if (download) download.disabled = true;
  const previewStatus = $('#previewStatus');
  if (previewStatus) previewStatus.textContent = 'आपका कैनवस तैयार है';
  const terminalStatus = $('#terminalStatus');
  if (terminalStatus) terminalStatus.innerHTML = '<i></i> IDLE';
  const progress = $('#terminalProgress');
  if (progress) progress.textContent = 'CHAT — NO TOOL RENDERED';
  const output = $('#codeOutput');
  if (output) output.textContent = '// सामान्य बातचीत — कोई टूल रेंडर नहीं किया गया।';
}

function showChatMessage(message) {
  resetToolPreviewForChat();
  const card = $('#chatResponse');
  const text = $('#chatMessage');
  if (text) text.textContent = message;
  if (card) card.hidden = false;
}

function typeCode(html) {
  const output = $('#codeOutput');
  const terminal = $('#terminalCard');
  if (!output) return Promise.resolve();
  const clipped = html.length > MAX_TERMINAL_CHARS ? `${html.slice(0, MAX_TERMINAL_CHARS)}\n\n// … पूरा tool तैयार है; live preview में चल रहा है।` : html;
  output.textContent = '';
  terminal?.classList.add('is-writing');
  const progress = $('#terminalProgress');
  if (progress) progress.textContent = 'COMPILING / HTML + CSS + JS';
  return new Promise((resolve) => {
    let position = 0;
    const tick = () => {
      position = Math.min(clipped.length, position + 42);
      output.textContent = clipped.slice(0, position);
      if (position < clipped.length) {
        requestAnimationFrame(tick);
        return;
      }
      const cursor = document.createElement('span');
      cursor.className = 'terminal-cursor';
      cursor.textContent = '▋';
      output.append(cursor);
      terminal?.classList.remove('is-writing');
      const terminalStatus = $('#terminalStatus');
      if (terminalStatus) terminalStatus.innerHTML = '<i></i> READY';
      if (progress) progress.textContent = 'TOOL LIVE';
      resolve();
    };
    requestAnimationFrame(tick);
  });
}

function activateTool(tool, { animate = true } = {}) {
  activeTool = {
    id: tool.id || makeId(),
    cleanName: cleanName(tool.cleanName || tool.name?.replace(/^Nischay\s+/i, '')),
    name: `Nischay ${cleanName(tool.cleanName || tool.name?.replace(/^Nischay\s+/i, ''))}`,
    html: tool.html,
    prompt: tool.prompt || '',
    createdAt: tool.createdAt || Date.now(),
  };
  const chat = $('#chatResponse');
  if (chat) chat.hidden = true;
  showToolHeader(activeTool);
  const terminalStatus = $('#terminalStatus');
  if (terminalStatus) terminalStatus.innerHTML = '<i></i> FORGING';
  const previewStatus = $('#previewStatus');
  if (previewStatus) previewStatus.textContent = 'कोड बन रहा है…';
  const afterTyping = () => {
    const frame = $('#toolFrame');
    if (frame) {
      try {
        renderTool(frame, activeTool.html);
        frame.hidden = false;
        const placeholder = $('#previewPlaceholder');
        if (placeholder) placeholder.hidden = true;
      } catch {
        showToast('टूल को सुरक्षित रूप से लोड नहीं किया जा सका।');
        return;
      }
    }
    const terminal = $('#terminalCard');
    terminal?.classList.remove('is-writing');
    if (terminalStatus) terminalStatus.innerHTML = '<i></i> LIVE';
    if (previewStatus) previewStatus.textContent = 'टूल तैयार है — sandbox में चल रहा है';
    const progress = $('#terminalProgress');
    if (progress) progress.textContent = 'PREVIEW IS LIVE';
    updateSavedButton();
    updateLibraryCounts();
  };
  if (animate) typeCode(activeTool.html).then(afterTyping);
  else {
    const output = $('#codeOutput');
    if (output) output.textContent = `${activeTool.html.slice(0, MAX_TERMINAL_CHARS)}\n// सेव किया हुआ टूल लॉन्च किया गया।`;
    afterTyping();
  }
}

function setupStudio() {
  const form = $('#promptForm');
  const input = $('#promptInput');
  const downloadButton = $('#downloadStandaloneBtn');
  const saveButton = $('#saveToolBtn');
  const frameDownloadButton = $('#downloadToolBtn');
  if (!form || !input) return;

  input.addEventListener('input', updatePromptCount);
  updatePromptCount();
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (busy) return;
    const prompt = input.value.trim();
    if (!prompt) {
      input.focus();
      showToast('पहले अपना आइडिया लिखें या माइक से बोलें।');
      return;
    }
    flyPrompt(prompt, input);
    const chat = $('#chatResponse');
    if (chat) chat.hidden = true;
    setBusy(true);
    try {
      const result = await generateFromPrompt(prompt);
      if (result.intent === 'chat') {
        showChatMessage(result.message || 'नमस्ते भाई! मैं आपका Nischay Forge टूल मेकर हूँ, बताइए आज कौन सा टूल बनाऊँ?');
        return;
      }
      const tool = {
        id: makeId(),
        cleanName: cleanName(result.cleanName),
        html: result.html,
        prompt,
        createdAt: Date.now(),
      };
      activateTool(tool, { animate: true });
      showToast(`${cleanName(result.cleanName)} तैयार हो रहा है…`);
    } catch (error) {
      showChatMessage(error?.message || 'अभी अनुरोध पूरा नहीं हो पाया। कृपया फिर कोशिश करें।');
    } finally {
      setBusy(false);
      const progress = $('#terminalProgress');
      if (progress && !activeTool) progress.textContent = 'CHAT — NO TOOL RENDERED';
    }
  });

  document.querySelectorAll('.prompt-chip').forEach((button) => button.addEventListener('click', () => {
    input.value = button.dataset.prompt || '';
    updatePromptCount();
    input.focus();
  }));

  $('#saveToolBtn')?.addEventListener('click', () => {
    if (!activeTool) return;
    const tools = readTools();
    const exists = tools.some((tool) => tool.id === activeTool.id);
    const next = exists ? tools.filter((tool) => tool.id !== activeTool.id) : [{ ...activeTool, savedAt: Date.now() }, ...tools];
    if (!writeTools(next)) {
      showToast('ब्राउज़र में जगह कम है। कुछ पुराने टूल हटाकर फिर कोशिश करें।');
      return;
    }
    updateSavedButton();
    updateLibraryCounts();
    showToast(exists ? 'टूल लाइब्रेरी से हटा दिया गया।' : 'टूल इसी डिवाइस की लाइब्रेरी में सेव हो गया।');
  });

  const download = () => {
    if (!activeTool) return;
    try {
      downloadStandaloneTool(activeTool);
      showToast('Standalone UTF-8 HTML डाउनलोड शुरू हुआ।');
    } catch {
      showToast('फ़ाइल डाउनलोड नहीं हो पाई। फिर कोशिश करें।');
    }
  };
  downloadButton?.addEventListener('click', download);
  frameDownloadButton?.addEventListener('click', download);

  const voice = initVoice({
    onTranscript: (text) => {
      input.value = text;
      updatePromptCount();
      setTimeout(() => {
        if (!busy && input.value.trim()) form.requestSubmit();
      }, 320);
    },
  });
  window.nischayVoice = voice;

  try {
    const queued = sessionStorage.getItem(RUN_KEY);
    if (queued) {
      sessionStorage.removeItem(RUN_KEY);
      const parsed = JSON.parse(queued);
      if (parsed && typeof parsed.html === 'string') activateTool(parsed, { animate: false });
    }
  } catch {
    sessionStorage.removeItem(RUN_KEY);
  }
}

function formatDate(value) {
  const date = new Date(value || Date.now());
  if (Number.isNaN(date.getTime())) return 'SAVED ON THIS DEVICE';
  return new Intl.DateTimeFormat('hi-IN', { day: 'numeric', month: 'short', year: 'numeric' }).format(date);
}

function createLibraryCard(tool) {
  const card = document.createElement('article');
  card.className = 'tool-card';
  card.dataset.id = tool.id;
  const top = document.createElement('div');
  top.className = 'tool-card-top';
  const icon = document.createElement('span');
  icon.className = 'tool-card-icon';
  icon.textContent = '✳';
  const remove = document.createElement('button');
  remove.className = 'icon-button tool-card-delete';
  remove.type = 'button';
  remove.dataset.action = 'delete';
  remove.setAttribute('aria-label', `${tool.name || 'टूल'} हटाएँ`);
  remove.title = 'हटाएँ';
  remove.textContent = '×';
  top.append(icon, remove);
  const title = document.createElement('h2');
  title.textContent = tool.name || `Nischay ${cleanName(tool.cleanName)}`;
  const description = document.createElement('p');
  description.textContent = tool.prompt || 'आपका सेव किया हुआ standalone tool.';
  const meta = document.createElement('div');
  meta.className = 'tool-card-meta';
  const date = document.createElement('span');
  date.textContent = formatDate(tool.savedAt || tool.createdAt);
  const local = document.createElement('span');
  local.textContent = 'LOCAL / UTF-8';
  meta.append(date, local);
  const actions = document.createElement('div');
  actions.className = 'tool-card-actions';
  const run = document.createElement('button');
  run.type = 'button';
  run.dataset.action = 'run';
  run.textContent = 'टूल चलाएं ↗';
  const removeText = document.createElement('button');
  removeText.type = 'button';
  removeText.dataset.action = 'delete';
  removeText.textContent = 'हटाएँ';
  actions.append(run, removeText);
  card.append(top, title, description, meta, actions);
  return card;
}

function setupLibrary() {
  const grid = $('#libraryGrid');
  if (!grid) return;
  const empty = $('#libraryEmpty');
  const render = () => {
    const tools = readTools();
    updateLibraryCounts();
    grid.replaceChildren(...tools.map(createLibraryCard));
    grid.hidden = tools.length === 0;
    if (empty) empty.hidden = tools.length !== 0;
  };
  grid.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-action]');
    const card = event.target.closest('.tool-card');
    if (!button || !card) return;
    const tools = readTools();
    const tool = tools.find((item) => item.id === card.dataset.id);
    if (!tool) return render();
    if (button.dataset.action === 'delete') {
      if (!writeTools(tools.filter((item) => item.id !== tool.id))) {
        showToast('टूल हटाया नहीं जा सका।');
        return;
      }
      showToast('टूल लाइब्रेरी से हटा दिया गया।');
      render();
    } else if (button.dataset.action === 'run') {
      try {
        sessionStorage.setItem(RUN_KEY, JSON.stringify(tool));
        window.location.assign('/');
      } catch {
        showToast('यह टूल launch नहीं हो पाया। फिर कोशिश करें।');
      }
    }
  });
  render();
}

function setupDrawer() {
  const drawer = $('#siteDrawer');
  const backdrop = $('#drawerBackdrop');
  if (!drawer) return;
  const toggles = document.querySelectorAll('.drawer-toggle');
  const closeButtons = document.querySelectorAll('.drawer-close');
  const setOpen = (open) => {
    document.body.classList.toggle('drawer-open', open);
    drawer.setAttribute('aria-hidden', String(!open));
    toggles.forEach((button) => button.setAttribute('aria-expanded', String(open)));
    if (open) $('.drawer-close', drawer)?.focus();
    else toggles[0]?.focus();
  };
  toggles.forEach((button) => button.addEventListener('click', () => setOpen(true)));
  closeButtons.forEach((button) => button.addEventListener('click', () => setOpen(false)));
  backdrop?.addEventListener('click', () => setOpen(false));
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && document.body.classList.contains('drawer-open')) setOpen(false);
  });
}

function setupInstall() {
  const buttons = document.querySelectorAll('#installPwaBtn');
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    installPrompt = event;
    buttons.forEach((button) => { button.style.display = 'inline-flex'; });
  });
  buttons.forEach((button) => button.addEventListener('click', async () => {
    if (!installPrompt) {
      showToast('ब्राउज़र के मेन्यू से “Add to Home Screen” चुनें—यह पेज PWA के लिए तैयार है।');
      return;
    }
    installPrompt.prompt();
    await installPrompt.userChoice.catch(() => null);
    installPrompt = null;
    button.style.display = 'none';
  }));
  window.addEventListener('appinstalled', () => showToast('Nischay Forge आपके ऐप्स में जुड़ गया।'));
}

setupDrawer();
setupStudio();
setupLibrary();
setupInstall();
updateLibraryCounts();
if ('serviceWorker' in navigator && window.isSecureContext) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}), { once: true });
}
