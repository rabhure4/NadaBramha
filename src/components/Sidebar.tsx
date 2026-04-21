import React, { useEffect, useMemo, useState } from 'react';
import { useStore } from '@/src/store/useStore';

export function Sidebar() {
  const {
    history,
    setCurrentText,
    profiles,
    saveProfile,
    deleteProfile,
    applyProfile,
    provider,
    speed,
    pitch,
    volume,
    tone,
    emotion,
    providerSettings,
    deleteHistory,
    clearHistory,
  } = useStore();

  const [searchQuery, setSearchQuery] = useState('');
  const [cacheSize, setCacheSize] = useState('0 MB');

  const filteredHistory = useMemo(
    () => history.filter((record) => record.text.toLowerCase().includes(searchQuery.toLowerCase())),
    [history, searchQuery]
  );

  useEffect(() => {
    const stored = localStorage.getItem('nadabramha-storage') || '';
    const mb = parseFloat((stored.length / 1024 / 1024).toFixed(2));
    setCacheSize(mb > 0 ? `${mb} MB` : '0 MB');
  }, [history, profiles]);

  const handleCreateProfile = () => {
    const name = prompt('Profile name');
    if (!name?.trim()) return;
    saveProfile({
      id: Date.now().toString(),
      name: name.trim(),
      provider,
      voiceLabel: providerSettings[`${provider}.voice`] || providerSettings['web.voice'] || 'Current voice',
      voiceId: providerSettings[`${provider}.voice`] || '',
      model: providerSettings[`${provider}.model`] || '',
      speed,
      pitch,
      volume,
      tone,
      emotion,
    });
  };

  return (
    <aside className="h-full overflow-hidden">
      <div className="flex h-full flex-col p-3 gap-3">

        {/* Search */}
        <div className="shrink-0">
          <input
            type="text"
            placeholder="Search drafts..."
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            className="w-full rounded-lg glass-input px-3 py-2 text-[12px] text-foreground"
          />
        </div>

        {/* Drafts */}
        <section className="flex-1 min-h-0 flex flex-col glass-card rounded-xl overflow-hidden">
          <div className="shrink-0 flex items-center justify-between px-3 py-2.5 border-b border-glass-border">
            <span className="text-[10px] uppercase tracking-[0.18em] text-primary/80">Drafts <span className="text-muted font-normal">({filteredHistory.length})</span></span>
            {history.length > 0 && (
              <button onClick={clearHistory} className="text-[10px] text-accent-rose hover:underline">Clear</button>
            )}
          </div>
          <div className="flex-1 overflow-y-auto px-2 py-2">
            {filteredHistory.length === 0 ? (
              <div className="px-2 py-6 text-[11px] italic text-muted text-center">No drafts yet</div>
            ) : (
              <div className="space-y-1.5">
                {filteredHistory.map((record) => (
                  <div key={record.id} className="group rounded-lg glass p-2.5 cursor-pointer hover:bg-white/[0.04] transition-colors" onClick={() => setCurrentText(record.text)}>
                    <div className="line-clamp-2 text-[11px] leading-[1.5] text-foreground">{record.text || 'Untitled'}</div>
                    <div className="mt-1.5 flex items-center justify-between text-[10px] text-muted">
                      <span>{record.provider} · {new Date(record.createdAt).toLocaleDateString()}</span>
                      <button onClick={(e) => { e.stopPropagation(); deleteHistory(record.id); }} className="opacity-0 group-hover:opacity-100 text-accent-rose hover:underline transition-opacity">×</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* Voice Profiles */}
        <section className="shrink-0 glass-card rounded-xl overflow-hidden max-h-[38%] flex flex-col">
          <div className="shrink-0 flex items-center justify-between px-3 py-2.5 border-b border-glass-border">
            <span className="text-[10px] uppercase tracking-[0.18em] text-primary/80">Profiles <span className="text-muted font-normal">({profiles.length})</span></span>
            <button onClick={handleCreateProfile} className="text-[10px] font-medium text-primary hover:underline">+ Snapshot</button>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto px-2 py-2">
            {profiles.length === 0 ? (
              <div className="px-2 py-4 text-[11px] italic text-muted text-center">Save current voice settings as a profile</div>
            ) : (
              <div className="space-y-1.5">
                {profiles.map((profile) => (
                  <div key={profile.id} className="group rounded-lg glass p-2.5 cursor-pointer hover:bg-white/[0.04] transition-colors" onClick={() => applyProfile(profile)}>
                    <div className="text-[11px] font-semibold text-foreground">{profile.name}</div>
                    <div className="mt-0.5 text-[10px] text-muted">{profile.provider} · {profile.voiceId || 'default'} · {profile.speed.toFixed(1)}x</div>
                    <button onClick={(e) => { e.stopPropagation(); deleteProfile(profile.id); }} className="opacity-0 group-hover:opacity-100 mt-1 text-[10px] text-accent-rose hover:underline transition-opacity">Remove</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* Footer */}
        <div className="shrink-0 px-2 text-[10px] text-muted">
          Cache: <span className="text-foreground font-medium">{cacheSize}</span>
        </div>
      </div>
    </aside>
  );
}
