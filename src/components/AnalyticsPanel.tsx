import React, { useMemo } from 'react';
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { useStore, type VoiceProvider } from '@/src/store/useStore';

const PROVIDER_COLORS: Record<string, string> = {
  web: '#6d9fff',
  elevenlabs: '#82ffca',
  azure: '#ff9eb7',
  'polly-proxy': '#ffcf8a',
  'openai-compatible': '#c4b5fd',
  kokoro: '#67e8f9',
  piper: '#fca5a5',
  'local-http': '#a3e635',
};

const EVENT_COLORS: Record<string, string> = {
  generate: '#6d9fff',
  stream: '#82ffca',
  download: '#ffcf8a',
  'podcast-render': '#ff9eb7',
  'podcast-download': '#c4b5fd',
};

function formatDate(timestamp: number): string {
  const d = new Date(timestamp);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function formatHour(timestamp: number): string {
  const d = new Date(timestamp);
  return `${d.getHours().toString().padStart(2, '0')}:00`;
}

export function AnalyticsPanel() {
  const { history, analyticsEvents, clearAnalytics, clearHistory } = useStore();

  // Combine history + analytics for comprehensive data
  const allEvents = useMemo(() => {
    // Build events from history for backwards compat (old entries without analytics)
    const historyEvents = history.map((h) => ({
      timestamp: h.createdAt,
      type: 'generate' as const,
      provider: h.provider,
      charCount: h.charCount || h.text.length,
      durationMs: h.durationMs || 0,
    }));
    const analyticsOnly = analyticsEvents.map((e) => ({
      timestamp: e.timestamp,
      type: e.type,
      provider: e.provider,
      charCount: e.charCount,
      durationMs: e.durationMs,
    }));
    // Deduplicate: if we have analytics events from same time, prefer those
    const analyticsTimestamps = new Set(analyticsOnly.map((e) => e.timestamp));
    const merged = [
      ...historyEvents.filter((e) => !analyticsTimestamps.has(e.timestamp)),
      ...analyticsOnly,
    ];
    return merged.sort((a, b) => a.timestamp - b.timestamp);
  }, [history, analyticsEvents]);

  // --- Stat cards ---
  const totalGenerations = allEvents.length;
  const totalCharacters = allEvents.reduce((sum, e) => sum + e.charCount, 0);
  const totalDurationMs = allEvents.reduce((sum, e) => sum + e.durationMs, 0);
  const avgCharsPerGeneration = totalGenerations > 0 ? Math.round(totalCharacters / totalGenerations) : 0;
  const uniqueProviders = new Set(allEvents.map((e) => e.provider)).size;

  // Most used provider
  const providerCounts = allEvents.reduce<Record<string, number>>((acc, e) => {
    acc[e.provider] = (acc[e.provider] || 0) + 1;
    return acc;
  }, {});
  const mostUsedProvider = (Object.entries(providerCounts) as [string, number][]).sort((a, b) => b[1] - a[1])[0]?.[0] || 'none';

  // --- Timeline chart: generations per day ---
  const dailyData = useMemo(() => {
    const buckets: Record<string, { date: string; generations: number; characters: number; streams: number; downloads: number }> = {};
    allEvents.forEach((e) => {
      const key = formatDate(e.timestamp);
      if (!buckets[key]) buckets[key] = { date: key, generations: 0, characters: 0, streams: 0, downloads: 0 };
      if (e.type === 'generate') buckets[key].generations++;
      if (e.type === 'stream') buckets[key].streams++;
      if (e.type === 'download' || e.type === 'podcast-download') buckets[key].downloads++;
      buckets[key].characters += e.charCount;
    });
    return Object.values(buckets);
  }, [allEvents]);

  // --- Hourly activity chart ---
  const hourlyData = useMemo(() => {
    const hours = Array.from({ length: 24 }, (_, i) => ({
      hour: `${i.toString().padStart(2, '0')}:00`,
      count: 0,
    }));
    allEvents.forEach((e) => {
      const h = new Date(e.timestamp).getHours();
      hours[h].count++;
    });
    return hours;
  }, [allEvents]);

  // --- Provider distribution pie ---
  const providerPieData = useMemo(() => {
    return Object.entries(providerCounts).map(([provider, count]) => ({
      name: provider,
      value: count,
      fill: PROVIDER_COLORS[provider] || '#888',
    }));
  }, [providerCounts]);

  // --- Event type breakdown ---
  const eventTypeData = useMemo(() => {
    const counts: Record<string, number> = {};
    allEvents.forEach((e) => {
      counts[e.type] = (counts[e.type] || 0) + 1;
    });
    return Object.entries(counts).map(([type, count]) => ({
      name: type,
      value: count,
      fill: EVENT_COLORS[type] || '#888',
    }));
  }, [allEvents]);

  // --- Character distribution bar chart ---
  const charDistribution = useMemo(() => {
    const ranges = [
      { label: '1-50', min: 1, max: 50, count: 0 },
      { label: '51-150', min: 51, max: 150, count: 0 },
      { label: '151-300', min: 151, max: 300, count: 0 },
      { label: '301-500', min: 301, max: 500, count: 0 },
      { label: '500+', min: 501, max: Infinity, count: 0 },
    ];
    allEvents.forEach((e) => {
      const range = ranges.find((r) => e.charCount >= r.min && e.charCount <= r.max);
      if (range) range.count++;
    });
    return ranges.map((r) => ({ range: r.label, count: r.count }));
  }, [allEvents]);

  // --- Generation speed (ms) over time ---
  const speedData = useMemo(() => {
    return allEvents
      .filter((e) => e.durationMs > 0)
      .map((e) => ({
        time: new Date(e.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        ms: e.durationMs,
        chars: e.charCount,
      }));
  }, [allEvents]);

  // --- Recent activity table ---
  const recentEvents = useMemo(() => {
    return allEvents.slice(-20).reverse();
  }, [allEvents]);

  const tooltipStyle = {
    contentStyle: {
      background: 'rgba(12,14,20,0.92)',
      border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: '8px',
      fontSize: '11px',
      color: '#e2e8f0',
    },
    itemStyle: { color: '#e2e8f0' },
    labelStyle: { color: '#94a3b8' },
  };

  return (
    <div className="h-full overflow-y-auto px-6 py-5 lg:px-8 lg:py-6">
      <div className="mx-auto max-w-[1400px] flex flex-col gap-5">

        {/* Stat cards */}
        <div className="grid gap-3 grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
          <StatCard label="Total Generations" value={totalGenerations.toLocaleString()} />
          <StatCard label="Total Characters" value={totalCharacters.toLocaleString()} />
          <StatCard label="Avg Chars / Gen" value={avgCharsPerGeneration.toLocaleString()} />
          <StatCard label="Providers Used" value={String(uniqueProviders)} />
          <StatCard label="Most Used" value={mostUsedProvider} />
          <StatCard label="Total Gen Time" value={totalDurationMs > 0 ? `${(totalDurationMs / 1000).toFixed(1)}s` : '—'} />
        </div>

        {/* Row 1: Activity timeline + provider pie */}
        <div className="grid gap-5 xl:grid-cols-[2fr_1fr]">
          <div className="glass-card rounded-xl p-4">
            <div className="text-[11px] uppercase tracking-[0.18em] text-primary/80 mb-3">Generation Activity</div>
            {dailyData.length === 0 ? (
              <div className="h-[200px] flex items-center justify-center text-[12px] text-muted italic">No data yet. Generate some audio to see activity.</div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={dailyData}>
                  <defs>
                    <linearGradient id="gradGen" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6d9fff" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#6d9fff" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gradChars" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#82ffca" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#82ffca" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} />
                  <Tooltip {...tooltipStyle} />
                  <Legend wrapperStyle={{ fontSize: '10px' }} />
                  <Area type="monotone" dataKey="generations" stroke="#6d9fff" fill="url(#gradGen)" strokeWidth={2} name="Generations" />
                  <Area type="monotone" dataKey="streams" stroke="#82ffca" fill="url(#gradChars)" strokeWidth={1.5} name="Streams" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>

          <div className="glass-card rounded-xl p-4">
            <div className="text-[11px] uppercase tracking-[0.18em] text-primary/80 mb-3">Provider Usage</div>
            {providerPieData.length === 0 ? (
              <div className="h-[200px] flex items-center justify-center text-[12px] text-muted italic">No data</div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={providerPieData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={45} outerRadius={80} paddingAngle={2} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                    {providerPieData.map((entry, i) => (
                      <Cell key={i} fill={entry.fill} />
                    ))}
                  </Pie>
                  <Tooltip {...tooltipStyle} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Row 2: Hourly activity + character distribution */}
        <div className="grid gap-5 xl:grid-cols-2">
          <div className="glass-card rounded-xl p-4">
            <div className="text-[11px] uppercase tracking-[0.18em] text-primary/80 mb-3">Hourly Activity</div>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={hourlyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                <XAxis dataKey="hour" tick={{ fontSize: 9, fill: '#64748b' }} axisLine={false} tickLine={false} interval={2} />
                <YAxis tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip {...tooltipStyle} />
                <Bar dataKey="count" fill="#6d9fff" radius={[4, 4, 0, 0]} name="Events" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="glass-card rounded-xl p-4">
            <div className="text-[11px] uppercase tracking-[0.18em] text-primary/80 mb-3">Character Distribution</div>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={charDistribution}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                <XAxis dataKey="range" tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip {...tooltipStyle} />
                <Bar dataKey="count" fill="#82ffca" radius={[4, 4, 0, 0]} name="Generations" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Row 3: Generation speed + event types */}
        <div className="grid gap-5 xl:grid-cols-[2fr_1fr]">
          <div className="glass-card rounded-xl p-4">
            <div className="text-[11px] uppercase tracking-[0.18em] text-primary/80 mb-3">Generation Latency (ms)</div>
            {speedData.length === 0 ? (
              <div className="h-[160px] flex items-center justify-center text-[12px] text-muted italic">Generate with a server provider to track latency</div>
            ) : (
              <ResponsiveContainer width="100%" height={160}>
                <AreaChart data={speedData}>
                  <defs>
                    <linearGradient id="gradSpeed" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#ffcf8a" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#ffcf8a" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                  <XAxis dataKey="time" tick={{ fontSize: 9, fill: '#64748b' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} />
                  <Tooltip {...tooltipStyle} />
                  <Area type="monotone" dataKey="ms" stroke="#ffcf8a" fill="url(#gradSpeed)" strokeWidth={2} name="Latency (ms)" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>

          <div className="glass-card rounded-xl p-4">
            <div className="text-[11px] uppercase tracking-[0.18em] text-primary/80 mb-3">Event Types</div>
            {eventTypeData.length === 0 ? (
              <div className="h-[160px] flex items-center justify-center text-[12px] text-muted italic">No events</div>
            ) : (
              <ResponsiveContainer width="100%" height={160}>
                <PieChart>
                  <Pie data={eventTypeData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={60} label={({ name, value }) => `${name}: ${value}`} labelLine={false}>
                    {eventTypeData.map((entry, i) => (
                      <Cell key={i} fill={entry.fill} />
                    ))}
                  </Pie>
                  <Tooltip {...tooltipStyle} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Recent activity log */}
        <div className="glass-card rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[11px] uppercase tracking-[0.18em] text-primary/80">Recent Activity</span>
            <div className="flex gap-2">
              <button onClick={clearAnalytics} className="text-[10px] text-accent-rose hover:underline">Clear Analytics</button>
              <button onClick={clearHistory} className="text-[10px] text-muted hover:underline">Clear History</button>
            </div>
          </div>
          {recentEvents.length === 0 ? (
            <div className="py-6 text-[12px] text-muted italic text-center">No activity recorded yet</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="text-left text-muted border-b border-glass-border">
                    <th className="py-2 pr-4 font-medium">Time</th>
                    <th className="py-2 pr-4 font-medium">Type</th>
                    <th className="py-2 pr-4 font-medium">Provider</th>
                    <th className="py-2 pr-4 font-medium text-right">Characters</th>
                    <th className="py-2 font-medium text-right">Latency</th>
                  </tr>
                </thead>
                <tbody>
                  {recentEvents.map((event, i) => (
                    <tr key={i} className="border-b border-glass-border/30 text-foreground/80">
                      <td className="py-1.5 pr-4 text-muted">{new Date(event.timestamp).toLocaleString()}</td>
                      <td className="py-1.5 pr-4">
                        <span className="inline-block rounded px-1.5 py-0.5 text-[9px] font-medium" style={{ background: `${EVENT_COLORS[event.type] || '#888'}20`, color: EVENT_COLORS[event.type] || '#888' }}>
                          {event.type}
                        </span>
                      </td>
                      <td className="py-1.5 pr-4">{event.provider}</td>
                      <td className="py-1.5 pr-4 text-right font-mono">{event.charCount}</td>
                      <td className="py-1.5 text-right font-mono text-muted">{event.durationMs > 0 ? `${event.durationMs}ms` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="glass-card rounded-xl p-3">
      <div className="text-[10px] uppercase tracking-[0.15em] text-muted mb-1">{label}</div>
      <div className="text-[18px] font-semibold text-foreground truncate">{value}</div>
    </div>
  );
}
