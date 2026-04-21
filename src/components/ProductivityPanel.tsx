import React, { useMemo, useState } from 'react';
import { useStore } from '@/src/store/useStore';

function downloadTextFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

export function ProductivityPanel() {
  const { currentText, history, profiles, providerSettings } = useStore();
  const [copied, setCopied] = useState(false);
  const [exportTitle, setExportTitle] = useState('nadabramha-workspace');

  const workspaceReport = useMemo(() => {
    const configuredProviders = Object.entries(providerSettings)
      .filter(([, value]) => Boolean(value))
      .map(([key]) => key.split('.')[0])
      .filter((value, index, all) => all.indexOf(value) === index)
      .sort();

    return [
      '# NadaBramha Workspace Snapshot',
      '',
      `Generated: ${new Date().toISOString()}`,
      '',
      '## Current Script',
      currentText || 'No active script in the editor.',
      '',
      '## Saved Draft Count',
      String(history.length),
      '',
      '## Saved Voice Profiles',
      profiles.length === 0 ? '- No saved profiles yet.' : profiles.map((profile) => `- ${profile.name} (${profile.provider}, ${profile.voiceId || profile.voiceLabel || 'default voice'})`).join('\n'),
      '',
      '## Configured Provider Families',
      configuredProviders.length === 0 ? '- None configured yet.' : configuredProviders.map((item) => `- ${item}`).join('\n'),
      '',
      '## Draft Preview',
      history.slice(0, 10).map((entry, index) => `${index + 1}. [${entry.provider}] ${entry.text}`).join('\n') || 'No drafts saved yet.',
    ].join('\n');
  }, [currentText, history, profiles, providerSettings]);

  const exportJson = () => {
    downloadTextFile(
      JSON.stringify({
        exportedAt: new Date().toISOString(),
        currentText,
        history,
        profiles,
        providerSettings,
      }, null, 2),
      `${exportTitle}.json`,
      'application/json'
    );
  };

  const exportMarkdown = () => {
    downloadTextFile(workspaceReport, `${exportTitle}.md`, 'text/markdown');
  };

  const copySummary = async () => {
    await navigator.clipboard.writeText(workspaceReport);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div className="h-full overflow-y-auto px-6 py-5 lg:px-8 lg:py-6">
      <div className="mx-auto flex max-w-[1180px] flex-col gap-5">

        <section className="grid gap-5 xl:grid-cols-[320px_1fr]">
          {/* Controls */}
          <div className="glass-card rounded-xl p-5 flex flex-col gap-4">
            <div className="text-[11px] uppercase tracking-[0.2em] text-primary/80">Export</div>
            <div className="grid gap-3 grid-cols-3">
              <MetricCard label="Drafts" value={String(history.length)} />
              <MetricCard label="Profiles" value={String(profiles.length)} />
              <MetricCard label="Chars" value={`${currentText.trim().length}`} />
            </div>
            <div>
              <label className="mb-1.5 block text-[11px] text-muted">File name prefix</label>
              <input value={exportTitle} onChange={(event) => setExportTitle(event.target.value || 'nadabramha-workspace')} className="glass-input w-full rounded-lg px-3 py-2 text-[12px] text-foreground" />
            </div>
            <button onClick={exportMarkdown} className="w-full rounded-lg glass-btn-primary px-4 py-2.5 text-[12px] font-semibold text-white">
              Export Markdown
            </button>
            <button onClick={exportJson} className="w-full rounded-lg glass-btn px-4 py-2.5 text-[12px] font-medium text-foreground">
              Export JSON
            </button>
            <button onClick={() => void copySummary()} className="w-full rounded-lg glass-btn px-4 py-2.5 text-[12px] font-medium text-foreground">
              {copied ? 'Copied ✓' : 'Copy to Clipboard'}
            </button>
          </div>

          {/* Preview */}
          <div className="glass-card rounded-xl p-5">
            <div className="text-[11px] uppercase tracking-[0.2em] text-primary/80 mb-3">Preview</div>
            <pre className="max-h-[540px] overflow-auto rounded-lg glass p-4 text-[11px] leading-5 text-foreground whitespace-pre-wrap">
              {workspaceReport}
            </pre>
          </div>
        </section>
      </div>
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg glass p-3 text-center">
      <div className="text-[9px] uppercase tracking-[0.18em] text-muted">{label}</div>
      <div className="mt-1 text-[18px] font-semibold text-foreground">{value}</div>
    </div>
  );
}
