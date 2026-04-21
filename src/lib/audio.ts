export async function decodeAudioBlob(blob: Blob): Promise<AudioBuffer> {
  const arrayBuffer = await blob.arrayBuffer();
  const audioContext = new AudioContext();
  try {
    return await audioContext.decodeAudioData(arrayBuffer.slice(0));
  } finally {
    void audioContext.close();
  }
}

export async function createWaveformPeaks(blob: Blob, samples = 48): Promise<number[]> {
  const buffer = await decodeAudioBlob(blob);
  const channelData = buffer.getChannelData(0);
  const blockSize = Math.max(1, Math.floor(channelData.length / samples));
  const peaks: number[] = [];

  for (let index = 0; index < samples; index++) {
    const start = index * blockSize;
    const end = Math.min(channelData.length, start + blockSize);
    let peak = 0;
    for (let offset = start; offset < end; offset++) {
      peak = Math.max(peak, Math.abs(channelData[offset]));
    }
    peaks.push(parseFloat(peak.toFixed(3)));
  }

  return peaks;
}

export function audioBufferToWav(buffer: AudioBuffer): Blob {
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
  for (let i = 0; i < buffer.length; i++) {
    for (let channel = 0; channel < numChannels; channel++) {
      const sample = Math.max(-1, Math.min(1, buffer.getChannelData(channel)[i]));
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

export async function mixAudioTimeline(clips: { blob: Blob; startTime: number; volume: number }[]): Promise<Blob> {
  if (clips.length === 0) {
    throw new Error('No clips available to mix.');
  }

  const decoded = await Promise.all(
    clips.map(async (clip) => ({
      ...clip,
      buffer: await decodeAudioBlob(clip.blob),
    }))
  );

  const sampleRate = Math.max(...decoded.map((clip) => clip.buffer.sampleRate));
  const maxEnd = Math.max(...decoded.map((clip) => clip.startTime + clip.buffer.duration));
  const offlineContext = new OfflineAudioContext(2, Math.ceil(maxEnd * sampleRate), sampleRate);

  decoded.forEach((clip) => {
    const source = offlineContext.createBufferSource();
    source.buffer = clip.buffer;
    const gainNode = offlineContext.createGain();
    gainNode.gain.value = clip.volume;
    source.connect(gainNode);
    gainNode.connect(offlineContext.destination);
    source.start(clip.startTime);
  });

  const rendered = await offlineContext.startRendering();
  return audioBufferToWav(rendered);
}

export async function trimAudioBlob(blob: Blob, durationSeconds: number): Promise<Blob> {
  const buffer = await decodeAudioBlob(blob);
  const maxFrames = Math.min(buffer.length, Math.max(1, Math.floor(durationSeconds * buffer.sampleRate)));
  const audioContext = new OfflineAudioContext(buffer.numberOfChannels, maxFrames, buffer.sampleRate);
  const trimmed = audioContext.createBuffer(buffer.numberOfChannels, maxFrames, buffer.sampleRate);

  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    const source = buffer.getChannelData(channel);
    const target = trimmed.getChannelData(channel);
    for (let index = 0; index < maxFrames; index++) {
      target[index] = source[index];
    }
  }

  return audioBufferToWav(trimmed);
}

export interface MusicMixInput {
  blob: Blob;
  startTime: number;
  volume: number;
  loop: boolean;
  fadeInSeconds: number;
  fadeOutSeconds: number;
  totalDuration: number;
}

/**
 * Mixes music tracks into a stereo WAV at the given total duration.
 * Supports fade-in, fade-out, and looping.
 */
export async function mixMusicTracks(
  speechBlob: Blob,
  musicInputs: MusicMixInput[],
): Promise<Blob> {
  if (musicInputs.length === 0) return speechBlob;

  const speechBuffer = await decodeAudioBlob(speechBlob);
  const sampleRate = speechBuffer.sampleRate;
  const totalDuration = Math.max(speechBuffer.duration, ...musicInputs.map((m) => m.totalDuration));
  const totalFrames = Math.ceil(totalDuration * sampleRate);
  const offlineContext = new OfflineAudioContext(2, totalFrames, sampleRate);

  // Speech
  const speechSource = offlineContext.createBufferSource();
  speechSource.buffer = speechBuffer;
  speechSource.connect(offlineContext.destination);
  speechSource.start(0);

  // Music tracks
  for (const input of musicInputs) {
    const musicBuffer = await decodeAudioBlob(input.blob);
    const gainNode = offlineContext.createGain();
    gainNode.gain.value = input.volume;

    // Fade-in
    if (input.fadeInSeconds > 0) {
      gainNode.gain.setValueAtTime(0, input.startTime);
      gainNode.gain.linearRampToValueAtTime(input.volume, input.startTime + input.fadeInSeconds);
    }

    // Fade-out
    if (input.fadeOutSeconds > 0) {
      const fadeOutStart = input.totalDuration - input.fadeOutSeconds;
      if (fadeOutStart > input.startTime) {
        gainNode.gain.setValueAtTime(input.volume, fadeOutStart);
        gainNode.gain.linearRampToValueAtTime(0, input.totalDuration);
      }
    }

    gainNode.connect(offlineContext.destination);

    if (input.loop) {
      const source = offlineContext.createBufferSource();
      source.buffer = musicBuffer;
      source.loop = true;
      source.loopStart = 0;
      source.loopEnd = musicBuffer.duration;
      source.connect(gainNode);
      source.start(input.startTime);
      source.stop(input.totalDuration);
    } else {
      const source = offlineContext.createBufferSource();
      source.buffer = musicBuffer;
      source.connect(gainNode);
      source.start(input.startTime);
    }
  }

  const rendered = await offlineContext.startRendering();
  return audioBufferToWav(rendered);
}
