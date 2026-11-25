// Vercel Serverless Function — Transcripción de voz y redacción asistida con Gemini
// Requiere la variable de entorno GEMINI_API_KEY en Vercel.

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(503).json({
      error: 'MISSING_GEMINI_KEY',
      message: 'Falta configurar GEMINI_API_KEY en las variables de entorno de Vercel.'
    });
  }

  const { mode = 'audio', audioBase64, mimeType, text, contextQuestion } = req.body || {};

  if (mode === 'audio' && !audioBase64) {
    return res.status(400).json({ error: 'Falta el audio para transcribir.' });
  }
  if (mode === 'rewrite' && (!text || !String(text).trim())) {
    return res.status(400).json({ error: 'Falta el texto para redactar.' });
  }

  const systemInstruction =
    'Eres un asistente de redaccion para un funcionario universitario (Andres) que atiende por chat escrito a una persona sorda (Patricia). ' +
    'Devuelve UNICAMENTE el texto final listo para enviar en el chat, en espanol claro, directo, respetuoso y facil de leer. ' +
    'No incluyas emojis, ni comillas alrededor, ni saludos innecesarios ni explicaciones meta.';

  const parts = [];
  if (mode === 'audio') {
    const contextHint = contextQuestion
      ? `Contexto de la consulta del visitante: "${contextQuestion}". `
      : '';
    parts.push({
      text: `${contextHint}Transcribe fielmente lo que dice el funcionario en este audio y dejalo bien puntuado y claro para enviarlo por chat. No agregues informacion inventada.`
    });
    parts.push({
      inline_data: {
        mime_type: mimeType || 'audio/webm',
        data: audioBase64
      }
    });
  } else {
    const contextHint = contextQuestion
      ? `Contexto de la consulta: "${contextQuestion}". `
      : '';
    parts.push({
      text: `${contextHint}Redacta de forma clara, amable y ordenada la siguiente respuesta corta o notas del funcionario para enviarla por chat:\n\n${String(text).trim()}`
    });
  }

  const payload = {
    system_instruction: { parts: [{ text: systemInstruction }] },
    contents: [{ role: 'user', parts }],
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 400
    }
  };

  async function tryGenerate(modelName) {
    const cleanModel = modelName.replace(/^models\//, '');
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${cleanModel}:generateContent?key=${encodeURIComponent(apiKey)}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await response.json();
    if (!response.ok) {
      return { ok: false, error: `${cleanModel}: ${data?.error?.message || `HTTP ${response.status}`}` };
    }
    const candidateText = data?.candidates?.[0]?.content?.parts
      ?.map(p => p.text || '')
      .join('')
      .trim();
    if (!candidateText) {
      return { ok: false, error: `${cleanModel}: sin texto devuelto.` };
    }
    return { ok: true, text: candidateText, model: cleanModel };
  }

  const initialModels = ['gemini-3.8-flash', 'gemini-flash-latest', 'gemini-2.5-flash'];
  const errors = [];

  for (const m of initialModels) {
    try {
      const r = await tryGenerate(m);
      if (r.ok) return res.status(200).json(r);
      errors.push(r.error);
    } catch (err) {
      errors.push(`${m}: ${err.message}`);
    }
  }

  // Auto-descubrir modelos disponibles en esta API key
  try {
    const listUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`;
    const listRes = await fetch(listUrl);
    const listData = await listRes.json();
    const available = (listData?.models || [])
      .filter(m =>
        Array.isArray(m.supportedGenerationMethods) &&
        m.supportedGenerationMethods.includes('generateContent') &&
        /gemini/i.test(m.name) &&
        !/embedding|imagen|veo|tts|aqa/i.test(m.name)
      )
      .map(m => m.name.replace(/^models\//, ''))
      .filter(name => !initialModels.includes(name));

    available.sort((a, b) => {
      const af = /flash/i.test(a) ? 0 : 1;
      const bf = /flash/i.test(b) ? 0 : 1;
      return af - bf;
    });

    for (const m of available.slice(0, 6)) {
      try {
        const r = await tryGenerate(m);
        if (r.ok) return res.status(200).json(r);
        errors.push(r.error);
      } catch (err) {
        errors.push(`${m}: ${err.message}`);
      }
    }
  } catch (err) {
    errors.push(`listModels: ${err.message}`);
  }

  return res.status(502).json({
    error: 'GEMINI_FAILED',
    message: errors[0] || 'No se pudo procesar con Gemini.',
    details: errors
  });
}
