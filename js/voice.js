// सामान्य वॉइस पहचान गलतियों को हिंदी और सटीक शब्दों में सुधारने की डिक्शनरी
const CORRECTIONS = [
  [/\b(?:q\s*r|qr)\s*(?:code|कोड)\b/gi, 'QR कोड'],
  [/क्यू\s*आर\s*कोड/gi, 'QR कोड'],
  [/क्यूआर\s*कोड/gi, 'QR कोड'],
  [/queue\s+are\s+code/gi, 'QR कोड'],
  [/कैलकुलेटर\s*बनाओ/gi, 'कैलकुलेटर बनाओ'],
  [/बजट\s*ट्रैकर/gi, 'बजट ट्रैकर']
];

export function correctVoiceText(text) {
  return CORRECTIONS.reduce(
    (value, [pattern, replacement]) => value.replace(pattern, replacement),
    String(text || '')
  ).trim();
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

    // नीचे वाले फ्लोटिंग डॉक और वेव को एनिमेट करना
    if (voiceDock) {
      voiceDock.classList.toggle('active', active);
      voiceDock.setAttribute('aria-live', active ? 'polite' : 'off');
    }

    micButtons.forEach((button) => {
      button.setAttribute('aria-pressed', String(active));
      button.classList.toggle('listening', active);
      button.setAttribute('aria-label', active ? 'वॉइस इनपुट रोकें' : 'वॉइस इनपुट शुरू करें');
    });

    if (status && message) status.textContent = message;
    if (dockStatus) {
      dockStatus.innerHTML = active
        ? '<i></i> LISTENING — TAP TO STOP'
        : '<i></i> READY WHEN YOU ARE';
    }

    onState?.({ active, message });
  };

  // अगर ब्राउज़र में वॉइस सपोर्ट नहीं है
  if (!Recognition) {
    setState(false, 'इस ब्राउज़र में वॉइस पहचान उपलब्ध नहीं है—आप लिखकर टूल बना सकते हैं।');
    micButtons.forEach((button) => {
      button.setAttribute('title', 'इस ब्राउज़र में Web Speech API उपलब्ध नहीं है');
    });
    return { start: () => {}, stop: () => {}, toggle: () => {}, supported: false };
  }

  recognition = new Recognition();
  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.maxAlternatives = 1;

  recognition.onstart = () => {
    submittedFinal = false;
    setState(true, 'सुन रहा हूँ… अपना टूल आइडिया बताइए।');
  };

  recognition.onresult = (event) => {
    let interim = '';
    let finalText = '';

    for (let index = event.resultIndex; index < event.results.length; index += 1) {
      const phrase = event.results[index][0]?.transcript || '';
      if (event.results[index].isFinal) {
        finalText += phrase;
      } else {
        interim += phrase;
      }
    }

    if (interim && status) {
      status.textContent = `पहचान रहे हैं: ${correctVoiceText(interim)}`;
    }

    if (finalText.trim() && !submittedFinal) {
      submittedFinal = true;
      const text = correctVoiceText(finalText);
      setState(false, `पहचाना: “${text}” — टूल बनाने की शुरुआत…`);
      onTranscript?.(text);
    }
  };

  recognition.onerror = (event) => {
    let message = 'वॉइस इनपुट रुक गया। आप लिखकर भी आगे बढ़ सकते हैं।';
    if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
      message = 'माइक की अनुमति नहीं मिली। ब्राउज़र सेटिंग में अनुमति दें या लिखकर आगे बढ़ें।';
    } else if (event.error === 'no-speech') {
      message = 'आवाज़ सुनाई नहीं दी। दोबारा टैप करें या लिखकर बताएं।';
    }
    setState(false, message);
  };

  recognition.onend = () => {
    if (listening) {
      setState(false, 'वॉइस इनपुट बंद है। फिर बोलने के लिए माइक टैप करें।');
    }
  };

  const start = () => {
    if (listening) return;
    recognition.lang = languageSelect?.value || 'hi-IN';
    try {
      recognition.start();
    } catch {
      setState(false, 'माइक शुरू नहीं हो पाया। एक बार फिर टैप करें।');
    }
  };

  const stop = () => {
    if (!listening) return;
    try {
      recognition.stop();
    } catch {
      setState(false, 'वॉइस इनपुट बंद है।');
    }
  };

  const toggle = () => (listening ? stop() : start());

  micButtons.forEach((button) => button.addEventListener('click', toggle));

  return {
    start,
    stop,
    toggle,
    get listening() {
      return listening;
    },
    supported: true
  };
}
