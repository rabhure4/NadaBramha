import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

const app = express();
const port = Number(process.env.NADABRAMHA_SERVER_PORT || 3901);
const streamSessions = new Map();
const rootDir = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.join(rootDir, 'dist');

app.use(express.json({ limit: '10mb' }));

app.get('/api/health', (_request, response) => {
  response.json({ ok: true, service: 'nadabramha-server' });
});

app.post('/api/providers/check', async (request, response) => {
  try {
    const payload = request.body || {};
    const result = await checkProviderReadiness(payload.provider, payload.providerSettings || {});
    response.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to check provider.';
    response.status(400).json({ ok: false, status: 'error', message });
  }
});

app.post('/api/tts/synthesize', async (request, response) => {
  try {
    const audioResponse = await synthesize(request.body || {});
    response.setHeader('Content-Type', audioResponse.contentType || 'audio/mpeg');
    response.setHeader('Cache-Control', 'no-store');
    response.send(Buffer.from(await audioResponse.arrayBuffer()));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown server error';
    response.status(400).send(message);
  }
});

app.post('/api/tts/stream-session', async (request, response) => {
  try {
    const payload = request.body || {};
    assertStreamingSupported(payload.provider);
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    streamSessions.set(id, { payload, createdAt: Date.now() });
    response.json({ url: `/api/tts/stream/${id}` });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to create stream session';
    response.status(400).send(message);
  }
});

app.get('/api/tts/stream/:id', async (request, response) => {
  const session = streamSessions.get(request.params.id);
  if (!session) {
    response.status(404).send('Stream session not found.');
    return;
  }

  streamSessions.delete(request.params.id);

  try {
    const upstream = await synthesizeStream(session.payload || {});
    response.setHeader('Content-Type', upstream.headers.get('content-type') || 'audio/mpeg');
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Transfer-Encoding', 'chunked');

    if (!upstream.body) {
      throw new Error('Provider did not return a readable stream.');
    }

    const reader = upstream.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      response.write(Buffer.from(value));
    }
    response.end();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Streaming failed.';
    if (!response.headersSent) {
      response.status(400).send(message);
    } else {
      response.end();
    }
  }
});

if (fs.existsSync(distDir)) {
  app.use(express.static(distDir));

  app.get(/^(?!\/api).*/, (_request, response) => {
    response.sendFile(path.join(distDir, 'index.html'));
  });
}

app.listen(port, () => {
  console.log(`NadaBramha server listening on http://localhost:${port}`);
});

async function synthesize(payload) {
  const provider = payload.provider;
  switch (provider) {
    case 'elevenlabs':
      return await synthesizeElevenLabs(payload);
    case 'azure':
      return await synthesizeAzure(payload);
    case 'polly-proxy':
      return await relayJsonAudio(payload.providerSettings?.['polly.url'], {
        text: payload.text,
        voiceId: payload.voiceURI || payload.providerSettings?.['polly.voice'],
        engine: payload.providerSettings?.['polly.engine'] || 'neural',
        speed: payload.speed,
        pitch: payload.pitch,
        tone: payload.tone,
        emotion: payload.emotion,
      });
    case 'openai-compatible':
      return await synthesizeOpenAICompatible(payload, 'openai');
    case 'kokoro':
      return await synthesizeOpenAICompatible(payload, 'kokoro');
    case 'piper':
      return await relayJsonAudio(payload.providerSettings?.['piper.url'], {
        text: payload.text,
        voice: payload.voiceURI || payload.providerSettings?.['piper.voice'],
        speed: payload.speed,
        pitch: payload.pitch,
        tone: payload.tone,
        emotion: payload.emotion,
        format: 'mp3',
      });
    case 'local-http':
      return await relayJsonAudio(
        payload.providerSettings?.['localHttp.url'],
        {
          text: payload.text,
          voice: payload.voiceURI || payload.providerSettings?.['localHttp.voice'],
          model: payload.providerSettings?.['localHttp.model'],
          speed: payload.speed,
          pitch: payload.pitch,
          tone: payload.tone,
          emotion: payload.emotion,
          format: 'mp3',
        },
        payload.providerSettings?.['localHttp.method'] || 'POST',
        parseJsonHeaders(payload.providerSettings?.['localHttp.headers'])
      );
    default:
      throw new Error(`Provider ${provider} is not supported by the local backend.`);
  }
}

async function synthesizeStream(payload) {
  const provider = payload.provider;
  assertStreamingSupported(provider);
  switch (provider) {
    case 'elevenlabs':
      return await synthesizeElevenLabs(payload, true);
    case 'polly-proxy':
      return await relayJsonAudio(payload.providerSettings?.['polly.url'], {
        text: payload.text,
        voiceId: payload.voiceURI || payload.providerSettings?.['polly.voice'],
        engine: payload.providerSettings?.['polly.engine'] || 'neural',
        speed: payload.speed,
        pitch: payload.pitch,
        tone: payload.tone,
        emotion: payload.emotion,
      }, 'POST', {}, true);
    case 'openai-compatible':
      return await synthesizeOpenAICompatible(payload, 'openai', true);
    case 'kokoro':
      return await synthesizeOpenAICompatible(payload, 'kokoro', true);
    case 'piper':
      return await relayJsonAudio(payload.providerSettings?.['piper.url'], {
        text: payload.text,
        voice: payload.voiceURI || payload.providerSettings?.['piper.voice'],
        speed: payload.speed,
        pitch: payload.pitch,
        tone: payload.tone,
        emotion: payload.emotion,
        format: 'mp3',
      }, 'POST', {}, true);
    case 'local-http':
      return await relayJsonAudio(
        payload.providerSettings?.['localHttp.url'],
        {
          text: payload.text,
          voice: payload.voiceURI || payload.providerSettings?.['localHttp.voice'],
          model: payload.providerSettings?.['localHttp.model'],
          speed: payload.speed,
          pitch: payload.pitch,
          tone: payload.tone,
          emotion: payload.emotion,
          format: 'mp3',
        },
        payload.providerSettings?.['localHttp.method'] || 'POST',
        parseJsonHeaders(payload.providerSettings?.['localHttp.headers']),
        true
      );
    default:
      throw new Error(`Provider ${provider} is not stream-enabled.`);
  }
}

async function synthesizeElevenLabs(payload, stream = false) {
  const apiKey = payload.providerSettings?.['elevenlabs.apiKey'];
  const voiceId = payload.voiceURI || payload.providerSettings?.['elevenlabs.voiceId'];
  const model = payload.providerSettings?.['elevenlabs.model'] || 'eleven_multilingual_v2';
  if (!apiKey) throw new Error('Missing ElevenLabs API key.');
  if (!voiceId) throw new Error('Missing ElevenLabs voice ID.');

  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'xi-api-key': apiKey,
      ...(stream ? { Accept: 'audio/mpeg' } : {}),
    },
    body: JSON.stringify({
      text: payload.text,
      model_id: model,
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.75,
        speed: payload.speed,
      },
    }),
  });

  if (!response.ok) throw new Error(await response.text());
  return stream ? response : withContentType(response);
}

async function synthesizeAzure(payload) {
  const apiKey = payload.providerSettings?.['azure.apiKey'];
  const region = payload.providerSettings?.['azure.region'];
  const voice = payload.voiceURI || payload.providerSettings?.['azure.voice'];
  if (!apiKey || !region || !voice) throw new Error('Azure requires api key, region, and voice.');

  const rate = `${Math.round((Number(payload.speed || 1) - 1) * 100)}%`;
  const pitch = `${Math.round((Number(payload.pitch || 1) - 1) * 50)}%`;
  const escaped = String(payload.text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  const ssml = `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="en-US"><voice name="${voice}"><prosody rate="${rate}" pitch="${pitch}">${escaped}</prosody></voice></speak>`;

  const response = await fetch(`https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`, {
    method: 'POST',
    headers: {
      'Ocp-Apim-Subscription-Key': apiKey,
      'Content-Type': 'application/ssml+xml',
      'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3',
    },
    body: ssml,
  });

  if (!response.ok) throw new Error(await response.text());
  return withContentType(response);
}

async function synthesizeOpenAICompatible(payload, prefix, stream = false) {
  const baseUrl = payload.providerSettings?.[`${prefix}.baseUrl`];
  const path = payload.providerSettings?.[`${prefix}.path`] || '/v1/audio/speech';
  const apiKey = payload.providerSettings?.[`${prefix}.apiKey`];
  const model = payload.providerSettings?.[`${prefix}.model`] || 'tts-1';
  const voice = payload.voiceURI || payload.providerSettings?.[`${prefix}.voice`] || 'alloy';
  if (!baseUrl) throw new Error(`Missing ${prefix} base URL.`);

  const headers = { 'Content-Type': 'application/json' };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  const response = await fetch(`${trimTrailingSlash(baseUrl)}${path.startsWith('/') ? path : `/${path}`}`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model,
      voice,
      input: payload.text,
      speed: payload.speed,
      response_format: 'mp3',
      instructions: buildInstructions(payload),
      stream,
    }),
  });

  if (!response.ok) throw new Error(await response.text());
  return stream ? response : withContentType(response);
}

async function relayJsonAudio(url, body, method = 'POST', extraHeaders = {}, stream = false) {
  if (!url) throw new Error('Provider endpoint URL is missing.');
  const response = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...extraHeaders,
    },
    body: method.toUpperCase() === 'GET' ? undefined : JSON.stringify(body),
  });

  if (!response.ok) throw new Error(await response.text());
  return stream ? response : withContentType(response);
}

function buildInstructions(payload) {
  return `Tone: ${payload.tone || 'natural'}. Emotion: ${payload.emotion || 'neutral'}. Keep delivery clear and conversational.`;
}

function parseJsonHeaders(value) {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    return typeof parsed === 'object' && parsed ? parsed : {};
  } catch {
    throw new Error('localHttp.headers must be valid JSON.');
  }
}

function trimTrailingSlash(value) {
  return String(value || '').replace(/\/$/, '');
}

function withContentType(response) {
  return {
    arrayBuffer: () => response.arrayBuffer(),
    contentType: response.headers.get('content-type') || 'audio/mpeg',
  };
}

function assertStreamingSupported(provider) {
  const supported = new Set(['elevenlabs', 'polly-proxy', 'openai-compatible', 'kokoro', 'piper', 'local-http']);
  if (!supported.has(provider)) {
    throw new Error(`Provider ${provider} does not currently support streamed playback.`);
  }
}

async function checkProviderReadiness(provider, providerSettings) {
  switch (provider) {
    case 'web':
      return { ok: true, status: 'ready', message: 'Browser speech is available in the client runtime.' };
    case 'elevenlabs':
      return requireFields(providerSettings, ['elevenlabs.apiKey', 'elevenlabs.voiceId'], 'Add an ElevenLabs API key and voice id.');
    case 'azure':
      return requireFields(providerSettings, ['azure.apiKey', 'azure.region', 'azure.voice'], 'Add Azure Speech key, region, and voice.');
    case 'polly-proxy':
      return await checkUrlBackedProvider(providerSettings['polly.url'], 'Set the Polly proxy URL first.');
    case 'openai-compatible':
      return await checkUrlBackedProvider(providerSettings['openai.baseUrl'], 'Set the OpenAI-compatible base URL first.');
    case 'kokoro':
      return await checkUrlBackedProvider(providerSettings['kokoro.baseUrl'], 'Set the Kokoro base URL first.');
    case 'piper':
      return await checkUrlBackedProvider(providerSettings['piper.url'], 'Set the Piper endpoint URL first.');
    case 'local-http':
      return await checkUrlBackedProvider(providerSettings['localHttp.url'], 'Set the local HTTP endpoint URL first.');
    default:
      return { ok: false, status: 'error', message: `Unknown provider ${provider}.` };
  }
}

function requireFields(providerSettings, fields, message) {
  const missing = fields.filter((field) => !providerSettings[field]);
  if (missing.length > 0) {
    return {
      ok: false,
      status: 'missing',
      message,
      missing,
    };
  }
  return {
    ok: true,
    status: 'ready',
    message: 'Required configuration is present.',
  };
}

async function checkUrlBackedProvider(url, missingMessage) {
  if (!url) {
    return { ok: false, status: 'missing', message: missingMessage };
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2500);
    const target = new URL(url);
    const response = await fetch(target.origin, { method: 'GET', signal: controller.signal });
    clearTimeout(timeout);
    return {
      ok: response.ok,
      status: response.ok ? 'reachable' : 'unhealthy',
      message: response.ok ? `Endpoint responded from ${target.origin}.` : `Endpoint responded with ${response.status}.`,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Endpoint check failed.';
    return {
      ok: false,
      status: 'offline',
      message,
    };
  }
}
