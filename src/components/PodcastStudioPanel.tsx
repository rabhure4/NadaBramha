
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createWaveformPeaks, decodeAudioBlob, mixAudioTimeline, mixMusicTracks, trimAudioBlob } from '@/src/lib/audio';
import { estimateSpeechDuration, getProviderVoice, providerOptions, requestServerTTS } from '@/src/lib/tts';
import { useStore, type TTSProfile, type VoiceProvider } from '@/src/store/useStore';

interface Participant {
  id: string;
  profileId: string;
  name: string;
  provider: VoiceProvider;
  voiceId: string;
  model: string;
  speed: number;
  pitch: number;
  volume: number;
  tone: string;
  emotion: string;
}

interface PodcastClip {
  id: string;
  participantId: string;
  text: string;
  startTime: number;
  durationSeconds: number;
  tone: string;
  emotion: string;
  speed: number;
  waveformPeaks?: number[];
  generatedDuration?: number;
}

interface MusicTrack {
  id: string;
  name: string;
  blob: Blob;
  durationSeconds: number;
  startTime: number;
  volume: number;
  waveformPeaks: number[];
  loop: boolean;
  fadeInSeconds: number;
  fadeOutSeconds: number;
}

type DragMode = 'move' | 'resize-left' | 'resize-right';

const timelineScale = 90;
const gridStep = 0.25;
const snapThreshold = 0.18;
const minClipDuration = 0.75;

function makeParticipant(profiles: TTSProfile[], index: number): Participant {
  const fallbackProfile = profiles[index] || profiles[0];
  return {
    id: `participant-${Date.now()}-${index}`,
    profileId: fallbackProfile?.id || '',
    name: fallbackProfile?.name || `Speaker ${index + 1}`,
    provider: fallbackProfile?.provider || 'kokoro',
    voiceId: fallbackProfile?.voiceId || '',
    model: fallbackProfile?.model || '',
    speed: fallbackProfile?.speed || 1,
    pitch: fallbackProfile?.pitch || 1,
    volume: fallbackProfile?.volume || 1,
    tone: fallbackProfile?.tone || 'natural',
    emotion: fallbackProfile?.emotion || 'neutral',
  };
}

function roundToGrid(value: number) {
  return Math.max(0, Math.round(value / gridStep) * gridStep);
}

export function PodcastStudioPanel() {
  const { profiles, providerSettings, webVoiceURI, addAnalyticsEvent } = useStore();
  const [participants, setParticipants] = useState<Participant[]>(() => [makeParticipant(profiles, 0), makeParticipant(profiles, 1)]);
  const [clips, setClips] = useState<PodcastClip[]>([]);
  const [selectedClipId, setSelectedClipId] = useState<string>('clip-1');
  const [rendering, setRendering] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [statusNote, setStatusNote] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [renderedDuration, setRenderedDuration] = useState<number | null>(null);
  const [draggingClipId, setDraggingClipId] = useState<string | null>(null);
  const [availableWebVoices, setAvailableWebVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [playheadTime, setPlayheadTime] = useState(0);
  const [musicTracks, setMusicTracks] = useState<MusicTrack[]>([]);
  const [downloadFormat, setDownloadFormat] = useState<'wav' | 'mp3'>('wav');
  const musicInputRef = useRef<HTMLInputElement>(null);
  const dragStateRef = useRef<{ clipId: string; mode: DragMode; originX: number; originStart: number; originDuration: number } | null>(null);
  const previewTimersRef = useRef<number[]>([]);
  const previewAudiosRef = useRef<HTMLAudioElement[]>([]);
  const previewStartedAtRef = useRef<number | null>(null);
  const previewDurationRef = useRef(0);
  const previewAnimationRef = useRef<number | null>(null);

  const participantMap = useMemo(() => Object.fromEntries(participants.map((participant) => [participant.id, participant])), [participants]);
  const totalTimelineSeconds = Math.max(30, ...clips.map((clip) => clip.startTime + clip.durationSeconds + 2), ...musicTracks.map((t) => t.startTime + t.durationSeconds + 2));
  const selectedClip = clips.find((clip) => clip.id === selectedClipId) || clips[0] || null;
  const validClips = useMemo(
    () => clips.filter((clip) => clip.text.trim()).map((clip) => ({ clip, participant: participantMap[clip.participantId] })).filter((item): item is { clip: PodcastClip; participant: Participant } => Boolean(item.participant)),
    [clips, participantMap]
  );
  const hasWebSpeechClips = validClips.some((item) => item.participant.provider === 'web');

  useEffect(() => {
    const loadVoices = () => setAvailableWebVoices(window.speechSynthesis.getVoices());
    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;
    return () => {
      window.speechSynthesis.onvoiceschanged = null;
    };
  }, []);

  useEffect(() => {
    if (participants.length >= 2 && clips.length === 0) {
      const firstDuration = estimateSpeechDuration('Welcome back to the show. Today we are breaking down the latest ideas in our project.', participants[0].speed);
      const secondDuration = estimateSpeechDuration('And I am joining with a different perspective, so let us challenge each other a little.', participants[1].speed);
      setClips([
        {
          id: 'clip-1',
          participantId: participants[0].id,
          text: 'Welcome back to the show. Today we are breaking down the latest ideas in our project.',
          startTime: 0,
          durationSeconds: firstDuration,
          tone: 'warm',
          emotion: 'neutral',
          speed: participants[0].speed,
        },
        {
          id: 'clip-2',
          participantId: participants[1].id,
          text: 'And I am joining with a different perspective, so let us challenge each other a little.',
          startTime: roundToGrid(firstDuration + 0.75),
          durationSeconds: secondDuration,
          tone: 'confident',
          emotion: 'engaged',
          speed: participants[1].speed,
        },
      ]);
      setSelectedClipId('clip-1');
    }
  }, [participants, clips.length]);

  useEffect(() => () => stopTimelinePreview(), []);

  useEffect(() => {
    if (!previewing) {
      if (previewAnimationRef.current) {
        window.cancelAnimationFrame(previewAnimationRef.current);
        previewAnimationRef.current = null;
      }
      return;
    }

    const step = () => {
      if (!previewStartedAtRef.current) return;
      const elapsed = (performance.now() - previewStartedAtRef.current) / 1000;
      setPlayheadTime(Math.min(previewDurationRef.current, elapsed));
      previewAnimationRef.current = window.requestAnimationFrame(step);
    };

    previewAnimationRef.current = window.requestAnimationFrame(step);
    return () => {
      if (previewAnimationRef.current) {
        window.cancelAnimationFrame(previewAnimationRef.current);
        previewAnimationRef.current = null;
      }
    };
  }, [previewing]);

  const getSnapTime = (candidate: number, currentClipId: string) => {
    const clipEdges = clips.filter((clip) => clip.id !== currentClipId).flatMap((clip) => [clip.startTime, clip.startTime + clip.durationSeconds]);
    let snapped = roundToGrid(candidate);
    let bestDistance = Math.abs(snapped - candidate);

    clipEdges.forEach((edge) => {
      const distance = Math.abs(edge - candidate);
      if (distance <= snapThreshold && distance < bestDistance) {
        snapped = edge;
        bestDistance = distance;
      }
    });

    return Math.max(0, parseFloat(snapped.toFixed(2)));
  };

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const dragState = dragStateRef.current;
      if (!dragState) return;
      const deltaSeconds = (event.clientX - dragState.originX) / timelineScale;

      setClips((current) =>
        current.map((clip) => {
          if (clip.id !== dragState.clipId) return clip;

          if (dragState.mode === 'move') {
            return { ...clip, startTime: getSnapTime(dragState.originStart + deltaSeconds, clip.id) };
          }

          const originalEnd = dragState.originStart + dragState.originDuration;
          if (dragState.mode === 'resize-right') {
            const nextEnd = getSnapTime(originalEnd + deltaSeconds, clip.id);
            const nextDuration = Math.max(minClipDuration, nextEnd - clip.startTime);
            return { ...clip, durationSeconds: parseFloat(nextDuration.toFixed(2)) };
          }

          const nextStart = getSnapTime(dragState.originStart + deltaSeconds, clip.id);
          const nextDuration = Math.max(minClipDuration, originalEnd - nextStart);
          return {
            ...clip,
            startTime: Math.min(nextStart, originalEnd - minClipDuration),
            durationSeconds: parseFloat(nextDuration.toFixed(2)),
          };
        })
      );
    };

    const stopDragging = () => {
      dragStateRef.current = null;
      setDraggingClipId(null);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', stopDragging);
    window.addEventListener('pointercancel', stopDragging);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', stopDragging);
      window.removeEventListener('pointercancel', stopDragging);
    };
  }, [clips]);

  const stopTimelinePreview = () => {
    previewTimersRef.current.forEach((timerId) => window.clearTimeout(timerId));
    previewTimersRef.current = [];
    previewAudiosRef.current.forEach((audio) => {
      audio.pause();
      audio.src = '';
    });
    previewAudiosRef.current = [];
    window.speechSynthesis.cancel();
    if (previewAnimationRef.current) {
      window.cancelAnimationFrame(previewAnimationRef.current);
      previewAnimationRef.current = null;
    }
    previewStartedAtRef.current = null;
    setPreviewing(false);
    setStatusNote((current) => (current?.includes('preview') ? null : current));
  };

  const updateParticipant = (participantId: string, patch: Partial<Participant>) => {
    setParticipants((current) => current.map((participant) => (participant.id === participantId ? { ...participant, ...patch } : participant)));
  };

  const applyProfileToParticipant = (participantId: string, profileId: string) => {
    const profile = profiles.find((item) => item.id === profileId);
    if (!profile) return;
    updateParticipant(participantId, {
      profileId: profile.id,
      name: profile.name,
      provider: profile.provider,
      voiceId: profile.voiceId,
      model: profile.model || '',
      speed: profile.speed,
      pitch: profile.pitch,
      volume: profile.volume,
      tone: profile.tone,
      emotion: profile.emotion,
    });
  };

  const addParticipant = () => {
    if (participants.length >= 6) return;
    const next = makeParticipant(profiles, participants.length);
    setParticipants((current) => [...current, next]);
  };

  const removeParticipant = (participantId: string) => {
    if (participants.length <= 2) return;
    const remaining = participants.filter((participant) => participant.id !== participantId);
    const remainingIds = new Set(remaining.map((participant) => participant.id));
    setParticipants(remaining);
    setClips((current) => current.filter((clip) => remainingIds.has(clip.participantId)));
  };

  const addClip = (participantId: string) => {
    const participant = participantMap[participantId];
    const participantClips = clips.filter((clip) => clip.participantId === participantId);
    const lastEnd = participantClips.length > 0 ? Math.max(...participantClips.map((clip) => clip.startTime + clip.durationSeconds)) : 0;
    const durationSeconds = estimateSpeechDuration('placeholder speech', participant?.speed || 1);
    const newClip: PodcastClip = {
      id: `clip-${Date.now()}`,
      participantId,
      text: '',
      startTime: roundToGrid(lastEnd + 0.5),
      durationSeconds,
      tone: participant?.tone || 'natural',
      emotion: participant?.emotion || 'neutral',
      speed: participant?.speed || 1,
    };
    setClips((current) => [...current, newClip]);
    setSelectedClipId(newClip.id);
  };

  const updateClip = (clipId: string, patch: Partial<PodcastClip>) => {
    setClips((current) =>
      current.map((clip) => {
        if (clip.id !== clipId) return clip;
        const next = { ...clip, ...patch };
        if (patch.text !== undefined || patch.speed !== undefined) {
          const estimated = estimateSpeechDuration(next.text || 'placeholder speech', next.speed || 1);
          next.durationSeconds = Math.max(minClipDuration, next.generatedDuration ? Math.min(next.durationSeconds, next.generatedDuration) : Math.max(next.durationSeconds, estimated));
        }
        return next;
      })
    );
  };

  const removeClip = (clipId: string) => {
    setClips((current) => current.filter((clip) => clip.id !== clipId));
    if (selectedClipId === clipId) {
      const nextClip = clips.find((clip) => clip.id !== clipId);
      setSelectedClipId(nextClip?.id || '');
    }
  };

  const startClipInteraction = (event: React.PointerEvent, clip: PodcastClip, mode: DragMode) => {
    event.preventDefault();
    event.stopPropagation();
    setSelectedClipId(clip.id);
    setDraggingClipId(clip.id);
    dragStateRef.current = {
      clipId: clip.id,
      mode,
      originX: event.clientX,
      originStart: clip.startTime,
      originDuration: clip.durationSeconds,
    };
  };

  const canUseWebOverlap = () => {
    const webClips = validClips.filter((item) => item.participant.provider === 'web').sort((left, right) => left.clip.startTime - right.clip.startTime);
    for (let index = 1; index < webClips.length; index++) {
      const previous = webClips[index - 1].clip;
      const current = webClips[index].clip;
      if (current.startTime < previous.startTime + previous.durationSeconds) return false;
    }
    return true;
  };

  const handleMusicUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const blob = new Blob([await file.arrayBuffer()], { type: file.type });
      const buffer = await decodeAudioBlob(blob);
      const peaks = await createWaveformPeaks(blob, 80);
      const track: MusicTrack = {
        id: `music-${Date.now()}`,
        name: file.name,
        blob,
        durationSeconds: buffer.duration,
        startTime: 0,
        volume: 0.3,
        waveformPeaks: peaks,
        loop: false,
        fadeInSeconds: 0,
        fadeOutSeconds: 0,
      };
      setMusicTracks((prev) => [...prev, track]);
      setStatusNote(`Added music: ${file.name} (${buffer.duration.toFixed(1)}s)`);
    } catch (err) {
      setStatusNote(`Failed to load music: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
    if (musicInputRef.current) musicInputRef.current.value = '';
  };

  const updateMusicTrack = (trackId: string, patch: Partial<MusicTrack>) => {
    setMusicTracks((prev) => prev.map((t) => (t.id === trackId ? { ...t, ...patch } : t)));
  };

  const removeMusicTrack = (trackId: string) => {
    setMusicTracks((prev) => prev.filter((t) => t.id !== trackId));
  };

  const handlePodcastDownload = () => {
    if (!previewUrl) return;
    const anchor = document.createElement('a');
    anchor.href = previewUrl;
    anchor.download = `nadabramha-podcast-${Date.now()}.wav`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    addAnalyticsEvent({
      id: Date.now().toString(),
      timestamp: Date.now(),
      type: 'podcast-download',
      provider: 'web',
      charCount: validClips.reduce((sum, { clip }) => sum + clip.text.length, 0),
      durationMs: 0,
    });
  };

  const previewTimeline = async () => {
    if (validClips.length < 2) {
      alert('Add at least two spoken clips before previewing.');
      return;
    }

    if (!canUseWebOverlap()) {
      alert('Web Speech clips cannot overlap each other during live preview. Move overlapping browser-voice clips apart or switch them to an audio-file provider.');
      return;
    }

    stopTimelinePreview();
    setPreviewing(true);
    setStatusNote('Running live timeline preview. Web Speech clips play in real time, but only audio-file providers can be exported to the final WAV.');

    const sorted = [...validClips].sort((left, right) => left.clip.startTime - right.clip.startTime);
    const endTime = Math.max(...sorted.map((item) => item.clip.startTime + item.clip.durationSeconds));
    previewDurationRef.current = endTime;
    previewStartedAtRef.current = performance.now();
    setPlayheadTime(0);

    sorted.forEach(({ clip, participant }) => {
      const timerId = window.setTimeout(async () => {
        try {
          if (participant.provider === 'web') {
            const utterance = new SpeechSynthesisUtterance(clip.text);
            utterance.rate = clip.speed || participant.speed;
            utterance.pitch = participant.pitch;
            utterance.volume = participant.volume;
            const selectedVoiceUri = participant.voiceId || webVoiceURI;
            const selectedVoice = availableWebVoices.find((voice) => voice.voiceURI === selectedVoiceUri);
            if (selectedVoice) utterance.voice = selectedVoice;
            window.speechSynthesis.speak(utterance);
            return;
          }

          const blob = await requestServerTTS({
            provider: participant.provider,
            text: clip.text,
            speed: clip.speed || participant.speed,
            pitch: participant.pitch,
            volume: participant.volume,
            tone: clip.tone || participant.tone,
            emotion: clip.emotion || participant.emotion,
            voiceURI: participant.voiceId || getProviderVoice(participant.provider, providerSettings, ''),
            providerSettings: {
              ...providerSettings,
              [`${participant.provider}.voice`]: participant.voiceId,
              [`${participant.provider}.model`]: participant.model,
            },
          });

          const url = URL.createObjectURL(blob);
          const audio = new Audio(url);
          audio.volume = participant.volume;
          audio.onended = () => URL.revokeObjectURL(url);
          previewAudiosRef.current.push(audio);
          await audio.play();
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Clip preview failed.';
          setStatusNote(`Timeline preview issue: ${message}`);
        }
      }, Math.max(0, clip.startTime * 1000));
      previewTimersRef.current.push(timerId);
    });

    const finalTimer = window.setTimeout(() => {
      stopTimelinePreview();
      setStatusNote('Live timeline preview finished.');
    }, Math.max(1000, endTime * 1000 + 1000));
    previewTimersRef.current.push(finalTimer);
  };

  const renderPodcast = async () => {
    if (validClips.length < 2) {
      alert('Add at least two spoken clips before rendering.');
      return;
    }

    if (validClips.some((item) => item.participant.provider === 'web')) {
      alert('Web Speech is now supported in live timeline preview, but final mixed export still needs providers that return audio files. Use Live Preview for browser voices, or switch those speakers to a renderable provider before exporting.');
      return;
    }

    setRendering(true);
    setStatusNote('Rendering podcast mix from audio-file providers...');
    const renderStart = performance.now();
    try {
      const renderedClips = await Promise.all(
        validClips.map(async ({ clip, participant }) => {
          const rawBlob = await requestServerTTS({
            provider: participant.provider,
            text: clip.text,
            speed: clip.speed || participant.speed,
            pitch: participant.pitch,
            volume: participant.volume,
            tone: clip.tone || participant.tone,
            emotion: clip.emotion || participant.emotion,
            voiceURI: participant.voiceId || getProviderVoice(participant.provider, providerSettings, ''),
            providerSettings: {
              ...providerSettings,
              [`${participant.provider}.voice`]: participant.voiceId,
              [`${participant.provider}.model`]: participant.model,
            },
          });

          const trimmedBlob = await trimAudioBlob(rawBlob, clip.durationSeconds);
          const waveformPeaks = await createWaveformPeaks(trimmedBlob, 40);

          return {
            clipId: clip.id,
            blob: trimmedBlob,
            startTime: clip.startTime,
            volume: participant.volume,
            generatedDuration: clip.durationSeconds,
            waveformPeaks,
          };
        })
      );

      setClips((current) =>
        current.map((clip) => {
          const rendered = renderedClips.find((item) => item.clipId === clip.id);
          return rendered ? { ...clip, generatedDuration: rendered.generatedDuration, waveformPeaks: rendered.waveformPeaks } : clip;
        })
      );

      const speechMix = await mixAudioTimeline(renderedClips.map(({ blob, startTime, volume }) => ({ blob, startTime, volume })));

      // Mix background music tracks if any
      const podcastEndTime = Math.max(...validClips.map(({ clip }) => clip.startTime + clip.durationSeconds));
      let finalMix = speechMix;
      if (musicTracks.length > 0) {
        setStatusNote('Mixing background music...');
        finalMix = await mixMusicTracks(
          speechMix,
          musicTracks.map((track) => ({
            blob: track.blob,
            startTime: track.startTime,
            volume: track.volume,
            loop: track.loop,
            fadeInSeconds: track.fadeInSeconds,
            fadeOutSeconds: track.fadeOutSeconds,
            totalDuration: track.loop ? podcastEndTime : Math.min(track.startTime + track.durationSeconds, podcastEndTime),
          })),
        );
      }

      if (previewUrl) URL.revokeObjectURL(previewUrl);
      const url = URL.createObjectURL(finalMix);
      setPreviewUrl(url);
      setRenderedDuration(podcastEndTime);
      setStatusNote('Podcast mix rendered successfully.');
      addAnalyticsEvent({
        id: Date.now().toString(),
        timestamp: Date.now(),
        type: 'podcast-render',
        provider: validClips[0]?.participant.provider || 'web',
        charCount: validClips.reduce((sum, { clip }) => sum + clip.text.length, 0),
        durationMs: Math.round(performance.now() - renderStart),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to render the podcast timeline.';
      console.error(error);
      setStatusNote(message);
      alert(message);
    } finally {
      setRendering(false);
    }
  };

  return (
    <div className="flex h-full overflow-hidden bg-background">
      {/* Sidebar — compact speaker cards + actions */}
      <div className="w-[280px] shrink-0 border-r border-glass-border glass overflow-y-auto">
        <div className="p-4 flex flex-col gap-3">
          {participants.map((participant, index) => (
            <div key={participant.id} className="rounded-xl glass p-3 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-foreground">Speaker {index + 1}</span>
                <button onClick={() => removeParticipant(participant.id)} disabled={participants.length <= 2} className="text-[10px] text-accent-rose disabled:opacity-30">×</button>
              </div>
              <input value={participant.name} onChange={(event) => updateParticipant(participant.id, { name: event.target.value })} className="glass-input w-full rounded px-2 py-1 text-[11px]" placeholder="Name" />
              <div className="grid grid-cols-2 gap-1.5">
                <select value={participant.profileId} onChange={(event) => applyProfileToParticipant(participant.id, event.target.value)} className="glass-input rounded px-1.5 py-1 text-[10px]">
                  <option value="">No profile</option>
                  {profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name}</option>)}
                </select>
                <select value={participant.provider} onChange={(event) => updateParticipant(participant.id, { provider: event.target.value as VoiceProvider })} className="glass-input rounded px-1.5 py-1 text-[10px]">
                  {providerOptions.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}
                </select>
              </div>

              {participant.provider === 'web' ? (
                <select value={participant.voiceId} onChange={(event) => updateParticipant(participant.id, { voiceId: event.target.value })} className="glass-input w-full rounded px-1.5 py-1 text-[10px]">
                  <option value="">Default voice</option>
                  {availableWebVoices.map((voice) => <option key={voice.voiceURI} value={voice.voiceURI}>{voice.name}</option>)}
                </select>
              ) : (
                <div className="grid grid-cols-2 gap-1.5">
                  <input value={participant.voiceId} onChange={(event) => updateParticipant(participant.id, { voiceId: event.target.value })} className="glass-input rounded px-1.5 py-1 text-[10px]" placeholder="Voice" />
                  <input value={participant.model} onChange={(event) => updateParticipant(participant.id, { model: event.target.value })} className="glass-input rounded px-1.5 py-1 text-[10px]" placeholder="Model" />
                </div>
              )}

              <div className="flex items-center gap-2">
                <span className="text-[9px] text-muted w-8">Spd</span>
                <input type="range" min={0.6} max={2} step={0.05} value={participant.speed} onChange={(event) => updateParticipant(participant.id, { speed: parseFloat(event.target.value) })} className="flex-1" />
                <span className="text-[9px] text-muted w-8">{participant.speed.toFixed(1)}x</span>
              </div>
              <button onClick={() => addClip(participant.id)} className="w-full py-1.5 border border-primary/30 text-primary rounded text-[10px] font-medium hover:bg-primary/10">+ Clip</button>
            </div>
          ))}

          <div className="flex gap-2">
            <button onClick={addParticipant} disabled={participants.length >= 6} className="flex-1 py-2 glass-btn-primary text-white rounded text-[11px] font-semibold disabled:opacity-50">+ Speaker</button>
          </div>

          {/* Background Music */}
          <div className="rounded-xl glass p-3 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase tracking-[0.15em] text-primary/80">Background Music</span>
              <button onClick={() => musicInputRef.current?.click()} className="text-[10px] text-primary font-medium hover:underline">+ Add</button>
            </div>
            <input type="file" ref={musicInputRef} hidden accept="audio/*" onChange={(e) => void handleMusicUpload(e)} />
            {musicTracks.length === 0 ? (
              <div className="text-[10px] text-muted italic py-2">No music added yet</div>
            ) : (
              musicTracks.map((track) => (
                <div key={track.id} className="rounded glass p-2 flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-medium text-foreground truncate flex-1">{track.name}</span>
                    <button onClick={() => removeMusicTrack(track.id)} className="text-[10px] text-accent-rose ml-1">×</button>
                  </div>
                  <div className="text-[9px] text-muted">{track.durationSeconds.toFixed(1)}s</div>
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] text-muted w-6">Vol</span>
                    <input type="range" min={0} max={1} step={0.05} value={track.volume} onChange={(e) => updateMusicTrack(track.id, { volume: parseFloat(e.target.value) })} className="flex-1" />
                    <span className="text-[9px] text-muted w-8">{Math.round(track.volume * 100)}%</span>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    <div className="flex items-center gap-1">
                      <span className="text-[9px] text-muted">Start</span>
                      <input type="number" min={0} step={0.5} value={track.startTime} onChange={(e) => updateMusicTrack(track.id, { startTime: Math.max(0, parseFloat(e.target.value) || 0) })} className="glass-input flex-1 rounded px-1 py-0.5 text-[9px] w-12" />
                    </div>
                    <label className="flex items-center gap-1 text-[9px] text-muted cursor-pointer">
                      <input type="checkbox" checked={track.loop} onChange={(e) => updateMusicTrack(track.id, { loop: e.target.checked })} className="rounded" />
                      Loop
                    </label>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    <div className="flex items-center gap-1">
                      <span className="text-[9px] text-muted">Fade in</span>
                      <input type="number" min={0} step={0.5} value={track.fadeInSeconds} onChange={(e) => updateMusicTrack(track.id, { fadeInSeconds: Math.max(0, parseFloat(e.target.value) || 0) })} className="glass-input flex-1 rounded px-1 py-0.5 text-[9px] w-12" />
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-[9px] text-muted">Fade out</span>
                      <input type="number" min={0} step={0.5} value={track.fadeOutSeconds} onChange={(e) => updateMusicTrack(track.id, { fadeOutSeconds: Math.max(0, parseFloat(e.target.value) || 0) })} className="glass-input flex-1 rounded px-1 py-0.5 text-[9px] w-12" />
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="flex flex-col gap-2 mt-1">
            <button onClick={() => void previewTimeline()} disabled={previewing || rendering} className="w-full py-2.5 bg-accent-mint/80 hover:bg-accent-mint text-background rounded text-[11px] font-semibold disabled:opacity-50">
              {previewing ? '▶ Playing...' : '▶ Preview'}
            </button>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={stopTimelinePreview} disabled={!previewing} className="py-2 glass-btn rounded text-[11px] font-medium disabled:opacity-50">Stop</button>
              <button onClick={() => void renderPodcast()} disabled={rendering} className="py-2 bg-foreground/90 hover:bg-foreground text-background rounded text-[11px] font-semibold disabled:opacity-50">
                {rendering ? 'Mixing...' : 'Render'}
              </button>
            </div>
          </div>

          {statusNote && <div className="rounded-lg glass px-3 py-2 text-[10px] text-muted leading-4">{statusNote}</div>}

          {previewUrl && (
            <div className="rounded-lg glass p-3">
              <audio controls className="w-full h-8" src={previewUrl} />
              <div className="flex items-center justify-between mt-2">
                <span className="text-[10px] text-muted">{renderedDuration?.toFixed(1) || '0.0'}s · WAV</span>
                <button onClick={handlePodcastDownload} className="text-[10px] font-semibold text-primary hover:underline">Download WAV</button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Main: Timeline + Clip Editor */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Transport bar */}
        <div className="border-b border-glass-border glass-strong px-5 py-2.5 flex items-center gap-4">
          <span className="text-[11px] font-semibold text-foreground shrink-0">Timeline</span>
          <div className="flex-1 flex items-center gap-3">
            <input
              type="range"
              min={0}
              max={totalTimelineSeconds}
              step={0.05}
              value={playheadTime}
              onChange={(event) => setPlayheadTime(parseFloat(event.target.value))}
              className="flex-1"
            />
            <span className="text-[11px] text-muted font-mono w-16 text-right">{playheadTime.toFixed(1)}s</span>
          </div>
        </div>

        {/* Timeline tracks */}
        <div className="flex-1 overflow-auto p-4">
          <div style={{ minWidth: `${Math.max(totalTimelineSeconds * timelineScale + 200, 960)}px` }}>
            {/* Time ruler */}
            <div className="relative h-6 mb-2 border-b border-glass-border/40">
              {Array.from({ length: Math.ceil(totalTimelineSeconds) + 1 }).map((_, second) => (
                <div key={second} className="absolute top-0 bottom-0 border-l border-glass-border/30" style={{ left: `${second * timelineScale}px` }}>
                  <span className="absolute -top-0.5 left-1 text-[9px] text-muted/60">{second}s</span>
                </div>
              ))}
              <div className="absolute top-0 bottom-0 w-px bg-accent-mint shadow-[0_0_8px_rgba(130,255,202,0.5)]" style={{ left: `${playheadTime * timelineScale}px` }} />
            </div>

            {/* Tracks */}
            <div className="flex flex-col gap-2">
              {participants.map((participant) => (
                <div key={participant.id} className="rounded-lg glass overflow-hidden">
                  <div className="px-3 py-1.5 border-b border-glass-border/40 flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-foreground">{participant.name}</span>
                    <span className="text-[9px] text-muted">{participant.provider}</span>
                  </div>
                  <div className="relative h-[72px]" style={{ width: `${Math.max(totalTimelineSeconds * timelineScale + 200, 900)}px` }}>
                    <div className="absolute top-0 bottom-0 w-px bg-accent-mint/60 pointer-events-none z-10" style={{ left: `${playheadTime * timelineScale}px` }} />
                    {clips.filter((clip) => clip.participantId === participant.id).map((clip) => {
                      const width = Math.max(70, clip.durationSeconds * timelineScale);
                      return (
                        <div key={clip.id} className="absolute top-2" style={{ left: `${clip.startTime * timelineScale}px`, width: `${width}px` }}>
                          <div className={`relative h-[52px] rounded-md border overflow-hidden transition-shadow ${selectedClipId === clip.id ? 'border-primary glass-strong shadow-[0_0_10px_rgba(109,159,255,0.15)]' : 'border-glass-border glass'} ${draggingClipId === clip.id ? 'ring-1 ring-primary/40' : ''}`}>
                            <button type="button" onPointerDown={(event) => startClipInteraction(event, clip, 'resize-left')} className="absolute left-0 top-0 bottom-0 w-2 bg-primary/10 hover:bg-primary/25 cursor-ew-resize" aria-label="Resize start" />
                            <button type="button" onClick={() => setSelectedClipId(clip.id)} onPointerDown={(event) => startClipInteraction(event, clip, 'move')} className="absolute inset-y-0 left-2 right-2 text-left px-2 touch-none select-none cursor-grab active:cursor-grabbing">
                              <div className="text-[10px] font-medium truncate text-foreground/80">{clip.text || participant.name}</div>
                              <div className="mt-1 h-[16px] flex items-end gap-[1px] opacity-70">
                                {(clip.waveformPeaks || Array.from({ length: 24 }).map((_, i) => ((i % 5) + 2) / 8)).map((peak, i) => <div key={i} className="flex-1 bg-primary/50 rounded-full" style={{ height: `${Math.max(15, peak * 100)}%` }} />)}
                              </div>
                              <div className="text-[8px] text-muted mt-0.5">{clip.startTime.toFixed(1)}s · {clip.durationSeconds.toFixed(1)}s</div>
                            </button>
                            <button type="button" onPointerDown={(event) => startClipInteraction(event, clip, 'resize-right')} className="absolute right-0 top-0 bottom-0 w-2 bg-primary/10 hover:bg-primary/25 cursor-ew-resize" aria-label="Resize end" />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}

              {/* Music tracks on timeline */}
              {musicTracks.map((track) => (
                <div key={track.id} className="rounded-lg glass overflow-hidden border-l-2 border-accent-amber/50">
                  <div className="px-3 py-1.5 border-b border-glass-border/40 flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-accent-amber">♫ {track.name}</span>
                    <span className="text-[9px] text-muted">{track.durationSeconds.toFixed(1)}s · {Math.round(track.volume * 100)}% vol{track.loop ? ' · loop' : ''}</span>
                  </div>
                  <div className="relative h-[52px]" style={{ width: `${Math.max(totalTimelineSeconds * timelineScale + 200, 900)}px` }}>
                    <div className="absolute top-0 bottom-0 w-px bg-accent-mint/60 pointer-events-none z-10" style={{ left: `${playheadTime * timelineScale}px` }} />
                    {/* Music clip block */}
                    <div
                      className="absolute top-1.5 h-[36px] rounded-md border border-accent-amber/30 overflow-hidden"
                      style={{
                        left: `${track.startTime * timelineScale}px`,
                        width: `${Math.max(40, (track.loop ? totalTimelineSeconds - track.startTime : track.durationSeconds) * timelineScale)}px`,
                      }}
                    >
                      <div className="h-full flex items-end gap-[1px] px-1 bg-accent-amber/10">
                        {track.waveformPeaks.map((peak, i) => (
                          <div key={i} className="flex-1 bg-accent-amber/40 rounded-full" style={{ height: `${Math.max(10, peak * 100)}%` }} />
                        ))}
                      </div>
                      {/* Fade-in indicator */}
                      {track.fadeInSeconds > 0 && (
                        <div className="absolute top-0 left-0 bottom-0 bg-gradient-to-r from-background/60 to-transparent pointer-events-none" style={{ width: `${track.fadeInSeconds * timelineScale}px` }} />
                      )}
                      {/* Fade-out indicator */}
                      {track.fadeOutSeconds > 0 && (
                        <div className="absolute top-0 right-0 bottom-0 bg-gradient-to-l from-background/60 to-transparent pointer-events-none" style={{ width: `${track.fadeOutSeconds * timelineScale}px` }} />
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Clip editor */}
        <div className="border-t border-glass-border glass-strong px-5 py-3">
          {!selectedClip ? (
            <div className="text-[11px] text-muted">Click a clip to edit</div>
          ) : (
            <div className="flex gap-4 items-start">
              <textarea value={selectedClip.text} onChange={(event) => updateClip(selectedClip.id, { text: event.target.value })} className="glass-input flex-1 min-h-[72px] rounded-lg px-3 py-2 text-[12px]" placeholder="Clip text..." />
              <div className="grid grid-cols-2 gap-2 w-[280px] shrink-0 text-[11px]">
                <div>
                  <label className="text-[9px] uppercase text-muted block mb-0.5">Start</label>
                  <input type="number" min={0} step={0.1} value={selectedClip.startTime} onChange={(event) => updateClip(selectedClip.id, { startTime: Math.max(0, parseFloat(event.target.value) || 0) })} className="glass-input w-full rounded px-2 py-1" />
                </div>
                <div>
                  <label className="text-[9px] uppercase text-muted block mb-0.5">Duration</label>
                  <input type="number" min={minClipDuration} step={0.1} value={selectedClip.durationSeconds} onChange={(event) => updateClip(selectedClip.id, { durationSeconds: Math.max(minClipDuration, parseFloat(event.target.value) || minClipDuration) })} className="glass-input w-full rounded px-2 py-1" />
                </div>
                <div className="col-span-2">
                  <label className="text-[9px] uppercase text-muted block mb-0.5">Speed {selectedClip.speed.toFixed(2)}x</label>
                  <input type="range" min={0.6} max={2} step={0.05} value={selectedClip.speed} onChange={(event) => updateClip(selectedClip.id, { speed: parseFloat(event.target.value) })} className="w-full" />
                </div>
                <button onClick={() => removeClip(selectedClip.id)} className="col-span-2 py-1.5 border border-accent-rose/30 text-accent-rose rounded text-[10px] hover:bg-accent-rose/10">Delete Clip</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

