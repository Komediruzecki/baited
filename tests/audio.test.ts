import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
test('the real audio worklet gates capture, resamples to 16k PCM and clears old buffers', async () => {
  const code = await readFile(new URL('../public/pcm-worklet.js', import.meta.url), 'utf8');
  const packets: { buffer: ArrayBuffer; generation: number }[] = [];
  let Processor: any;
  class Base {
    port = { onmessage: undefined as any, postMessage: (p: any) => packets.push(p) };
  }
  runInNewContext(code, {
    AudioWorkletProcessor: Base,
    sampleRate: 48000,
    registerProcessor: (_name: string, p: any) => {
      Processor = p;
    },
  });
  const processor = new Processor(),
    frame = new Float32Array(128).fill(0.5),
    feed = (n: number) => {
      for (let i = 0; i < n; i++) processor.process([[frame]]);
    };
  feed(48);
  assert.equal(packets.length, 0, 'no capture without an active stream');
  processor.port.onmessage({ data: { enabled: true, generation: 1 } });
  feed(48);
  assert.equal(packets.length, 1);
  assert.equal(packets[0].buffer.byteLength, 4096);
  assert.equal(packets[0].generation, 1);
  assert.ok([...new Int16Array(packets[0].buffer)].every((v) => v === 16383));
  feed(20);
  processor.port.onmessage({ data: { enabled: false, generation: 2 } });
  feed(50);
  assert.equal(packets.length, 1);
  processor.port.onmessage({ data: { enabled: true, generation: 3 } });
  feed(28);
  assert.equal(packets.length, 1, 'pre-pause buffer cannot spill into a new epoch');
  feed(20);
  assert.equal(packets.length, 2);
  assert.equal(packets[1].generation, 3);
});
