import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type VoiceProvider =
  | 'web'
  | 'elevenlabs'
  | 'azure'
  | 'polly-proxy'
  | 'openai-compatible'
  | 'kokoro'
  | 'piper'
  | 'local-http';

export interface TTSProfile {
  id: string;
  name: string;
  provider: VoiceProvider;
  voiceLabel: string;
  voiceId: string;
  model?: string;
  speed: number;
  pitch: number;
  volume: number;
  tone: string;
  emotion: string;
}

export interface AudioHistory {
  id: string;
  text: string;
  createdAt: number;
  profileId: string | null;
  provider: VoiceProvider;
  audioUrl?: string;
  audioMimeType?: string;
  charCount?: number;
  durationMs?: number;
}

export type AnalyticsEventType = 'generate' | 'download' | 'stream' | 'podcast-render' | 'podcast-download';

export interface AnalyticsEvent {
  id: string;
  timestamp: number;
  type: AnalyticsEventType;
  provider: VoiceProvider;
  charCount: number;
  durationMs: number;
}

interface AppState {
  currentText: string;
  setCurrentText: (text: string) => void;

  provider: VoiceProvider;
  setProvider: (provider: VoiceProvider) => void;

  speed: number;
  setSpeed: (speed: number) => void;
  pitch: number;
  setPitch: (pitch: number) => void;
  volume: number;
  setVolume: (volume: number) => void;
  tone: string;
  setTone: (tone: string) => void;
  emotion: string;
  setEmotion: (emotion: string) => void;

  webVoiceURI: string;
  setWebVoiceURI: (voiceURI: string) => void;

  providerSettings: Record<string, string>;
  setProviderSetting: (key: string, value: string) => void;

  profiles: TTSProfile[];
  saveProfile: (profile: TTSProfile) => void;
  deleteProfile: (id: string) => void;
  applyProfile: (profile: TTSProfile) => void;

  history: AudioHistory[];
  addHistory: (record: AudioHistory) => void;
  deleteHistory: (id: string) => void;
  clearHistory: () => void;

  lastAudioUrl: string | null;
  setLastAudioUrl: (url: string | null) => void;
  lastAudioMimeType: string | null;
  setLastAudioMimeType: (mimeType: string | null) => void;

  analyticsEvents: AnalyticsEvent[];
  addAnalyticsEvent: (event: AnalyticsEvent) => void;
  clearAnalytics: () => void;
}

const defaultProviderSettings: Record<string, string> = {
  'elevenlabs.apiKey': '',
  'elevenlabs.voiceId': 'EXAVITQu4vr4xnSDxMaL',
  'elevenlabs.model': 'eleven_multilingual_v2',
  'azure.apiKey': '',
  'azure.region': 'eastus',
  'azure.voice': 'en-US-JennyNeural',
  'polly.url': '',
  'polly.voice': 'Joanna',
  'polly.engine': 'neural',
  'openai.baseUrl': 'http://localhost:8880',
  'openai.path': '/v1/audio/speech',
  'openai.apiKey': '',
  'openai.model': 'tts-1',
  'openai.voice': 'alloy',
  'kokoro.baseUrl': 'http://localhost:8880',
  'kokoro.path': '/v1/audio/speech',
  'kokoro.apiKey': '',
  'kokoro.model': 'kokoro',
  'kokoro.voice': 'af_sarah',
  'piper.url': 'http://localhost:5000/api/tts',
  'piper.voice': 'en_US-lessac-medium',
  'localHttp.url': 'http://localhost:9000/tts',
  'localHttp.method': 'POST',
  'localHttp.headers': '',
  'localHttp.voice': '',
  'localHttp.model': '',
};

export const useStore = create<AppState>()(
  persist<AppState>(
    (set) => ({
      currentText: '',
      setCurrentText: (text) => set({ currentText: text }),

      provider: 'web' as VoiceProvider,
      setProvider: (provider) => set({ provider }),

      speed: 1,
      setSpeed: (speed) => set({ speed }),
      pitch: 1,
      setPitch: (pitch) => set({ pitch }),
      volume: 1,
      setVolume: (volume) => set({ volume }),
      tone: 'natural',
      setTone: (tone) => set({ tone }),
      emotion: 'neutral',
      setEmotion: (emotion) => set({ emotion }),

      webVoiceURI: '',
      setWebVoiceURI: (webVoiceURI) => set({ webVoiceURI }),

      providerSettings: defaultProviderSettings,
      setProviderSetting: (key, value) =>
        set((state) => ({
          providerSettings: { ...state.providerSettings, [key]: value },
        })),

      profiles: [],
      saveProfile: (profile) => set((state) => ({ profiles: [...state.profiles, profile] })),
      deleteProfile: (id) => set((state) => ({ profiles: state.profiles.filter((profile) => profile.id !== id) })),
      applyProfile: (profile) =>
        set({
          provider: profile.provider,
          speed: profile.speed,
          pitch: profile.pitch,
          volume: profile.volume,
          tone: profile.tone,
          emotion: profile.emotion,
          providerSettings: {
            ...defaultProviderSettings,
            ...useStore.getState().providerSettings,
            [`${profile.provider}.voice`]: profile.voiceId,
            [`${profile.provider}.model`]: profile.model || useStore.getState().providerSettings[`${profile.provider}.model`] || '',
          },
        }),

      history: [],
      addHistory: (record) => set((state) => ({ history: [record, ...state.history] })),
      deleteHistory: (id) => set((state) => ({ history: state.history.filter((record) => record.id !== id) })),
      clearHistory: () => set({ history: [] }),

      lastAudioUrl: null,
      setLastAudioUrl: (lastAudioUrl) => set({ lastAudioUrl }),
      lastAudioMimeType: null,
      setLastAudioMimeType: (lastAudioMimeType) => set({ lastAudioMimeType }),

      analyticsEvents: [],
      addAnalyticsEvent: (event) => set((state) => ({ analyticsEvents: [...state.analyticsEvents, event] })),
      clearAnalytics: () => set({ analyticsEvents: [] }),
    }),
    {
      name: 'nadabramha-storage',
    }
  )
);
