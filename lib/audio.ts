export function float32ToPcm16(input: Float32Array) {
  const output = new Int16Array(input.length);
  for (let i = 0; i < input.length; i += 1) {
    const sample = Math.max(-1, Math.min(1, input[i]));
    output[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
  }
  return output;
}

export function getRms(input: Float32Array) {
  let sum = 0;
  for (let i = 0; i < input.length; i += 1) {
    sum += input[i] * input[i];
  }
  return Math.sqrt(sum / Math.max(1, input.length));
}

export function createFloat32Resampler(sourceRate: number, targetRate: number) {
  const from = Math.max(1, Number(sourceRate || targetRate));
  const to = Math.max(1, Number(targetRate || sourceRate));
  if (Math.abs(from - to) < 1) return (input: Float32Array) => input;
  const step = from / to;
  let carry = new Float32Array(0);
  let position = 0;

  return (input: Float32Array) => {
    if (!input.length) return input;
    const samples = new Float32Array(carry.length + input.length);
    samples.set(carry, 0);
    samples.set(input, carry.length);
    const output: number[] = [];
    while (position + 1 < samples.length) {
      const left = Math.floor(position);
      const fraction = position - left;
      output.push(samples[left] + (samples[left + 1] - samples[left]) * fraction);
      position += step;
    }
    const consumed = Math.floor(position);
    carry = samples.slice(Math.max(0, consumed));
    position -= consumed;
    return Float32Array.from(output);
  };
}
