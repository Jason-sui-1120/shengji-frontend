// PCM 音频处理器（AudioWorklet 独立线程）
// 替代废弃的 ScriptProcessorNode——音频处理在专用线程，不阻塞主线程。
// VAD 也下沉到 AudioWorklet——计算 RMS/VAD 事件，只向主线程发送 PCM 块 + speech_start/endpoint 事件，
// 主线程不重复进行高频 PCM→Float32 转换。
class PcmProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.bufferSize = 4096;
    this.buffer = new Float32Array(this.bufferSize);
    this.bufferIndex = 0;
    // VAD 状态
    this.vadSpeaking = false;
    this.vadSpeechStartedAt = 0;
    this.vadLastVoiceAt = 0;
    this.vadLastEndpointAt = 0;
    this.voiceThreshold = 0.012;
    this.silenceThreshold = 0.008;
    this.minSpeechMs = 900;
    this.endSilenceMs = 1900;
    this.maxSegmentMs = 25000;
    this.minEndpointGapMs = 2200;
  }

  getRms(input) {
    let sum = 0;
    for (let i = 0; i < input.length; i += 1) sum += input[i] * input[i];
    return Math.sqrt(sum / input.length);
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || !input[0]) return true;
    const channelData = input[0];

    // 累积到 buffer，满 4096 样本发给主线程
    for (let i = 0; i < channelData.length; i += 1) {
      this.buffer[this.bufferIndex] = channelData[i];
      this.bufferIndex += 1;
      if (this.bufferIndex >= this.bufferSize) {
        // Float32 → Int16 PCM 转换在音频线程完成，主线程只收数据
        const pcm = new Int16Array(this.bufferSize);
        for (let j = 0; j < this.bufferSize; j += 1) {
          const s = Math.max(-1, Math.min(1, this.buffer[j]));
          pcm[j] = s < 0 ? s * 0x8000 : s * 0x7fff;
        }
        this.port.postMessage({ type: "pcm", data: pcm.buffer }, [pcm.buffer]);

        // VAD 在音频线程计算——只向主线程发送 speech_start/endpoint 事件。
        const now = currentTime * 1000;  // currentTime 是秒，转毫秒
        const rms = this.getRms(this.buffer);
        if (rms >= this.voiceThreshold) {
          if (!this.vadSpeaking) {
            this.vadSpeaking = true;
            this.vadSpeechStartedAt = now;
            this.port.postMessage({ type: "vad.speech_start" });
          }
          this.vadLastVoiceAt = now;
        }
        if (this.vadSpeaking) {
          const speechDuration = now - this.vadSpeechStartedAt;
          const silenceDuration = now - this.vadLastVoiceAt;
          const endpointGap = now - this.vadLastEndpointAt;
          if (speechDuration >= this.maxSegmentMs && endpointGap >= this.minEndpointGapMs) {
            this.vadSpeechStartedAt = now;
            this.vadLastEndpointAt = now;
            this.port.postMessage({ type: "vad.endpoint", reason: "max_duration" });
          } else if (silenceDuration >= this.endSilenceMs && speechDuration >= this.minSpeechMs && endpointGap >= this.minEndpointGapMs) {
            this.vadSpeaking = false;
            this.vadLastEndpointAt = now;
            this.port.postMessage({ type: "vad.endpoint", reason: "silence" });
          }
        }

        this.bufferIndex = 0;
      }
    }
    return true;
  }
}

registerProcessor("pcm-processor", PcmProcessor);
