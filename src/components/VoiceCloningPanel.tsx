import React, { useRef, useState } from 'react';
import { providerOptions, ssmlProviders } from '@/src/lib/tts';
import { useStore, type VoiceProvider } from '@/src/store/useStore';

interface SampleReadout {
  durationSec: number;
  sampleRate: number;
  channels: number;
  peak: number;
}

async function inspectAudio(file: File): Promise<SampleReadout> {
  const arrayBuffer = await file.arrayBuffer();
  const audioContext = new AudioContext();
  try {
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer.slice(0));
    const channel = audioBuffer.getChannelData(0);
    let peak = 0;
    for (let index = 0; index < channel.length; index++) {
      peak = Math.max(peak, Math.abs(channel[index]));
    }
    return {
      durationSec: audioBuffer.duration,
      sampleRate: audioBuffer.sampleRate,
      channels: audioBuffer.numberOfChannels,
      peak: parseFloat(peak.toFixed(3)),
    };
  } finally {
    void audioContext.close();
  }
}

export function VoiceCloningPanel() {
  const { providerSettings, saveProfile, profiles, deleteProfile, applyProfile } = useStore();
  const [name, setName] = useState('');
  const [provider, setProvider] = useState<VoiceProvider>('kokoro');
  const [tone, setTone] = useState('natural');
  const [emotion, setEmotion] = useState('neutral');
  const [speed, setSpeed] = useState(1);
  const [pitch, setPitch] = useState(1);
  const [volume, setVolume] = useState(1);
  const [voiceId, setVoiceId] = useState('');
  const [model, setModel] = useState('');
  const [analysis, setAnalysis] = useState<SampleReadout | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const result = await inspectAudio(file);
      setAnalysis(result);
      if (!name) setName(file.name.replace(/\.[^.]+$/, ''));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not inspect this sample.';
      alert(message);
    }
  };

  const save = () => {
    if (!name.trim()) {
      alert('Add a profile name first.');
      return;
    }
    saveProfile({
      id: Date.now().toString(),
      name: name.trim(),
      provider,
      voiceLabel: voiceId || providerSettings[`${provider}.voice`] || 'Configured voice',
      voiceId: voiceId || providerSettings[`${provider}.voice`] || '',
      model: model || providerSettings[`${provider}.model`] || '',
      speed,
      pitch,
      volume,
      tone,
      emotion,
    });
    alert(`Saved profile "${name.trim()}".`);
  };

  return (
    <div className="h-full overflow-y-auto px-6 py-5 lg:px-8 lg:py-6">
      <div className="mx-auto flex max-w-[1280px] flex-col gap-5">

        <section className="grid gap-5 xl:grid-cols-[1fr_1fr_1fr]">
          {/* Profile Builder */}
          <div className="glass-card rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <span className="text-[11px] uppercase tracking-[0.2em] text-primary/80">New Profile</span>
            </div>
            <div className="space-y-3">
              <input value={name} onChange={(event) => setName(event.target.value)} className="glass-input w-full rounded-lg px-3 py-2 text-[12px] text-foreground" placeholder="Profile name" />
              <select value={provider} onChange={(event) => setProvider(event.target.value as VoiceProvider)} className="glass-input w-full rounded-lg px-3 py-2 text-[12px] text-foreground">
                {providerOptions.map((option) => (
                  <option key={option.key} value={option.key}>{option.label}</option>
                ))}
              </select>
              <div className="grid gap-2 grid-cols-2">
                <input value={voiceId} onChange={(event) => setVoiceId(event.target.value)} className="glass-input rounded-lg px-3 py-2 text-[12px] text-foreground" placeholder="Voice ID" />
                <input value={model} onChange={(event) => setModel(event.target.value)} className="glass-input rounded-lg px-3 py-2 text-[12px] text-foreground" placeholder="Model" />
              </div>
              {ssmlProviders.includes(provider) && (
                <div className="grid gap-2 grid-cols-2">
                  <input value={tone} onChange={(event) => setTone(event.target.value)} className="glass-input rounded-lg px-3 py-2 text-[12px] text-foreground" placeholder="Tone (SSML)" />
                  <input value={emotion} onChange={(event) => setEmotion(event.target.value)} className="glass-input rounded-lg px-3 py-2 text-[12px] text-foreground" placeholder="Emotion (SSML)" />
                </div>
              )}
              <div className="grid gap-3 grid-cols-3">
                <div>
                  <div className="text-[10px] text-muted mb-1">Speed {speed.toFixed(2)}x</div>
                  <input type="range" min={0.6} max={2} step={0.05} value={speed} onChange={(event) => setSpeed(parseFloat(event.target.value))} className="w-full" />
                </div>
                <div>
                  <div className="text-[10px] text-muted mb-1">Pitch {pitch.toFixed(2)}x</div>
                  <input type="range" min={0.5} max={2} step={0.05} value={pitch} onChange={(event) => setPitch(parseFloat(event.target.value))} className="w-full" />
                </div>
                <div>
                  <div className="text-[10px] text-muted mb-1">Vol {Math.round(volume * 100)}%</div>
                  <input type="range" min={0.1} max={1} step={0.05} value={volume} onChange={(event) => setVolume(parseFloat(event.target.value))} className="w-full" />
                </div>
              </div>
              <button onClick={save} className="w-full rounded-lg glass-btn-primary px-4 py-2.5 text-[12px] font-semibold text-white">Save Profile</button>
            </div>
          </div>

          {/* Saved Profiles */}
          <div className="glass-card rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <span className="text-[11px] uppercase tracking-[0.2em] text-primary/80">Saved Profiles</span>
              <span className="text-[10px] text-muted">{profiles.length}</span>
            </div>
            {profiles.length === 0 ? (
              <div className="flex items-center justify-center h-48 text-[12px] text-muted italic">No profiles saved yet</div>
            ) : (
              <div className="space-y-2 max-h-[460px] overflow-y-auto">
                {profiles.map((profile) => (
                  <div key={profile.id} className="rounded-lg glass p-3">
                    <div className="text-[12px] font-semibold text-foreground">{profile.name}</div>
                    <div className="mt-1 text-[10px] text-muted leading-4">
                      {profile.provider} · {profile.voiceId || profile.voiceLabel || 'default'} · {profile.speed.toFixed(1)}x{ssmlProviders.includes(profile.provider) && profile.tone ? ` · ${profile.tone}` : ''}{ssmlProviders.includes(profile.provider) && profile.emotion ? ` · ${profile.emotion}` : ''}
                    </div>
                    <div className="mt-2 flex gap-2">
                      <button onClick={() => applyProfile(profile)} className="flex-1 rounded-md glass-btn px-2 py-1.5 text-[10px] font-medium text-foreground">Apply</button>
                      <button onClick={() => {
                        setName(profile.name);
                        setProvider(profile.provider);
                        setVoiceId(profile.voiceId);
                        setModel(profile.model || '');
                        setSpeed(profile.speed);
                        setPitch(profile.pitch);
                        setVolume(profile.volume);
                        setTone(profile.tone);
                        setEmotion(profile.emotion);
                      }} className="rounded-md glass-btn px-2 py-1.5 text-[10px] font-medium text-foreground">Edit</button>
                      <button onClick={() => deleteProfile(profile.id)} className="rounded-md glass-btn px-2 py-1.5 text-[10px] font-medium text-accent-rose">Delete</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Reference Sample */}
          <div className="glass-card rounded-xl p-5">
            <div className="text-[11px] uppercase tracking-[0.2em] text-primary/80 mb-4">Reference Sample</div>
            <input type="file" ref={fileInputRef} hidden accept="audio/*" onChange={handleFile} />
            <button onClick={() => fileInputRef.current?.click()} className="w-full rounded-xl border-2 border-dashed border-glass-border px-4 py-8 text-[12px] text-muted hover:border-primary/40 hover:text-primary transition-colors">
              Upload Audio Sample
            </button>

            {analysis ? (
              <div className="mt-4 grid gap-3 grid-cols-2">
                <StatCard label="Duration" value={`${analysis.durationSec.toFixed(1)}s`} />
                <StatCard label="Sample Rate" value={`${analysis.sampleRate} Hz`} />
                <StatCard label="Channels" value={String(analysis.channels)} />
                <StatCard label="Peak" value={String(analysis.peak)} />
              </div>
            ) : (
              <div className="mt-4 text-[11px] text-muted italic">Inspect a reference sample before saving a preset.</div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[22px] glass p-4">
      <div className="text-[11px] uppercase tracking-[0.18em] text-primary/80">{label}</div>
      <div className="mt-2 text-[22px] font-semibold text-foreground">{value}</div>
    </div>
  );
}
