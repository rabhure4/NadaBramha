import React, { useRef, useState, useEffect, useCallback } from 'react';
import WaveSurfer from 'wavesurfer.js';
import RegionsPlugin from 'wavesurfer.js/dist/plugins/regions.js';

interface Region {
  start: number;
  end: number;
  id: string;
  setOptions: (opts: Record<string, unknown>) => void;
}

export function AudioEditorPanel() {
  const waveformRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WaveSurfer | null>(null);
  const regionsRef = useRef<ReturnType<typeof RegionsPlugin.create> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [loaded, setLoaded] = useState(false);
  const [fileName, setFileName] = useState('');
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrent] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [volumeVal, setVolumeVal] = useState(1);
  const [trimRegion, setTrimRegion] = useState<{ start: number; end: number } | null>(null);
  const [gainDb, setGainDb] = useState(0);
  const [fadeInMs, setFadeInMs] = useState(0);
  const [fadeOutMs, setFadeOutMs] = useState(0);

  const initWaveSurfer = useCallback(() => {
    if (!waveformRef.current) return null;
    wsRef.current?.destroy();

    const regions = RegionsPlugin.create();
    regionsRef.current = regions;

    const ws = WaveSurfer.create({
      container: waveformRef.current,
      waveColor: '#4a7aff',
      progressColor: '#6d9fff',
      cursorColor: '#a0c4ff',
      height: 132,
      barWidth: 2,
      barGap: 1,
      barRadius: 3,
      normalize: true,
      plugins: [regions],
    });

    ws.on('ready', () => {
      setDuration(ws.getDuration());
      setLoaded(true);
    });
    ws.on('timeupdate', (time: number) => setCurrent(time));
    ws.on('play', () => setIsPlaying(true));
    ws.on('pause', () => setIsPlaying(false));
    ws.on('finish', () => setIsPlaying(false));

    regions.on('region-updated', (region: Region) => {
      setTrimRegion({ start: region.start, end: region.end });
    });

    wsRef.current = ws;
    return ws;
  }, []);

  useEffect(() => () => wsRef.current?.destroy(), []);

  const handleFileLoad = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setTrimRegion(null);
    const ws = initWaveSurfer();
    if (!ws) return;

    const url = URL.createObjectURL(file);
    ws.load(url);

    ws.on('ready', () => {
      const totalDuration = ws.getDuration();
      regionsRef.current?.addRegion({
        id: 'trim',
        start: 0,
        end: totalDuration,
        color: 'rgba(15, 118, 110, 0.12)',
        drag: true,
        resize: true,
      });
      setTrimRegion({ start: 0, end: totalDuration });
    });
  };

  const handlePlayPause = () => {
    wsRef.current?.playPause();
  };

  const handleVolumeChange = (value: number) => {
    setVolumeVal(value);
    wsRef.current?.setVolume(value);
  };

  const formatTime = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const remainder = Math.floor(seconds % 60);
    const tenths = Math.floor((seconds % 1) * 10);
    return `${minutes}:${remainder.toString().padStart(2, '0')}.${tenths}`;
  };

  const processAndExport = async () => {
    if (!wsRef.current) return;
    const audioBuffer = wsRef.current.getDecodedData();
    if (!audioBuffer) {
      alert('No audio data loaded yet.');
      return;
    }

    const start = trimRegion?.start ?? 0;
    const end = trimRegion?.end ?? audioBuffer.duration;
    const sampleRate = audioBuffer.sampleRate;
    const startSample = Math.floor(start * sampleRate);
    const endSample = Math.floor(end * sampleRate);
    const length = endSample - startSample;

    if (length <= 0) {
      alert('The trim selection is not valid.');
      return;
    }

    const offlineContext = new OfflineAudioContext(audioBuffer.numberOfChannels, length, sampleRate);
    const trimmedBuffer = offlineContext.createBuffer(audioBuffer.numberOfChannels, length, sampleRate);
    for (let channelIndex = 0; channelIndex < audioBuffer.numberOfChannels; channelIndex++) {
      const source = audioBuffer.getChannelData(channelIndex);
      const destination = trimmedBuffer.getChannelData(channelIndex);
      for (let sampleIndex = 0; sampleIndex < length; sampleIndex++) {
        destination[sampleIndex] = source[startSample + sampleIndex];
      }
    }

    const sourceNode = offlineContext.createBufferSource();
    sourceNode.buffer = trimmedBuffer;

    const gainNode = offlineContext.createGain();
    const linearGain = Math.pow(10, gainDb / 20);
    gainNode.gain.value = linearGain;

    sourceNode.connect(gainNode);
    gainNode.connect(offlineContext.destination);

    if (fadeInMs > 0) {
      gainNode.gain.setValueAtTime(0, 0);
      gainNode.gain.linearRampToValueAtTime(linearGain, fadeInMs / 1000);
    }
    if (fadeOutMs > 0) {
      const fadeStart = length / sampleRate - fadeOutMs / 1000;
      if (fadeStart > 0) {
        gainNode.gain.setValueAtTime(linearGain, fadeStart);
        gainNode.gain.linearRampToValueAtTime(0, length / sampleRate);
      }
    }

    sourceNode.start();
    const rendered = await offlineContext.startRendering();
    const wavBlob = audioBufferToWav(rendered);
    const url = URL.createObjectURL(wavBlob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `edited-${fileName || 'audio'}.wav`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="h-full overflow-y-auto px-6 py-5 lg:px-8 lg:py-6">
      <input type="file" ref={fileInputRef} hidden accept="audio/*" onChange={handleFileLoad} />
      <div className="mx-auto flex max-w-[1180px] flex-col gap-5">

        {!loaded ? (
          <div className="flex flex-col items-center justify-center min-h-[400px] glass-card rounded-2xl p-8">
            <button onClick={() => fileInputRef.current?.click()} className="w-full max-w-[440px] rounded-2xl border-2 border-dashed border-glass-border px-8 py-14 text-center hover:border-primary/40 transition-colors">
              <div className="text-[16px] font-semibold text-foreground">Open an audio file</div>
              <div className="mt-2 text-[12px] text-muted">WAV, MP3, OGG, FLAC — any browser-decodable format</div>
            </button>
          </div>
        ) : (
          <>
            {/* Waveform + Transport */}
            <div className="glass-card rounded-2xl p-5">
              <div className="flex items-center justify-between mb-3">
                <span className="text-[11px] font-medium text-foreground">{fileName}</span>
                <button onClick={() => fileInputRef.current?.click()} className="text-[11px] text-primary font-medium hover:underline">Load another</button>
              </div>
              <div className="rounded-xl glass p-3">
                <div ref={waveformRef} className="w-full" />
              </div>
              <div className="mt-3 flex items-center gap-3">
                <button onClick={handlePlayPause} className="rounded-lg glass-btn-primary px-4 py-2 text-[11px] font-semibold text-white">
                  {isPlaying ? 'Pause' : 'Play'}
                </button>
                <button onClick={() => wsRef.current?.seekTo(0)} className="rounded-lg glass-btn px-3 py-2 text-[11px] font-medium text-foreground">Reset</button>
                <span className="text-[11px] text-muted font-mono">{formatTime(currentTime)} / {formatTime(duration)}</span>
                {trimRegion && (
                  <span className="text-[10px] text-muted ml-auto">Selection: {formatTime(trimRegion.start)} – {formatTime(trimRegion.end)}</span>
                )}
                <div className="flex items-center gap-2 ml-auto">
                  <span className="text-[10px] text-muted">Vol</span>
                  <input type="range" min={0} max={1} step={0.05} value={volumeVal} onChange={(event) => handleVolumeChange(parseFloat(event.target.value))} className="w-20" />
                </div>
              </div>
            </div>

            {/* Processing controls — single row */}
            <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
              <div className="glass-card rounded-xl p-4">
                <div className="text-[10px] uppercase tracking-[0.18em] text-primary/80 mb-2">Trim</div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <label className="text-[10px] text-muted w-8">Start</label>
                    <input
                      type="number" min={0} max={duration} step={0.1}
                      value={trimRegion?.start.toFixed(1) ?? '0'}
                      onChange={(event) => {
                        const value = parseFloat(event.target.value) || 0;
                        setTrimRegion((previous) => ({ start: value, end: previous?.end ?? duration }));
                        const regions = regionsRef.current?.getRegions() || [];
                        regions.forEach((region: Region) => { if (region.id === 'trim') region.setOptions({ start: value }); });
                      }}
                      className="glass-input flex-1 rounded px-2 py-1 text-[11px] text-foreground"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-[10px] text-muted w-8">End</label>
                    <input
                      type="number" min={0} max={duration} step={0.1}
                      value={trimRegion?.end.toFixed(1) ?? duration.toFixed(1)}
                      onChange={(event) => {
                        const value = parseFloat(event.target.value) || duration;
                        setTrimRegion((previous) => ({ start: previous?.start ?? 0, end: value }));
                        const regions = regionsRef.current?.getRegions() || [];
                        regions.forEach((region: Region) => { if (region.id === 'trim') region.setOptions({ end: value }); });
                      }}
                      className="glass-input flex-1 rounded px-2 py-1 text-[11px] text-foreground"
                    />
                  </div>
                </div>
              </div>

              <div className="glass-card rounded-xl p-4">
                <div className="text-[10px] uppercase tracking-[0.18em] text-primary/80 mb-2">Gain</div>
                <div className="text-[18px] font-semibold text-foreground">{gainDb > 0 ? '+' : ''}{gainDb} dB</div>
                <input type="range" min={-20} max={20} step={1} value={gainDb} onChange={(event) => setGainDb(parseInt(event.target.value, 10))} className="mt-2 w-full" />
              </div>

              <div className="glass-card rounded-xl p-4">
                <div className="text-[10px] uppercase tracking-[0.18em] text-primary/80 mb-2">Fades</div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <label className="text-[10px] text-muted w-5">In</label>
                    <input type="range" min={0} max={3000} step={100} value={fadeInMs} onChange={(event) => setFadeInMs(parseInt(event.target.value, 10))} className="flex-1" />
                    <span className="text-[10px] text-muted w-10 text-right">{fadeInMs}ms</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-[10px] text-muted w-5">Out</label>
                    <input type="range" min={0} max={3000} step={100} value={fadeOutMs} onChange={(event) => setFadeOutMs(parseInt(event.target.value, 10))} className="flex-1" />
                    <span className="text-[10px] text-muted w-10 text-right">{fadeOutMs}ms</span>
                  </div>
                </div>
              </div>

              <div className="glass-card rounded-xl p-4 flex flex-col justify-between">
                <div className="text-[10px] uppercase tracking-[0.18em] text-primary/80 mb-2">Export</div>
                <div className="text-[11px] text-muted leading-4 mb-3">Processed WAV with trim, gain, and fades applied.</div>
                <button onClick={() => void processAndExport()} className="w-full rounded-lg glass-btn-primary px-3 py-2 text-[11px] font-semibold text-white">
                  Export WAV
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function audioBufferToWav(buffer: AudioBuffer): Blob {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const format = 1;
  const bitDepth = 16;
  const bytesPerSample = bitDepth / 8;
  const blockAlign = numChannels * bytesPerSample;
  const dataLength = buffer.length * blockAlign;
  const headerLength = 44;
  const totalLength = headerLength + dataLength;

  const arrayBuffer = new ArrayBuffer(totalLength);
  const view = new DataView(arrayBuffer);

  writeString(view, 0, 'RIFF');
  view.setUint32(4, totalLength - 8, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, format, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);
  writeString(view, 36, 'data');
  view.setUint32(40, dataLength, true);

  let offset = 44;
  for (let sampleIndex = 0; sampleIndex < buffer.length; sampleIndex++) {
    for (let channelIndex = 0; channelIndex < numChannels; channelIndex++) {
      const sample = Math.max(-1, Math.min(1, buffer.getChannelData(channelIndex)[sampleIndex]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += 2;
    }
  }

  return new Blob([arrayBuffer], { type: 'audio/wav' });
}

function writeString(view: DataView, offset: number, value: string) {
  for (let index = 0; index < value.length; index++) {
    view.setUint8(offset + index, value.charCodeAt(index));
  }
}
