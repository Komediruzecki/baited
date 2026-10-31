import { builtinModules } from 'node:module';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const packageRoot = fileURLToPath(new URL('../', import.meta.url));
const nodeBuiltins = new Set(builtinModules.map((name) => name.replace(/^node:/, '')));

export function isNodeBuiltin(specifier) {
  return specifier.startsWith('node:') || nodeBuiltins.has(specifier);
}

export function nodeBuiltinGuard() {
  return {
    name: 'reject-node-runtime-imports',
    setup(builder) {
      builder.onResolve({ filter: /.*/ }, ({ path }) => {
        if (isNodeBuiltin(path)) {
          return { errors: [{ text: `Node runtime import is forbidden in the edge worker: ${path}` }] };
        }
        return undefined;
      });
    },
  };
}

export async function buildWorker({
  entryPoint = resolve(packageRoot, 'src/index.ts'),
  outfile = resolve(packageRoot, 'dist/worker.js'),
  write = true,
} = {}) {
  // Keep output in memory until every import has passed the edge-only check.
  const result = await build({
    absWorkingDir: packageRoot,
    entryPoints: [entryPoint],
    outfile,
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    external: ['cloudflare:workers'],
    plugins: [nodeBuiltinGuard()],
    metafile: true,
    sourcemap: false,
    write: false,
    logLevel: 'silent',
  });

  for (const output of Object.values(result.metafile.outputs)) {
    for (const dependency of output.imports) {
      if (dependency.path !== 'cloudflare:workers') {
        throw new Error(`Unbundled runtime import is forbidden in the edge worker: ${dependency.path}`);
      }
    }
  }

  if (write) {
    const { mkdir, writeFile } = await import('node:fs/promises');
    const { dirname } = await import('node:path');
    for (const output of result.outputFiles) {
      await mkdir(dirname(output.path), { recursive: true });
      await writeFile(output.path, output.contents);
    }
  }
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (process.argv.length !== 2) {
    console.error('The edge build accepts no arguments. It only writes the local worker bundle.');
    process.exitCode = 1;
  } else {
    try {
      await buildWorker();
      console.log('Built local edge bundle: dist/worker.js');
    } catch (error) {
      console.error(error instanceof Error ? error.message : 'Edge bundle failed.');
      process.exitCode = 1;
    }
  }
}
