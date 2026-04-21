import { useEffect, useRef, useState } from 'react';
import { useStore } from '@/src/store/useStore';
import { createServerTTSStreamUrl, getProviderVoice, requestServerTTS, wrapWithSSML } from '@/src/lib/tts';

export function useTTS() {
  const {
    currentText,
    provider,
    speed,
    pitch,
    volume,
    tone,
    emotion,
    webVoiceURI,
    providerSettings,
    addHistory,
  } = useStore();

  const [isPlaying, setIsPlaying] = useState(false);
  const [isSynthesizing, setIsSynthesizing] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const [lastStatus, setLastStatus] = useState<string | null>(null);
  const [availableWebVoices, setAvailableWebVoices] = useState<SpeechSynthesisVoice[]>([]);
  const audioElementRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const loadVoices = () => setAvailableWebVoices(window.speechSynthesis.getVoices());
    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;
    return () => {
      window.speechSynthesis.onvoiceschanged = null;
    };
  }, []);

  const stop = () => {
    window.speechSynthesis.cancel();
    if (audioElementRef.current) {
      audioElementRef.current.pause();
      audioElementRef.current.src = '';
      audioElementRef.current = null;
    }
    setIsPlaying(false);
    setIsSynthesizing(false);
    setIsStreaming(false);
    setLastStatus(null);
  };

  const saveHistory = (audioUrl?: string, audioMimeType?: string) => {
    addHistory({
      id: Date.now().toString(),
      text: currentText.length > 120 ? `${currentText.slice(0, 120)}...` : currentText,
      createdAt: Date.now(),
      profileId: null,
      provider,
      audioUrl,
      audioMimeType,
    });
  };

  const playWebSpeech = () => {
    if (!currentText.trim()) return;
    stop();
    setLastError(null);
    setLastStatus('Playing with your browser voice.');
    const utterance = new SpeechSynthesisUtterance(currentText);
    utterance.rate = speed;
    utterance.pitch = pitch;
    utterance.volume = volume;
    if (webVoiceURI) {
      const selectedVoice = availableWebVoices.find((voice) => voice.voiceURI === webVoiceURI);
      if (selectedVoice) utterance.voice = selectedVoice;
    }
    utterance.onstart = () => setIsPlaying(true);
    utterance.onend = () => {
      setIsPlaying(false);
      setLastStatus('Playback finished.');
    };
    utterance.onerror = () => {
      setIsPlaying(false);
      setLastError('Browser speech playback failed.');
    };
    window.speechSynthesis.speak(utterance);
    saveHistory();
  };

  const synthesizeToBlob = async () => {
    if (!currentText.trim()) {
      throw new Error('Enter text before synthesizing.');
    }

    if (provider === 'web') {
      throw new Error('Web Speech does not return an audio file.');
    }

    const voice = getProviderVoice(provider, providerSettings, webVoiceURI);
    return await requestServerTTS({
      provider,
      text: wrapWithSSML(currentText, provider, tone, emotion, voice),
      speed,
      pitch,
      volume,
      tone,
      emotion,
      voiceURI: voice,
      providerSettings,
    });
  };

  const play = async () => {
    if (provider === 'web') {
      playWebSpeech();
      return;
    }

    stop();
    setLastError(null);
    setIsSynthesizing(true);
    setLastStatus('Generating audio...');
    const startMs = performance.now();
    try {
      const blob = await synthesizeToBlob();
      const durationMs = Math.round(performance.now() - startMs);
      const url = URL.createObjectURL(blob);
      const previousUrl = useStore.getState().lastAudioUrl;
      if (previousUrl?.startsWith('blob:')) {
        URL.revokeObjectURL(previousUrl);
      }
      useStore.getState().setLastAudioUrl(url);
      useStore.getState().setLastAudioMimeType(blob.type || null);
      const audio = new Audio(url);
      audio.volume = volume;
      audio.onended = () => {
        setIsPlaying(false);
        setLastStatus('Playback finished.');
      };
      audioElementRef.current = audio;
      await audio.play();
      setIsPlaying(true);
      setLastStatus('Playing generated audio.');
      saveHistory(url, blob.type);
      useStore.getState().addAnalyticsEvent({
        id: Date.now().toString(),
        timestamp: Date.now(),
        type: 'generate',
        provider,
        charCount: currentText.length,
        durationMs,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Audio generation failed.';
      setLastError(message);
      setLastStatus(null);
      throw error;
    } finally {
      setIsSynthesizing(false);
    }
  };

  const playStream = async () => {
    if (provider === 'web') {
      playWebSpeech();
      return;
    }

    stop();
    setLastError(null);
    setIsSynthesizing(true);
    setIsStreaming(true);
    setLastStatus('Opening live stream...');
    try {
      const voice = getProviderVoice(provider, providerSettings, webVoiceURI);
      const streamUrl = await createServerTTSStreamUrl({
        provider,
        text: wrapWithSSML(currentText, provider, tone, emotion, voice),
        speed,
        pitch,
        volume,
        tone,
        emotion,
        voiceURI: voice,
        providerSettings,
      });

      const audio = new Audio(streamUrl);
      audio.volume = volume;
      audio.onplaying = () => {
        setIsPlaying(true);
        setLastStatus('Streaming audio playback.');
      };
      audio.onended = () => {
        setIsPlaying(false);
        setIsStreaming(false);
        setLastStatus('Stream finished.');
      };
      audio.onerror = () => {
        setIsPlaying(false);
        setIsStreaming(false);
        setLastError('Streaming playback failed.');
      };
      audioElementRef.current = audio;
      await audio.play();
      saveHistory(streamUrl, 'audio/mpeg');
      useStore.getState().addAnalyticsEvent({
        id: Date.now().toString(),
        timestamp: Date.now(),
        type: 'stream',
        provider,
        charCount: currentText.length,
        durationMs: 0,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Streaming playback failed.';
      setLastError(message);
      setLastStatus(null);
      throw error;
    } finally {
      setIsSynthesizing(false);
    }
  };

  return {
    play,
    playStream,
    stop,
    synthesizeToBlob,
    isPlaying,
    isSynthesizing,
    isStreaming,
    availableWebVoices,
    lastError,
    lastStatus,
  };
}
