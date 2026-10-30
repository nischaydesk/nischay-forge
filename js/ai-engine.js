const MAX_PROMPT_LENGTH = 4_000;

export async function generateFromPrompt(prompt) {
  const cleanPrompt = String(prompt || '').trim();
  if (!cleanPrompt || cleanPrompt.length > MAX_PROMPT_LENGTH) {
    throw new Error('कृपया अपना अनुरोध लिखें और उसे 4,000 अक्षरों से छोटा रखें।');
  }

  let response;
  try {
    response = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ prompt: cleanPrompt }),
      cache: 'no-store',
    });
  } catch {
    throw new Error('सर्वर से संपर्क नहीं हो पाया। कनेक्शन जाँचें और फिर कोशिश करें।');
  }

  let result;
  try {
    result = await response.json();
  } catch {
    throw new Error('AI सेवा से मान्य जवाब नहीं मिला। कृपया फिर कोशिश करें।');
  }
  if (!response.ok) throw new Error(result?.error || 'अभी अनुरोध पूरा नहीं हो पाया। कृपया फिर कोशिश करें।');
  if (!result || !['chat', 'tool'].includes(result.intent) || typeof result.message !== 'string' || typeof result.html !== 'string' || typeof result.cleanName !== 'string') {
    throw new Error('AI का जवाब अपेक्षित प्रारूप में नहीं था। कृपया फिर कोशिश करें।');
  }
  if (result.intent === 'tool' && !result.html.trim()) throw new Error('टूल का कोड खाली मिला। कृपया अनुरोध फिर भेजें।');
  if (result.intent === 'chat' && result.html) result.html = '';
  return result;
}
