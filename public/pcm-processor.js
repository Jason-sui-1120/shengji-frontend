// PCM 音频处理器（AudioWorklet 独立线程）
// 替代废弃的 ScriptProcessorNode——音频处理在专用线程，不阻塞主线程。
class PcmProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.bufferSize = 4096;
    this.buffer = new Float32Array(this.bufferSize);
    this.bufferIndex = 0;
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
        this.port.postMessage(pcm.buffer, [pcm.buffer]);
        this.bufferIndex = 0;
      }
    }
    return true;
  }
}

registerProcessor("pcm-processor", PcmProcessor);
