import { createEngine } from '../../../client/sound-lab/keys/engine.ts';
import { recipeForCue } from '../../../client/sound-lab/recipes.ts';
import { createRng } from '../../../client/sound-lab/keys/rng.ts';

// Export the project's existing recipes. No speech or candidate-detection sound.
window.renderBaitSoundtrack = async () => {
  const context = new OfflineAudioContext(2, 32 * 48000, 48000);
  const engine = createEngine(context);
  engine.play(recipeForCue('deal', createRng(2718)), 1.9);
  engine.play(recipeForCue('catch', createRng(31415)), 23.3);
  const result = await context.startRendering();
  const channels = [result.getChannelData(0), result.getChannelData(1)];
  const bytes = new ArrayBuffer(44 + result.length * 4);
  const view = new DataView(bytes);
  const stringAt = (offset, value) => {
    for (let index = 0; index < value.length; index++) view.setUint8(offset + index, value.charCodeAt(index));
  };
  stringAt(0, 'RIFF'); view.setUint32(4, bytes.byteLength - 8, true);
  stringAt(8, 'WAVE'); stringAt(12, 'fmt '); view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); view.setUint16(22, 2, true);
  view.setUint32(24, 48000, true); view.setUint32(28, 192000, true);
  view.setUint16(32, 4, true); view.setUint16(34, 16, true);
  stringAt(36, 'data'); view.setUint32(40, result.length * 4, true);
  for (let frame = 0; frame < result.length; frame++) {
    for (let channel = 0; channel < 2; channel++) {
      const sample = Math.max(-1, Math.min(1, channels[channel][frame]));
      view.setInt16(44 + (frame * 2 + channel) * 2, Math.round(sample * 32767), true);
    }
  }
  let binary = '';
  const array = new Uint8Array(bytes);
  for (let offset = 0; offset < array.length; offset += 8192) {
    binary += String.fromCharCode(...array.subarray(offset, offset + 8192));
  }
  return btoa(binary);
};
