import express from 'express';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '25mb' }));
app.use(express.static('.'));

app.post('/api/detect', async (req, res) => {
  try {
    const { imageDataUrl } = req.body || {};
    if (!imageDataUrl || typeof imageDataUrl !== 'string') {
      return res.status(400).json({ error: 'Missing imageDataUrl' });
    }

    const API_BASE_URL = process.env.API_BASE_URL;
    const API_KEY = process.env.API_KEY;
    const MODEL = process.env.MODEL;

    if (!API_BASE_URL || !API_KEY || !MODEL) {
      return res.status(500).json({
        error: 'Missing API config. Set API_BASE_URL, API_KEY, MODEL in .env'
      });
    }

    // OpenAI-compatible chat/completions payload with image input
    const payload = {
      model: MODEL,
      messages: [
        {
          role: 'system',
          content: 'You are an object detector. Return only one short English object name (e.g., bottle, chair, phone).'
        },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'What is the main object in this image? Reply with one English noun only.' },
            { type: 'image_url', image_url: { url: imageDataUrl } }
          ]
        }
      ],
      temperature: 0,
      max_tokens: 20
    };

    const resp = await fetch(`${API_BASE_URL.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`
      },
      body: JSON.stringify(payload)
    });

    const rawText = await resp.text();
    let data;
    try {
      data = JSON.parse(rawText);
    } catch {
      data = { rawText };
    }

    if (!resp.ok) {
      return res.status(resp.status).json({ error: data?.error?.message || data?.error || 'Upstream API error', raw: data });
    }

    const text = data?.choices?.[0]?.message?.content?.trim() || 'unknown object';
    const objectName = text.split('\n')[0].replace(/["'.]/g, '').trim();

    res.json({ objectName, raw: data });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Server error' });
  }
});

app.use((err, req, res, next) => {
  if (err?.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Image too large. Please retry with a smaller image.' });
  }
  return res.status(500).json({ error: err?.message || 'Unexpected server error' });
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
