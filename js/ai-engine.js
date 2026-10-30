const MAX_PROMPT_LENGTH = 4_000;

// एन्कोडेड सुरक्षित की (Scrambled Chunks)
const _k1 = "QVEuQWI4Uk42SW94NzNx";
const _k2 = "YWp3VjBRcFZxeGRVbUFu";
const _k3 = "QXY4UWpobGViN29QVk1H";
const _k4 = "Q3JVUV8xMGc=";

function _getSecureKey() {
  try {
    return atob(_k1 + _k2 + _k3 + _k4);
  } catch (e) {
    return "";
  }
}

// आपके बताए अनुसार दोनों मॉडल
const PRIMARY_MODEL = "gemini-3.8-flash";
const BACKUP_MODEL = "gemini-3.5-flash-lite";

export async function generateFromPrompt(prompt) {
  const cleanPrompt = String(prompt || '').trim();
  if (!cleanPrompt || cleanPrompt.length > MAX_PROMPT_LENGTH) {
    throw new Error('कृपया अपना अनुरोध लिखें और उसे 4,000 अक्षरों से छोटा रखें।');
  }

  const systemInstruction = `आप Nischay Forge के मुख्य AI इंजन हैं। यूज़र की मांग समझकर तय करें कि उन्हें एक वर्किंग वेब टूल चाहिए या वे सिर्फ सामान्य बातचीत कर रहे हैं।

नियम:
1. हमेशा केवल शुद्ध और वैध JSON उत्तर दें। कोई मार्कडाउन (जैसे \`\`\`json) न लगाएं।
2. JSON का प्रारूप बिल्कुल ऐसा होना चाहिए:
{
  "intent": "tool" या "chat",
  "cleanName": "टूल का संक्षिप्त और सुंदर नाम (जैसे 'PDF जनरेटर')",
  "html": "<!DOCTYPE html>...",
  "message": "यूज़र के लिए एक छोटा मित्रवत हिंदी संदेश"
}
3. अगर यूज़र ने किसी भी प्रकार का टूल (PDF जनरेटर, कैलकुलेटर, कन्वर्टर, बजट ट्रैकर आदि) मांगा है:
   - "intent" को "tool" रखें।
   - "html" में पूरी तरह से 100% वर्किंग, मॉडर्न, डार्क थीम, सिंगल-फाइल HTML5 कोड दें (CSS और JS इनलाइन हो)।
   - HTML में <meta charset="UTF-8"> और <meta name="viewport" content="width=device-width, initial-scale=1.0"> अनिवार्य रूप से होना चाहिए।
4. अगर यूज़र ने सिर्फ 'हैलो', 'हाय' या सामान्य सवाल पूछा है:
   - "intent" को "chat" रखें।
   - "html" को खाली स्ट्रिंग "" रखें।
   - "message" में विनम्र और स्वाभाविक हिंदी जवाब दें।`;

  async function requestGemini(modelName) {
    const key = _getSecureKey();
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${key}`;
    
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
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
      throw new Error(`[${modelName}] एरर: ${detailedMsg}`);
    }

    const data = await response.json();
    const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawText) throw new Error(`[${modelName}] से कोई वैध उत्तर प्राप्त नहीं हुआ।`);

    return JSON.parse(rawText);
  }

  let result;
  let primaryError = null;

  // 1. सबसे पहले Gemini 3.8 फ़्लैश से प्रयास
  try {
    result = await requestGemini(PRIMARY_MODEL);
  } catch (err) {
    primaryError = err;
    console.warn(`प्राइमरी मॉडल (${PRIMARY_MODEL}) में रुकावट:`, err.message);
    
    // 2. तुरंत बिना रुके बैकअप Gemini 3.5 फ़्लैश लाइट पर स्विच
    try {
      result = await requestGemini(BACKUP_MODEL);
    } catch (backupErr) {
      console.error(`बैकअप मॉडल (${BACKUP_MODEL}) भी विफल:`, backupErr.message);
      throw new Error(`${primaryError.message} | ${backupErr.message}`);
    }
  }

  if (!result || typeof result !== 'object') {
    throw new Error('AI का जवाब अपेक्षित JSON प्रारूप में नहीं मिला। कृपया फिर कोशिश करें।');
  }

  const intent = result.intent === 'tool' ? 'tool' : 'chat';
  const cleanName = String(result.cleanName || (intent === 'tool' ? 'नया टूल' : '')).trim();
  const message = String(result.message || (intent === 'tool' ? 'आपका टूल तैयार कर दिया गया है!' : '')).trim();
  let html = String(result.html || '').trim();

  if (intent === 'tool' && !html) {
    throw new Error('टूल का कोड खाली मिला। कृपया अनुरोध दोबारा भेजें।');
  }
  if (intent === 'chat') {
    html = '';
  }

  return { intent, cleanName, html, message };
}
