import React, { useState } from 'react';
import { Sidebar } from './Sidebar';
import { TTSPanel } from './TTSPanel';
import { VoiceCloningPanel } from './VoiceCloningPanel';
import { AudioEditorPanel } from './AudioEditorPanel';
import { SpeakerDiarizationPanel } from './SpeakerDiarizationPanel';
import { ApiKeysPanel } from './ApiKeysPanel';
import { AnalyticsPanel } from './AnalyticsPanel';
import { PodcastStudioPanel } from './PodcastStudioPanel';

type Tab = 'tts' | 'podcast' | 'editor' | 'diarization' | 'profiles' | 'analytics' | 'settings';

const tabs: { key: Tab; label: string }[] = [
  { key: 'podcast', label: 'Podcast Lab' },
  { key: 'tts', label: 'Voice Studio' },
  { key: 'editor', label: 'Audio Editor' },
  { key: 'diarization', label: 'Speech Map' },
  { key: 'profiles', label: 'Profiles' },
  { key: 'analytics', label: 'Analytics' },
  { key: 'settings', label: 'Providers' },
];

export function ApplicationShell() {
  const [activeTab, setActiveTab] = useState<Tab>('podcast');
  const showSidebar = activeTab === 'tts';

  return (
    <div className="flex flex-col h-screen w-full bg-background text-foreground overflow-hidden">
      <header className="shrink-0 glass-strong border-b border-glass-border">
        <div className="px-6 py-1.5 flex items-center gap-8">
          <div className="flex items-center gap-2 shrink-0">
            <div className="font-serif tracking-[0.08em] text-[22px] leading-none bg-gradient-to-r from-primary via-accent-rose to-accent-amber bg-clip-text text-transparent">NadaBramha</div>
            <div className="relative h-[66px] w-[66px] -my-[19px]">
              <div
                className="h-full w-full bg-gradient-to-r from-primary via-accent-rose to-accent-amber"
                style={{
                  WebkitMaskImage: 'url(/logo/noun-sound-7524914.png)',
                  WebkitMaskSize: 'contain',
                  WebkitMaskRepeat: 'no-repeat',
                  WebkitMaskPosition: 'center',
                  maskImage: 'url(/logo/noun-sound-7524914.png)',
                  maskSize: 'contain',
                  maskRepeat: 'no-repeat',
                  maskPosition: 'center',
                }}
              />
            </div>
          </div>
          <div className="flex-1 overflow-x-auto flex justify-center">
            <div className="flex gap-1 min-w-max">
              {tabs.map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`nav-chip px-4 py-2 text-[12px] font-medium rounded-lg transition-all duration-200 ${
                    activeTab === tab.key
                      ? 'glass-strong text-foreground shadow-[0_0_12px_rgba(109,159,255,0.12)]'
                      : 'text-muted hover:text-foreground hover:bg-white/[0.04]'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        <div className={`${showSidebar ? 'w-[300px] shrink-0 border-r border-glass-border glass overflow-hidden' : 'hidden'}`}>
          {showSidebar ? <Sidebar /> : <div className="h-full" />}
        </div>
        <main className="flex-1 flex flex-col h-full overflow-hidden">
          <div className="flex-1 overflow-hidden">
            {activeTab === 'podcast' && <PodcastStudioPanel />}
            {activeTab === 'tts' && <TTSPanel onOpenEditor={() => setActiveTab('editor')} />}
            {activeTab === 'editor' && <AudioEditorPanel />}
            {activeTab === 'diarization' && <SpeakerDiarizationPanel />}
            {activeTab === 'profiles' && <VoiceCloningPanel />}
            {activeTab === 'analytics' && <AnalyticsPanel />}
            {activeTab === 'settings' && <ApiKeysPanel />}
          </div>
        </main>
      </div>
    </div>
  );
}
