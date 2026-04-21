import type { VoiceProvider } from '@/src/store/useStore';

export interface TTSRequest {
  provider: VoiceProvider;
  text: string;
  speed: number;
  pitch: number;
  volume: number;
  tone: string;
  emotion: string;
  voiceURI?: string;
  providerSettings: Record<string, string>;
}

export interface TimelineClipInput extends TTSRequest {
  startTime: number;
}

export const providerOptions: { key: VoiceProvider; label: string; needsAudioFile: boolean; supportsStreaming: boolean }[] = [
  { key: 'web', label: 'Web Speech', needsAudioFile: false, supportsStreaming: true },
  { key: 'elevenlabs', label: 'ElevenLabs', needsAudioFile: true, supportsStreaming: true },
  { key: 'azure', label: 'Azure Speech', needsAudioFile: true, supportsStreaming: false },
  { key: 'polly-proxy', label: 'AWS Polly Proxy', needsAudioFile: true, supportsStreaming: true },
  { key: 'openai-compatible', label: 'OpenAI-compatible TTS', needsAudioFile: true, supportsStreaming: true },
  { key: 'kokoro', label: 'Kokoro (local/docker)', needsAudioFile: true, supportsStreaming: true },
  { key: 'piper', label: 'Piper (local/docker)', needsAudioFile: true, supportsStreaming: true },
  { key: 'local-http', label: 'Generic Local HTTP', needsAudioFile: true, supportsStreaming: true },
];

export async function requestServerTTS(input: TTSRequest): Promise<Blob> {
  const response = await fetch('/api/tts/synthesize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return await response.blob();
}

export async function createServerTTSStreamUrl(input: TTSRequest): Promise<string> {
  const response = await fetch('/api/tts/stream-session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  const data = await response.json();
  return data.url as string;
}

export function getProviderVoice(provider: VoiceProvider, providerSettings: Record<string, string>, voiceURI: string): string {
  if (provider === 'web') return voiceURI;
  const keyMap: Record<Exclude<VoiceProvider, 'web'>, string> = {
    'elevenlabs': 'elevenlabs.voiceId',
    'azure': 'azure.voice',
    'polly-proxy': 'polly.voice',
    'openai-compatible': 'openai.voice',
    'kokoro': 'kokoro.voice',
    'piper': 'piper.voice',
    'local-http': 'localHttp.voice',
  };
  return providerSettings[keyMap[provider]] || '';
}

export function getProviderModel(provider: VoiceProvider, providerSettings: Record<string, string>): string {
  const keyMap: Partial<Record<VoiceProvider, string>> = {
    'elevenlabs': 'elevenlabs.model',
    'openai-compatible': 'openai.model',
    'kokoro': 'kokoro.model',
    'local-http': 'localHttp.model',
  };
  const key = keyMap[provider];
  return key ? providerSettings[key] || '' : '';
}

export function estimateSpeechDuration(text: string, speed = 1): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  const baseSeconds = Math.max(1.5, words / 2.6);
  return parseFloat((baseSeconds / Math.max(speed, 0.5)).toFixed(2));
}

/** Providers that support SSML emotion/tone styling */
export const ssmlProviders: VoiceProvider[] = ['azure', 'polly-proxy'];

export function providerSupportsSSML(provider: VoiceProvider): boolean {
  return ssmlProviders.includes(provider);
}

/**
 * Azure SSML express-as styles that map from user-friendly emotion/tone values.
 * See: https://learn.microsoft.com/en-us/azure/ai-services/speech-service/speech-synthesis-markup-voice
 */
const azureStyleMap: Record<string, string> = {
  cheerful: 'cheerful', happy: 'cheerful', excited: 'excited',
  sad: 'sad', angry: 'angry', terrified: 'terrified',
  calm: 'calm', friendly: 'friendly', hopeful: 'hopeful',
  shouting: 'shouting', whispering: 'whispering', empathetic: 'empathetic',
  warm: 'friendly', crisp: 'newscast-formal', urgent: 'newscast-casual',
  professional: 'narration-professional', neutral: 'chat', natural: 'chat',
  confident: 'narration-professional', engaged: 'cheerful',
  conversational: 'chat', news: 'newscast-formal',
};

function resolveAzureStyle(tone: string, emotion: string): string | null {
  const raw = (emotion || tone || '').trim().toLowerCase();
  if (!raw) return null;
  return azureStyleMap[raw] || raw;
}

/**
 * Wraps the given text with SSML markup for providers that support it.
 * Returns original text unchanged for non-SSML providers.
 */
export function wrapWithSSML(
  text: string,
  provider: VoiceProvider,
  tone: string,
  emotion: string,
  voice?: string,
): string {
  if (!providerSupportsSSML(provider)) return text;
  if (!tone && !emotion) return text;

  if (provider === 'azure') {
    const style = resolveAzureStyle(tone, emotion);
    if (!style) return text;
    const voiceName = voice || 'en-US-JennyNeural';
    return [
      '<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="http://www.w3.org/2001/mstts" xml:lang="en-US">',
      `  <voice name="${voiceName}">`,
      `    <mstts:express-as style="${style}">`,
      `      ${text}`,
      `    </mstts:express-as>`,
      `  </voice>`,
      `</speak>`,
    ].join('\n');
  }

  if (provider === 'polly-proxy') {
    const domain = (emotion || tone || '').trim().toLowerCase();
    if (domain === 'conversational' || domain === 'news') {
      return `<speak><amazon:domain name="${domain}">${text}</amazon:domain></speak>`;
    }
    // Polly has limited style support; pass as-is for unrecognised values
    return text;
  }

  return text;
}

export function getAudioExtension(mimeType: string | null): string {
  const extensionMap: Record<string, string> = {
    'audio/wav': 'wav',
    'audio/x-wav': 'wav',
    'audio/mpeg': 'mp3',
    'audio/mp3': 'mp3',
    'audio/ogg': 'ogg',
    'audio/webm': 'webm',
    'audio/flac': 'flac',
  };
  return extensionMap[mimeType || ''] || 'audio';
}
