import React, { useState } from 'react';
import { useStore } from '@/src/store/useStore';

const sections = [
  {
    provider: 'elevenlabs',
    title: 'ElevenLabs',
    description: 'Hosted expressive TTS with file generation and stream playback.',
    fields: [
      ['elevenlabs.apiKey', 'API Key', 'sk_...'],
      ['elevenlabs.voiceId', 'Voice ID', 'EXAVITQu4vr4xnSDxMaL'],
      ['elevenlabs.model', 'Model', 'eleven_multilingual_v2'],
    ],
  },
  {
    provider: 'azure',
    title: 'Azure Speech',
    description: 'Microsoft neural voices rendered through the local runtime.',
    fields: [
      ['azure.apiKey', 'API Key', 'Azure speech key'],
      ['azure.region', 'Region', 'eastus'],
      ['azure.voice', 'Voice', 'en-US-JennyNeural'],
    ],
  },
  {
    provider: 'polly-proxy',
    title: 'AWS Polly Proxy',
    description: 'Use your own backend proxy if you want Polly without exposing AWS credentials in the browser.',
    fields: [
      ['polly.url', 'Proxy URL', 'http://localhost:3901/api/polly-proxy'],
      ['polly.voice', 'Voice', 'Joanna'],
      ['polly.engine', 'Engine', 'neural'],
    ],
  },
  {
    provider: 'openai-compatible',
    title: 'OpenAI-compatible TTS',
    description: 'Any local or hosted endpoint that accepts a speech API similar to OpenAI.',
    fields: [
      ['openai.baseUrl', 'Base URL', 'http://localhost:8880'],
      ['openai.path', 'Speech Path', '/v1/audio/speech'],
      ['openai.apiKey', 'API Key', 'optional'],
      ['openai.model', 'Model', 'tts-1'],
      ['openai.voice', 'Voice', 'alloy'],
    ],
  },
  {
    provider: 'kokoro',
    title: 'Kokoro (Local or Docker)',
    description: 'Point this to your Kokoro container or any compatible local speech server.',
    fields: [
      ['kokoro.baseUrl', 'Base URL', 'http://localhost:8880'],
      ['kokoro.path', 'Speech Path', '/v1/audio/speech'],
      ['kokoro.apiKey', 'API Key', 'optional'],
      ['kokoro.model', 'Model', 'kokoro'],
      ['kokoro.voice', 'Voice', 'af_sarah'],
    ],
  },
  {
    provider: 'piper',
    title: 'Piper (Local or Docker)',
    description: 'Use Piper through a local HTTP bridge or container endpoint.',
    fields: [
      ['piper.url', 'Endpoint URL', 'http://localhost:5000/api/tts'],
      ['piper.voice', 'Voice', 'en_US-lessac-medium'],
    ],
  },
  {
    provider: 'local-http',
    title: 'Generic Local HTTP TTS',
    description: 'For any custom TTS service that accepts JSON over HTTP.',
    fields: [
      ['localHttp.url', 'Endpoint URL', 'http://localhost:9000/tts'],
      ['localHttp.method', 'Method', 'POST'],
      ['localHttp.headers', 'Headers JSON', '{"Authorization":"Bearer ..."}'],
      ['localHttp.model', 'Model', 'optional'],
      ['localHttp.voice', 'Voice', 'optional'],
    ],
  },
] as const;

interface CheckState {
  status: 'idle' | 'loading' | 'ready' | 'reachable' | 'missing' | 'offline' | 'unhealthy' | 'error';
  message: string;
}

export function ApiKeysPanel() {
  const { providerSettings, setProviderSetting } = useStore();
  const [visible, setVisible] = useState<Record<string, boolean>>({});
  const [checks, setChecks] = useState<Record<string, CheckState>>({});

  const runCheck = async (provider: string) => {
    setChecks((current) => ({
      ...current,
      [provider]: { status: 'loading', message: 'Checking configuration...' },
    }));

    try {
      const response = await fetch('/api/providers/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, providerSettings }),
      });
      const data = await response.json();
      setChecks((current) => ({
        ...current,
        [provider]: {
          status: data.status || (response.ok ? 'ready' : 'error'),
          message: data.message || 'No response message.',
        },
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not run provider check.';
      setChecks((current) => ({
        ...current,
        [provider]: { status: 'error', message },
      }));
    }
  };

  return (
    <div className="h-full overflow-y-auto px-6 py-5 lg:px-8 lg:py-6">
      <div className="mx-auto flex max-w-[1200px] flex-col gap-5">

        <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {sections.map((section) => {
            const check = checks[section.provider] || { status: 'idle', message: '' };
            const isOk = check.status === 'ready' || check.status === 'reachable';
            const isBad = check.status === 'missing' || check.status === 'offline' || check.status === 'unhealthy' || check.status === 'error';

            return (
              <div key={section.title} className="glass-card rounded-xl p-4">
                {/* Header */}
                <div className="flex items-start justify-between mb-1">
                  <div className="text-[13px] font-semibold text-foreground">{section.title}</div>
                  <div className="flex items-center gap-2 shrink-0">
                    {check.status !== 'idle' && (
                      <span className={`inline-block h-2 w-2 rounded-full ${isOk ? 'bg-accent-mint' : isBad ? 'bg-accent-rose' : 'bg-accent-amber animate-pulse'}`} />
                    )}
                    <button onClick={() => void runCheck(section.provider)} className="rounded-lg glass-btn px-2.5 py-1 text-[10px] font-medium text-foreground">
                      Test
                    </button>
                  </div>
                </div>
                <div className="text-[10px] text-muted mb-3 leading-4">{section.description}</div>

                {/* Status message */}
                {check.message && (
                  <div className={`rounded-lg border px-3 py-1.5 text-[10px] leading-4 mb-3 ${
                    isOk ? 'border-accent-mint/30 bg-accent-mint/10 text-accent-mint'
                    : isBad ? 'border-accent-rose/30 bg-accent-rose/10 text-accent-rose'
                    : 'border-accent-amber/30 bg-accent-amber/10 text-accent-amber'
                  }`}>
                    {check.message}
                  </div>
                )}

                {/* Fields */}
                <div className="space-y-2">
                  {section.fields.map(([key, label, placeholder]) => {
                    const isSecret = key.toLowerCase().includes('key');
                    return (
                      <div key={key} className="flex items-center gap-2">
                        <label className="text-[10px] text-muted w-[70px] shrink-0 text-right">{label}</label>
                        <input
                          type={isSecret && !visible[key] ? 'password' : 'text'}
                          value={providerSettings[key] || ''}
                          onChange={(event) => setProviderSetting(key, event.target.value)}
                          placeholder={placeholder}
                          className="glass-input flex-1 rounded-lg px-2.5 py-1.5 text-[11px] text-foreground font-mono"
                        />
                        {isSecret && (
                          <button onClick={() => setVisible((current) => ({ ...current, [key]: !current[key] }))} className="rounded-md glass-btn px-2 py-1 text-[9px] font-medium text-foreground shrink-0">
                            {visible[key] ? 'Hide' : 'Show'}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </section>
      </div>
    </div>
  );
}
