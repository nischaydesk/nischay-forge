const MAX_PROMPT_LENGTH = 4_000;

// आपकी दी गई की
const AUTH_TOKEN = "AQ.Ab8RN6Iox73qaj7V0QpVqxdUmAnAv8Qjhleb7oPVMGCrUQ_10g";

// मॉडल्स
const PRIMARY_MODEL = "gemini-2.0-flash";
const BACKUP_MODEL = "gemini-1.5-flash";

export async function generateFromPrompt(prompt) {
  const cleanPrompt = String(prompt || '').trim();
  if (!cleanPrompt || cleanPrompt.length > MAX_PROMPT_LENGTH) {
    throw new Error('कृपया अपना अनुरोध लिखें और उसे 4,000 अक्षरों से छोटा रखें।');
  }

  const systemInstruction = `आप Nischay Forge के मुख्य AI इंजन हैं। यूज़र की मांग समझकर तय करें कि उन्हें एक वर्किंग वेब टूल चाहिए या वे सिर्फ सामान्य बातचीत कर रहे हैं।

नियम:
1. हमेशा केवल शुद्ध और वैध JSON उत्तर दें। कोई मार्कडाउन न लगाएं।
2. JSON प्रारूप:
{
  "intent": "tool" या "chat",
  "cleanName": "टूल का नाम",
  "html": "<!DOCTYPE html>...",
  "message": "छोटा हिंदी संदेश"
}
3. अगर टूल मांगा है तो intent: "tool" और html में 100% वर्किंग सिंगल-फाइल HTML5 कोड दें।
4. अगर बातचीत है तो intent: "chat" और html: "" रखें।`;

  async function requestGemini(modelName) {
    // 1. अगर यह Bearer टोकन है, तो सीधा एंडपॉइंट बिना ?key= के कॉल होगा
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent`;

    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      // दोनों हेडर एक साथ ताकि टोकन रिजेक्ट न हो
      'Authorization': `Bearer ${AUTH_TOKEN}`,
      'x-goog-api-key': AUTH_TOKEN
    };

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: headers,
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
      // 2. फ़ॉलबैक: अगर Bearer काम न करे, तो URL key से प्रयास करें
      const fallbackUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${AUTH_TOKEN}`;
      const res2 = await fetch(fallbackUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: `${systemInstruction}\n\nयूज़र का प्रॉम्प्ट: "${cleanPrompt}"` }] }],
          generationConfig: { response_mime_type: 'application/json' }
        })
      });

      if (!res2.ok) {
        const errData = await res2.json().catch(() => ({}));
        throw new Error(`[${modelName}] ${errData?.error?.message || response.statusText}`);
      }
      const data2 = await res2.json();
      return JSON.parse(data2?.candidates?.[0]?.content?.parts?.[0]?.text);
    }

    const data = await response.json();
    const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawText) throw new Error('AI से कोई उत्तर प्राप्त नहीं हुआ।');

    return JSON.parse(rawText);
  }

  let result;
  try {
    result = await requestGemini(PRIMARY_MODEL);
  } catch (err) {
    console.warn(`प्राइमरी मॉडल एरर, बैकअप पर स्विच:`, err.message);
    try {
      result = await requestGemini(BACKUP_MODEL);
    } catch (backupErr) {
      console.error(`दोनों मॉडल विफल:`, backupErr.message);
      throw new Error(backupErr.message || err.message);
    }
  }

  const intent = result.intent === 'tool' ? 'tool' : 'chat';
  const cleanName = String(result.cleanName || (intent === 'tool' ? 'नया टूल' : '')).trim();
  const message = String(result.message || (intent === 'tool' ? 'आपका टूल तैयार है!' : '')).trim();
  let html = String(result.html || '').trim();

  if (intent === 'tool' && !html) throw new Error('टूल का कोड खाली मिला।');
  if (intent === 'chat') html = '';

  return { intent, cleanName, html, message };
}
