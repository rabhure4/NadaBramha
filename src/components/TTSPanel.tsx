import React, { useState } from 'react';
import { useStore } from '@/src/store/useStore';
import { getAudioExtension, getProviderVoice, providerOptions } from '@/src/lib/tts';
import { useTTS } from '@/src/hooks/useTTS';
import { audioBufferToWav, decodeAudioBlob } from '@/src/lib/audio';

const cardClass = 'glass-card rounded-[24px] p-5';
const fieldClassName = 'w-full rounded-xl glass-input px-3 py-2.5 text-[13px] text-foreground';

export function TTSPanel({ onOpenEditor }: { onOpenEditor: () => void }) {
  const {
    currentText,
    setCurrentText,
    provider,
    setProvider,
    speed,
    setSpeed,
    pitch,
    setPitch,
    volume,
    setVolume,
    tone,
    setTone,
    emotion,
    setEmotion,
    webVoiceURI,
    setWebVoiceURI,
    providerSettings,
    setProviderSetting,
    lastAudioUrl,
    lastAudioMimeType,
    addAnalyticsEvent,
  } = useStore();

  const { play, playStream, stop, synthesizeToBlob, isPlaying, isSynthesizing, isStreaming, availableWebVoices, lastError, lastStatus } = useTTS();
  const [downloadFormat, setDownloadFormat] = useState<'wav' | 'original'>('original');
  const [isGeneratingFile, setIsGeneratingFile] = useState(false);

  const selectedVoice = provider === 'web' ? webVoiceURI : getProviderVoice(provider, providerSettings, webVoiceURI);
  const selectedProviderMeta = providerOptions.find((option) => option.key === provider);
  const canStream = Boolean(selectedProviderMeta?.supportsStreaming && provider !== 'web');

  const handleDownload = async () => {
    if (!lastAudioUrl) return;
    try {
      let downloadUrl = lastAudioUrl;
      let ext = getAudioExtension(lastAudioMimeType);

      // Convert to WAV if requested and source isn't already WAV
      if (downloadFormat === 'wav' && lastAudioMimeType && !lastAudioMimeType.includes('wav')) {
        const response = await fetch(lastAudioUrl);
        const blob = await response.blob();
        const buffer = await decodeAudioBlob(blob);
        const wavBlob = audioBufferToWav(buffer);
        downloadUrl = URL.createObjectURL(wavBlob);
        ext = 'wav';
      }

      const anchor = document.createElement('a');
      anchor.href = downloadUrl;
      anchor.download = `nadabramha-${provider}-${Date.now()}.${ext}`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);

      if (downloadUrl !== lastAudioUrl) {
        URL.revokeObjectURL(downloadUrl);
      }

      addAnalyticsEvent({
        id: Date.now().toString(),
        timestamp: Date.now(),
        type: 'download',
        provider,
        charCount: currentText.length,
        durationMs: 0,
      });
    } catch (error) {
      console.error('Download failed:', error);
    }
  };

  const handleGenerateFile = async () => {
    if (provider === 'web' || !currentText.trim()) return;
    setIsGeneratingFile(true);
    try {
      const blob = await synthesizeToBlob();
      const url = URL.createObjectURL(blob);
      const previousUrl = useStore.getState().lastAudioUrl;
      if (previousUrl?.startsWith('blob:')) URL.revokeObjectURL(previousUrl);
      useStore.getState().setLastAudioUrl(url);
      useStore.getState().setLastAudioMimeType(blob.type || null);
    } catch {
      // error shown via useTTS hook
    } finally {
      setIsGeneratingFile(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto px-6 py-5 lg:px-8 lg:py-6">
      <div className="mx-auto flex max-w-[1320px] flex-col gap-5">

        <section className="grid gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.7fr)]">
          {/* Left: Script + Controls */}
          <div className="flex flex-col gap-5">
            <div className={cardClass}>
              <div className="mb-3 flex items-center justify-between">
                <span className="text-[11px] uppercase tracking-[0.2em] text-primary/80">Script</span>
                <span className="text-[11px] text-muted">{currentText.trim().length} chars</span>
              </div>
              <textarea
                value={currentText}
                onChange={(event) => setCurrentText(event.target.value)}
                placeholder="Write the line, paragraph, dialogue, or narration you want to hear..."
                className="min-h-[260px] w-full resize-none rounded-2xl glass-input px-4 py-4 text-[14px] leading-7 text-foreground"
              />
            </div>

            <div className="grid gap-4 grid-cols-3 xl:grid-cols-5">
              <div className={cardClass}>
                <div className="text-[10px] uppercase tracking-[0.18em] text-muted mb-2">Speed</div>
                <div className="text-[18px] font-semibold text-foreground">{speed.toFixed(2)}x</div>
                <input type="range" min={0.6} max={2} step={0.05} value={speed} onChange={(event) => setSpeed(parseFloat(event.target.value))} className="mt-2 w-full" />
              </div>
              <div className={cardClass}>
                <div className="text-[10px] uppercase tracking-[0.18em] text-muted mb-2">Pitch</div>
                <div className="text-[18px] font-semibold text-foreground">{pitch.toFixed(2)}x</div>
                <input type="range" min={0.5} max={2} step={0.05} value={pitch} onChange={(event) => setPitch(parseFloat(event.target.value))} className="mt-2 w-full" />
              </div>
              <div className={cardClass}>
                <div className="text-[10px] uppercase tracking-[0.18em] text-muted mb-2">Volume</div>
                <div className="text-[18px] font-semibold text-foreground">{Math.round(volume * 100)}%</div>
                <input type="range" min={0.1} max={1} step={0.05} value={volume} onChange={(event) => setVolume(parseFloat(event.target.value))} className="mt-2 w-full" />
              </div>
              {(provider === 'azure' || provider === 'polly-proxy') && (
                <>
                  <div className={cardClass}>
                    <label className="text-[10px] uppercase tracking-[0.18em] text-muted">Tone <span className="text-[9px] opacity-60">(SSML)</span></label>
                    <input value={tone} onChange={(event) => setTone(event.target.value)} className={`${fieldClassName} mt-2`} placeholder={provider === 'azure' ? 'warm, crisp, professional' : 'conversational, news'} />
                  </div>
                  <div className={cardClass}>
                    <label className="text-[10px] uppercase tracking-[0.18em] text-muted">Emotion <span className="text-[9px] opacity-60">(SSML)</span></label>
                    <input value={emotion} onChange={(event) => setEmotion(event.target.value)} className={`${fieldClassName} mt-2`} placeholder={provider === 'azure' ? 'cheerful, calm, sad, excited' : 'conversational, news'} />
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Right: Playback + Provider */}
          <div className="flex flex-col gap-5">
            <div className={cardClass}>
              <div className="flex items-center justify-between mb-3">
                <span className="text-[11px] uppercase tracking-[0.2em] text-primary/80">Playback</span>
                <span className="text-[11px] text-muted font-medium">
                  {isSynthesizing ? 'Generating...' : isPlaying ? 'Playing' : 'Ready'}
                </span>
              </div>
              <div className="text-[12px] text-muted mb-1">
                <span className="text-foreground font-medium">{selectedProviderMeta?.label || provider}</span> · {selectedVoice || 'default voice'} · {isStreaming ? 'streaming' : provider === 'web' ? 'browser' : 'render'}
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <button onClick={() => void play()} disabled={!currentText.trim() || isSynthesizing} className="flex-1 rounded-xl glass-btn-primary px-4 py-2.5 text-[12px] font-semibold disabled:opacity-50">
                  {isSynthesizing ? 'Generating...' : provider === 'web' ? 'Play' : 'Generate & Play'}
                </button>
                {canStream && (
                  <button onClick={() => void playStream()} disabled={!currentText.trim() || isSynthesizing} className="rounded-xl glass-btn px-4 py-2.5 text-[12px] font-semibold text-foreground disabled:opacity-50">
                    {isStreaming ? 'Streaming...' : 'Stream'}
                  </button>
                )}
                <button onClick={stop} className="rounded-xl glass-btn px-4 py-2.5 text-[12px] font-medium text-foreground">Stop</button>
              </div>
              <div className="mt-3 flex gap-2">
                {provider !== 'web' && (
                  <button onClick={() => void handleGenerateFile()} disabled={!currentText.trim() || isSynthesizing || isGeneratingFile} className="rounded-xl glass-btn px-3 py-2 text-[11px] font-medium text-foreground disabled:opacity-40">
                    {isGeneratingFile ? 'Generating...' : 'Generate File'}
                  </button>
                )}
                <select value={downloadFormat} onChange={(e) => setDownloadFormat(e.target.value as 'wav' | 'original')} className="rounded-xl glass-input px-2 py-2 text-[11px] text-foreground">
                  <option value="original">Original Format</option>
                  <option value="wav">WAV</option>
                </select>
                <button onClick={() => void handleDownload()} disabled={!lastAudioUrl || provider === 'web'} className="flex-1 rounded-xl glass-btn px-3 py-2 text-[11px] font-medium text-foreground disabled:opacity-40">
                  {provider === 'web' ? 'Preview Only' : 'Download'}
                </button>
                <button onClick={onOpenEditor} className="rounded-xl glass-btn px-3 py-2 text-[11px] font-medium text-foreground">Open Editor</button>
              </div>
              {provider === 'web' && (
                <div className="mt-2 rounded-lg border border-accent-amber/20 bg-accent-amber/5 px-3 py-2 text-[10px] text-accent-amber leading-4">
                  Web Speech is browser preview only — switch to a TTS server provider (ElevenLabs, Kokoro, Azure, etc.) to generate downloadable audio files.
                </div>
              )}
            </div>

            {lastError && <div className="rounded-2xl border border-accent-rose/20 bg-accent-rose/5 px-4 py-3 text-[12px] leading-5 text-accent-rose">{lastError}</div>}
            {!lastError && lastStatus && <div className="rounded-2xl border border-accent-mint/20 bg-accent-mint/5 px-4 py-3 text-[12px] leading-5 text-accent-mint">{lastStatus}</div>}

            <div className={cardClass}>
              <div className="text-[11px] uppercase tracking-[0.2em] text-primary/80 mb-3">Provider</div>
              <div className="space-y-3">
                <select value={provider} onChange={(event) => setProvider(event.target.value as typeof provider)} className={fieldClassName}>
                  {providerOptions.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}
                </select>

                {provider === 'web' ? (
                  <select value={webVoiceURI} onChange={(event) => setWebVoiceURI(event.target.value)} className={fieldClassName}>
                    <option value="">System default</option>
                    {availableWebVoices.map((voice) => <option key={voice.voiceURI} value={voice.voiceURI}>{voice.name}</option>)}
                  </select>
                ) : (
                  <div className="grid gap-3 grid-cols-2">
                    <input value={providerSettings[`${provider}.voice`] || ''} onChange={(event) => setProviderSetting(`${provider}.voice`, event.target.value)} className={fieldClassName} placeholder="Voice ID" />
                    <input value={providerSettings[`${provider}.model`] || ''} onChange={(event) => setProviderSetting(`${provider}.model`, event.target.value)} className={fieldClassName} placeholder="Model" />
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
