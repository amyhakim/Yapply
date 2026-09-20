class PcmCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buffer = new Float32Array(2048);
    this.offset = 0;
  }

  process(inputs) {
    const channel = inputs[0]?.[0];
    if (!channel) return true;
    let cursor = 0;
    while (cursor < channel.length) {
      const count = Math.min(this.buffer.length - this.offset, channel.length - cursor);
      this.buffer.set(channel.subarray(cursor, cursor + count), this.offset);
      this.offset += count;
      cursor += count;
      if (this.offset === this.buffer.length) {
        this.port.postMessage(this.buffer, [this.buffer.buffer]);
        this.buffer = new Float32Array(2048);
        this.offset = 0;
      }
    }
    return true;
  }
}

registerProcessor("pcm-capture", PcmCaptureProcessor);
