const MAX_PROMPT_LENGTH = 4_000;

// एन्कोडेड सुरक्षित की (Scrambled Chunks)
const _k1 = "QVEuQWI4Uk42SW94NzNx";
const _k2 = "YWp3VjBRcFZxeGRVbUFu";
const _k3 = "QXY4UWpobGViN29QVk1H";
const _k4 = "Q3JVUV8xMGc=";

// रनटाइम पर डीकोड करने वाला सीक्रेट फ़ंक्शन
function _getSecureKey() {
  try {
    return atob(_k1 + _k2 + _k3 + _k4);
  } catch (e) {
    return "";
  }
}

const PRIMARY_MODEL = "gemini-3.8";
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
  "cleanName": "टूल का संक्षिप्त और सुंदर नाम (जैसे 'उम्र कैलकुलेटर')",
  "html": "<!DOCTYPE html>...",
  "message": "यूज़र के लिए एक छोटा मित्रवत हिंदी संदेश"
}
3. अगर यूज़र ने किसी भी प्रकार का कैलकुलेटर, कन्वर्टर, ट्रैकर, गेम, या यूटिलिटी टूल बनाने को कहा है:
   - "intent" को "tool" रखें।
   - "html" में पूरी तरह से 100% वर्किंग, मॉडर्न, डार्क-थीम और सिंगल-फाइल HTML5 कोड दें (जिसमें इनलाइन CSS और इनलाइन JS शामिल हो)।
   - HTML के <head> में <meta charset="UTF-8"> और <meta name="viewport" content="width=device-width, initial-scale=1.0"> अनिवार्य रूप से होना चाहिए।
4. अगर यूज़र ने सिर्फ 'हैलो', 'कैसे हो', या सामान्य सवाल पूछा है और कोई टूल नहीं मांगा:
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
      throw new Error(errData?.error?.message || `API एरर (Status: ${response.status})`);
    }

    const data = await response.json();
    const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawText) throw new Error('AI से कोई वैध उत्तर प्राप्त नहीं हुआ।');

    return JSON.parse(rawText);
  }

  let result;
  try {
    // पहले प्राइमरी मॉडल (gemini-3.8)
    result = await requestGemini(PRIMARY_MODEL);
  } catch (primaryErr) {
    console.warn(`प्राइमरी मॉडल (${PRIMARY_MODEL}) में रुकावट, बैकअप मॉडल (${BACKUP_MODEL}) पर जा रहे हैं:`, primaryErr);
    try {
      // बैकअप मॉडल (gemini-3.5-flash-lite)
      result = await requestGemini(BACKUP_MODEL);
    } catch (backupErr) {
      console.error('दोनों AI मॉडल विफल:', backupErr);
      throw new Error('AI सेवा से संपर्क नहीं हो पाया। कृपया कनेक्शन जाँचें और दोबारा कोशिश करें।');
    }
  }

  // डेटा संरचना की पुष्टि
  if (!result || typeof result !== 'object') {
    throw new Error('AI का जवाब अपेक्षित प्रारूप में नहीं था। कृपया फिर कोशिश करें।');
  }

  const intent = result.intent === 'tool' ? 'tool' : 'chat';
  const cleanName = String(result.cleanName || (intent === 'tool' ? 'नया टूल' : '')).trim();
  const message = String(result.message || (intent === 'tool' ? 'आपका टूल तैयार कर दिया गया है!' : '')).trim();
  let html = String(result.html || '').trim();

  if (intent === 'tool' && !html) {
    throw new Error('टूल का कोड खाली मिला। कृपया अनुरोध फिर भेजें।');
  }
  if (intent === 'chat') {
    html = '';
  }

  return { intent, cleanName, html, message };
}
