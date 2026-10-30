const MAX_PROMPT_LENGTH = 4_000;

// आपकी दी गई API की (Scrambled & Base64 Chunks)
const _c1 = "QWI4Uk42SW94NzNx";
const _c2 = "YWp3VjBRcFZxeGRV";
const _c3 = "bUFuQXY4UWpobGVi";
const _c4 = "N29QVk1HQ3JVUV8x";
const _c5 = "MGc=";

function _getEngineKey() {
  try {
    return atob(_c1 + _c2 + _c3 + _c4 + _c5);
  } catch (e) {
    return "Ab8RN6Iox73qaj7V0QpVqxdUmAnAv8Qjhleb7oPVMGCrUQ_10g";
  }
}

// आपके दोनों पसंदीदा मॉडल
const PRIMARY_MODEL = "gemini-3.8-flash";
const BACKUP_MODEL = "gemini-3.5-flash-lite";

export async function generateFromPrompt(prompt) {
  const cleanPrompt = String(prompt || '').trim();
  if (!cleanPrompt || cleanPrompt.length > MAX_PROMPT_LENGTH) {
    throw new Error('कृपया अपना अनुरोध लिखें और उसे 4,000 अक्षरों से छोटा रखें।');
  }

  const systemInstruction = `आप Nischay Forge के मुख्य AI इंजन हैं। यूज़र की मांग समझकर तय करें कि उन्हें एक वर्किंग वेब टूल चाहिए या वे सिर्फ सामान्य बातचीत कर रहे हैं।

सख्त नियम:
1. हमेशा केवल शुद्ध और वैध JSON उत्तर दें। कोई मार्कडाउन (जैसे \`\`\`json) न लगाएं।
2. JSON का प्रारूप बिल्कुल ऐसा होना चाहिए:
{
  "intent": "tool" या "chat",
  "cleanName": "टूल का संक्षिप्त और सुंदर नाम (जैसे 'उम्र कैलकुलेटर')",
  "html": "<!DOCTYPE html>...",
  "message": "यूज़र के लिए एक छोटा मित्रवत हिंदी संदेश"
}
3. अगर यूज़र ने किसी भी प्रकार का टूल (कैलकुलेटर, कन्वर्टर, ट्रैकर, गेम आदि) मांगा है:
   - "intent" को "tool" रखें।
   - "html" में पूरी तरह से 100% वर्किंग, डार्क थीम, सिंगल-फाइल HTML5 कोड दें (CSS और JS इनलाइन हो)।
   - HTML में <meta charset="UTF-8"> और <meta name="viewport" content="width=device-width, initial-scale=1.0"> अनिवार्य रूप से होना चाहिए।
4. अगर यूज़र ने सिर्फ सामान्य बातचीत की है:
   - "intent" को "chat" रखें।
   - "html" को "" रखें।
   - "message" में विनम्र हिंदी जवाब दें।`;

  async function requestGemini(modelName) {
    const key = _getEngineKey();
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${key}`;
    
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'x-goog-api-key': key
      },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [{ text: `${systemInstruction}\n\nयूज़र का प्रॉम्प्ट: "${cleanPrompt}"` }]
          }
        ],
        generationConfig: {
          response_mime_type: 'application/json',
          temperature: 0.2
        }
      })
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      const detailedMsg = errData?.error?.message || `HTTP ${response.status}`;
      throw new Error(`[${modelName}] ${detailedMsg}`);
    }

    const data = await response.json();
    const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawText) throw new Error(`[${modelName}] से कोई उत्तर नहीं मिला।`);

    return JSON.parse(rawText);
  }

  let result;
  let primaryError = null;

  // 1. पहले Gemini 3.8 फ़्लैश से प्रयास
  try {
    result = await requestGemini(PRIMARY_MODEL);
  } catch (err) {
    primaryError = err;
    console.warn(`प्राइमरी मॉडल (${PRIMARY_MODEL}) रुकावट:`, err.message);
    
    // 2. तुरंत बैकअप Gemini 3.5 फ़्लैश लाइट पर स्विच
    try {
      result = await requestGemini(BACKUP_MODEL);
    } catch (backupErr) {
      console.error(`बैकअप मॉडल (${BACKUP_MODEL}) भी फेल:`, backupErr.message);
      throw new Error(`AI एरर: ${backupErr.message || primaryError.message}`);
    }
  }

  if (!result || typeof result !== 'object') {
    throw new Error('AI का जवाब अपेक्षित JSON प्रारूप में नहीं मिला।');
  }

  const intent = result.intent === 'tool' ? 'tool' : 'chat';
  const cleanName = String(result.cleanName || (intent === 'tool' ? 'नया टूल' : '')).trim();
  const message = String(result.message || (intent === 'tool' ? 'आपका टूल तैयार कर दिया गया है!' : '')).trim();
  let html = String(result.html || '').trim();

  if (intent === 'tool' && !html) {
    throw new Error('टूल का कोड खाली मिला। कृपया दोबारा कोशिश करें।');
  }
  if (intent === 'chat') {
    html = '';
  }

  return { intent, cleanName, html, message };
}
