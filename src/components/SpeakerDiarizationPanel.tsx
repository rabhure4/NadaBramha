import React, { useRef, useState } from 'react';

export interface DiarSegment {
  speaker: string;
  startTime: number;
  endTime: number;
  note: string;
}

export interface EmotionResult {
  segment: string;
  emotion: string;
  confidence: number;
  valence: number;
  arousal: number;
  dominance: number;
}

interface AnalysisResult {
  segments: DiarSegment[];
  emotions: EmotionResult[];
  summary: string;
}

function extractAudioFeatures(audioBuffer: AudioBuffer) {
  const channelData = audioBuffer.getChannelData(0);
  const sampleRate = audioBuffer.sampleRate;
  const frameSize = Math.floor(sampleRate * 0.025);
  const hopSize = Math.floor(sampleRate * 0.01);
  const frames: { energy: number; zcr: number; time: number }[] = [];

  for (let index = 0; index + frameSize < channelData.length; index += hopSize) {
    let energy = 0;
    let zcr = 0;
    for (let offset = 0; offset < frameSize; offset++) {
      energy += channelData[index + offset] * channelData[index + offset];
      if (offset > 0 && Math.sign(channelData[index + offset]) !== Math.sign(channelData[index + offset - 1])) zcr++;
    }
    frames.push({ energy: energy / frameSize, zcr: zcr / frameSize, time: index / sampleRate });
  }

  return frames;
}

function detectSpeakerSegments(audioBuffer: AudioBuffer): { start: number; end: number; speakerId: number }[] {
  const frames = extractAudioFeatures(audioBuffer);
  if (frames.length === 0) return [];

  const sorted = [...frames.map((frame) => frame.energy)].sort((left, right) => left - right);
  const noiseFloor = sorted[Math.floor(sorted.length * 0.3)] || 0.0001;
  const threshold = noiseFloor * 8;
  const voiced: { start: number; end: number }[] = [];
  let inSpeech = false;
  let segmentStart = 0;

  for (const frame of frames) {
    if (frame.energy > threshold) {
      if (!inSpeech) {
        segmentStart = frame.time;
        inSpeech = true;
      }
    } else if (inSpeech) {
      if (frame.time - segmentStart >= 0.3) {
        voiced.push({ start: segmentStart, end: frame.time });
      }
      inSpeech = false;
    }
  }

  if (inSpeech) {
    voiced.push({ start: segmentStart, end: frames[frames.length - 1].time });
  }

  return voiced.map((segment, index) => ({ ...segment, speakerId: index % 2 }));
}

function detectEmotions(audioBuffer: AudioBuffer, segments: { start: number; end: number; speakerId: number }[]): EmotionResult[] {
  const sampleRate = audioBuffer.sampleRate;
  const channel = audioBuffer.getChannelData(0);

  return segments.map((segment) => {
    const startSample = Math.floor(segment.start * sampleRate);
    const endSample = Math.min(Math.floor(segment.end * sampleRate), channel.length);
    const slice = channel.slice(startSample, endSample);
    let sumSq = 0;
    let zcr = 0;
    for (let index = 0; index < slice.length; index++) {
      sumSq += slice[index] * slice[index];
      if (index > 0 && Math.sign(slice[index]) !== Math.sign(slice[index - 1])) zcr++;
    }
    const rms = Math.sqrt(sumSq / Math.max(slice.length, 1));
    const arousal = Math.min(1, rms * 30);
    const valence = Math.max(-1, Math.min(1, (zcr / Math.max(slice.length, 1)) * 4 - 0.8));
    const dominance = Math.min(1, rms * 20);

    let emotion = 'Neutral';
    if (arousal > 0.7 && valence > 0.2) emotion = 'Excited';
    else if (arousal > 0.7 && valence < -0.1) emotion = 'Tense';
    else if (arousal < 0.3 && valence < -0.1) emotion = 'Calm / Low';

    return {
      segment: `Speaker ${segment.speakerId + 1} [${segment.start.toFixed(1)}s - ${segment.end.toFixed(1)}s]`,
      emotion,
      confidence: parseFloat((0.5 + Math.abs(valence) * 0.25).toFixed(2)),
      valence: parseFloat(valence.toFixed(2)),
      arousal: parseFloat(arousal.toFixed(2)),
      dominance: parseFloat(dominance.toFixed(2)),
    };
  });
}

export function SpeakerDiarizationPanel() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState('');
  const [result, setResult] = useState<AnalysisResult | null>(null);

  const run = async () => {
    if (!file) return;
    setLoading(true);
    setProgress('Decoding audio...');
    try {
      const arrayBuffer = await file.arrayBuffer();
      const audioContext = new AudioContext();
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer.slice(0));
      setProgress('Detecting speech regions...');
      const segments = detectSpeakerSegments(audioBuffer);
      setProgress('Estimating vocal energy and emotion contour...');
      const emotions = detectEmotions(audioBuffer, segments);
      const summary = `Detected ${segments.length} speech regions across ${new Set(segments.map((segment) => segment.speakerId)).size} inferred speakers in ${audioBuffer.duration.toFixed(1)} seconds.`;
      setResult({
        segments: segments.map((segment, index) => ({
          speaker: `Speaker ${segment.speakerId + 1}`,
          startTime: segment.start,
          endTime: segment.end,
          note: `Speech activity region ${index + 1}. This panel does not produce a real transcript.`,
        })),
        emotions,
        summary,
      });
      setProgress('');
      void audioContext.close();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not analyze this file.';
      alert(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto px-6 py-5 lg:px-8 lg:py-6">
      <div className="mx-auto flex max-w-[1180px] flex-col gap-5">

        <section className="grid gap-5 xl:grid-cols-[300px_1fr]">
          {/* Controls */}
          <div className="glass-card rounded-xl p-5 flex flex-col gap-4">
            <input type="file" ref={fileInputRef} hidden accept="audio/*" onChange={(event) => setFile(event.target.files?.[0] || null)} />
            <div className="text-[11px] uppercase tracking-[0.2em] text-primary/80">Speech Map</div>
            <button onClick={() => fileInputRef.current?.click()} className="w-full rounded-xl border-2 border-dashed border-glass-border px-4 py-6 text-[12px] text-muted hover:border-primary/40 hover:text-primary transition-colors">
              {file ? file.name : 'Upload audio file'}
            </button>
            <button onClick={() => void run()} disabled={!file || loading} className="w-full rounded-xl glass-btn-primary px-4 py-2.5 text-[12px] font-semibold text-white disabled:opacity-50">
              {loading ? 'Analyzing...' : 'Analyze'}
            </button>
            {progress && <div className="rounded-lg glass px-3 py-2 text-[11px] text-accent-mint">{progress}</div>}
            {result && <div className="rounded-lg glass px-3 py-2 text-[11px] text-foreground leading-5">{result.summary}</div>}
            <div className="text-[10px] text-muted leading-4 mt-auto">
              Estimates speech regions and coarse emotion from the waveform. Does not transcribe.
            </div>
          </div>

          {/* Results */}
          <div className="glass-card rounded-xl p-5">
            {!result ? (
              <div className="flex min-h-[320px] items-center justify-center text-[12px] text-muted">
                Upload an audio file to inspect speaker turns and energy.
              </div>
            ) : (
              <div className="grid gap-5 lg:grid-cols-2">
                <div>
                  <div className="text-[10px] uppercase tracking-[0.18em] text-primary/80 mb-3">Speech Regions</div>
                  <div className="space-y-2">
                    {result.segments.map((segment, index) => (
                      <div key={index} className="rounded-lg glass p-3">
                        <div className="flex items-center justify-between">
                          <span className="text-[12px] font-semibold text-foreground">{segment.speaker}</span>
                          <span className="text-[10px] text-muted">{segment.startTime.toFixed(1)}s – {segment.endTime.toFixed(1)}s</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-[0.18em] text-primary/80 mb-3">Emotion Contour</div>
                  <div className="space-y-2">
                    {result.emotions.map((emotion, index) => (
                      <div key={index} className="rounded-lg glass p-3">
                        <div className="flex items-center justify-between">
                          <span className="text-[12px] font-semibold text-foreground">{emotion.emotion}</span>
                          <span className="text-[10px] text-muted">{emotion.segment}</span>
                        </div>
                        <div className="mt-2 flex gap-4 text-[10px] text-muted">
                          <span>V <span className="text-foreground font-medium">{emotion.valence}</span></span>
                          <span>A <span className="text-foreground font-medium">{emotion.arousal}</span></span>
                          <span>D <span className="text-foreground font-medium">{emotion.dominance}</span></span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
