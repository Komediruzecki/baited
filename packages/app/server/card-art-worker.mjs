import { parentPort, workerData } from 'node:worker_threads';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { dirname, sep } from 'node:path';
import sharp from 'sharp';
import * as tf from '@tensorflow/tfjs';
import { setWasmPaths, setThreadsCount } from '@tensorflow/tfjs-backend-wasm';
import { load } from 'nsfwjs/core';
import { MobileNetV2MidModel as modelDefinition } from 'nsfwjs/models/mobilenet_v2_mid';

// The worker decodes and classifies; it has no credentials and never fetches URLs.
globalThis.fetch = async () => { throw new Error('Network disabled in card artwork worker.'); };
sharp.cache(false);
sharp.concurrency(1);
const require = createRequire(import.meta.url);
setThreadsCount(1);
setWasmPaths(dirname(require.resolve('@tensorflow/tfjs-backend-wasm/dist/tfjs-backend-wasm.wasm')) + sep);
let model;
const limits = workerData.limits;
async function classifier() {
  if (!model) {
    const topology = JSON.stringify((await modelDefinition.modelJson()).default);
    const weights = Buffer.concat(await Promise.all(modelDefinition.weightBundles.map(async (bundle) =>
      Buffer.from((await bundle()).default, 'base64'))));
    const fingerprint = createHash('sha256').update(topology).update(weights).digest('hex');
    if (fingerprint !== workerData.modelSha256) throw new Error('Model fingerprint mismatch.');
    await tf.setBackend('wasm');
    await tf.ready();
    model = await load('MobileNetV2Mid', { modelDefinitions: [modelDefinition] });
  }
  return model;
}
function reject(code = 'invalid_image') { throw Object.assign(new Error('Invalid raster'), { code }); }
function checkHeader(bytes, mime) {
  if (mime === 'image/png') {
    if (bytes.length < 33 || !bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) reject();
    // libvips can read only the first frame of an APNG. Reject animation before decoding.
    let at = 8;
    while (at + 12 <= bytes.length) {
      const length = bytes.readUInt32BE(at), end = at + 12 + length;
      if (end > bytes.length) reject();
      if (bytes.toString('ascii', at + 4, at + 8) === 'acTL') reject();
      at = end;
    }
  } else if (mime === 'image/jpeg') {
    if (bytes[0] !== 255 || bytes[1] !== 216 || bytes[2] !== 255) reject();
  } else if (mime === 'image/webp') {
    if (bytes.toString('ascii', 0, 4) !== 'RIFF' || bytes.toString('ascii', 8, 12) !== 'WEBP') reject();
    let at = 12;
    while (at + 8 <= bytes.length) {
      const length = bytes.readUInt32LE(at + 4), kind = bytes.toString('ascii', at, at + 4);
      if (kind === 'ANIM' || kind === 'ANMF') reject();
      const end = at + 8 + length + (length % 2);
      if (end > bytes.length) reject();
      at = end;
    }
  } else reject();
}

parentPort.on('message', async ({ id, bytes: input, mime }) => {
  try {
    const bytes = Buffer.from(input);
    if (!bytes.length || bytes.length > limits.uploadBytes) reject();
    checkHeader(bytes, mime);
    const options = { failOn: 'warning', limitInputPixels: limits.inputPixels, limitInputChannels: 4, autoOrient: true };
    // Reading the header does not decode the raster. Inspect dimensions first so
    // an excessive pixel count gets a useful error, then cap every pixel decode.
    const metadata = await sharp(bytes, { ...options, limitInputPixels: false }).metadata().catch(() => reject());
    const formats = { 'image/png': 'png', 'image/jpeg': 'jpeg', 'image/webp': 'webp' };
    if (metadata.format !== formats[mime] || !metadata.width || !metadata.height || (metadata.pages ?? 1) !== 1) reject();
    if (metadata.width > limits.inputEdge || metadata.height > limits.inputEdge || metadata.width * metadata.height > limits.inputPixels)
      reject('image_dimensions');
    const decoded = await sharp(bytes, options).resize({ width: limits.outputEdge, height: limits.outputEdge, fit: 'inside', withoutEnlargement: true })
      .toColourspace('srgb').png().timeout({ seconds: 5 }).toBuffer({ resolveWithObject: true }).catch(() => reject());
    // All metadata is removed by default. These exact bytes are stored after approval.
    const network = await classifier();
    const predictions = [];
    for (const background of ['#ffffff', '#100d18']) {
      // Screen the submitted source, rather than trusting only its smaller derivative.
      const raster = await sharp(bytes, options).flatten({ background }).resize(224, 224, { fit: 'fill' })
        .removeAlpha().raw().toBuffer();
      const tensor = tf.tensor3d(new Uint8Array(raster), [224, 224, 3], 'int32');
      try { predictions.push(await network.classify(tensor, 5)); }
      finally { tensor.dispose(); }
    }
    parentPort.postMessage({ id, ok: true, png: decoded.data, width: decoded.info.width, height: decoded.info.height, predictions });
  } catch (error) {
    // Decoder/provider diagnostics may contain data from an upload: send fixed codes only.
    parentPort.postMessage({ id, ok: false, code: error?.code === 'invalid_image' || error?.code === 'image_dimensions' ? error.code : 'scan_unavailable' });
  }
});
