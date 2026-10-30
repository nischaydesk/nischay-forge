const CORRECTIONS = [
  [/\b(?:q\s*r|qr)\s*(?:code|कोड)\b/gi, 'QR कोड'],
  [/क्यू\s*आर\s*कोड/gi, 'QR कोड'],
  [/क्यूआर\s*कोड/gi, 'QR कोड'],
  [/queue\s+are\s+code/gi, 'QR कोड'],
];

export function correctVoiceText(text) {
  return CORRECTIONS.reduce((value, [pattern, replacement]) => value.replace(pattern, replacement), String(text || '')).trim();
}

export function initVoice({ onTranscript, onState }) {
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const micButtons = [document.querySelector('#micButton'), document.querySelector('#dockMic')].filter(Boolean);
  const languageSelect = document.querySelector('#voiceLanguage');
  const status = document.querySelector('#voiceState');
  const dockStatus = document.querySelector('#dockStatus');
  const voiceDock = document.querySelector('#voiceDock');
  let recognition = null;
  let listening = false;
  let submittedFinal = false;

  const setState = (active, message) => {
    listening = active;
    document.body.classList.toggle('voice-active', active);
    micButtons.forEach((button) => {
      button.setAttribute('aria-pressed', String(active));
      button.setAttribute('aria-label', active ? 'वॉइस इनपुट रोकें' : 'वॉइस इनपुट शुरू करें');
    });
    if (status && message) status.textContent = message;
    if (dockStatus) dockStatus.innerHTML = active ? '<i></i> LISTENING — TAP TO STOP' : '<i></i> READY WHEN YOU ARE';
    if (voiceDock) voiceDock.setAttribute('aria-live', active ? 'polite' : 'off');
    onState?.({ active, message });
  };

  if (!Recognition) {
    setState(false, 'इस ब्राउज़र में वॉइस पहचान उपलब्ध नहीं है—आप लिखकर टूल बना सकते हैं।');
    micButtons.forEach((button) => button.setAttribute('title', 'इस ब्राउज़र में Web Speech API उपलब्ध नहीं है'));
    return { start: () => {}, stop: () => {}, supported: false };
  }

  recognition = new Recognition();
  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.maxAlternatives = 1;
  recognition.onstart = () => {
    submittedFinal = false;
    setState(true, 'सुन रहा हूँ… अपना टूल बताइए।');
  };
  recognition.onresult = (event) => {
    let interim = '';
    let finalText = '';
    for (let index = event.resultIndex; index < event.results.length; index += 1) {
      const phrase = event.results[index][0]?.transcript || '';
      if (event.results[index].isFinal) finalText += phrase;
      else interim += phrase;
    }
    if (interim && status) status.textContent = `पहचान रहे हैं: ${correctVoiceText(interim)}`;
    if (finalText.trim() && !submittedFinal) {
      submittedFinal = true;
      const text = correctVoiceText(finalText);
      setState(false, `पहचाना: “${text}” — टूल बनाने की शुरुआत…`);
      onTranscript?.(text);
    }
  };
  recognition.onerror = (event) => {
    const message = event.error === 'not-allowed' || event.error === 'service-not-allowed'
      ? 'माइक की अनुमति नहीं मिली। ब्राउज़र सेटिंग में अनुमति दें या लिखकर आगे बढ़ें।'
      : event.error === 'no-speech'
        ? 'आवाज़ सुनाई नहीं दी। दोबारा टैप करें या लिखकर बताएं।'
        : 'वॉइस इनपुट रुक गया। आप लिखकर भी आगे बढ़ सकते हैं।';
    setState(false, message);
  };
  recognition.onend = () => {
    if (listening) setState(false, 'वॉइस इनपुट बंद है। फिर बोलने के लिए माइक टैप करें।');
  };

  const start = () => {
    if (listening) return;
    recognition.lang = languageSelect?.value || 'hi-IN';
    try {
      recognition.start();
    } catch {
      setState(false, 'माइक तैयार नहीं हो पाया। एक बार फिर टैप करें या लिखकर बताएं।');
    }
  };
  const stop = () => {
    if (!listening) return;
    try { recognition.stop(); } catch { setState(false, 'वॉइस इनपुट बंद है।'); }
  };
  const toggle = () => listening ? stop() : start();
  micButtons.forEach((button) => button.addEventListener('click', toggle));
  return { start, stop, toggle, get listening() { return listening; }, supported: true };
}
