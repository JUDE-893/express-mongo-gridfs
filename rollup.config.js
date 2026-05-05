import typescript from '@rollup/plugin-typescript';
import terser from '@rollup/plugin-terser';
import { visualizer } from 'rollup-plugin-visualizer';

// Shared external dependencies to reduce duplication
const externalDeps = [
  'express',
  'mongoose',
  'mongodb',
  'multer',
  'fs',
  'path',
  'stream',
  'util',
  'crypto',
  'events',
  'buffer',
  'querystring',
  'url',
  'http',
  'https',
  'zlib',
  'os',
  'net',
  'tls',
  'dns',
  'child_process',
  'cluster',
  'dgram',
  'readline',
  'repl',
  'string_decoder',
  'tls',
  'tty',
  'domain',
  'constants',
  'process',
  'punycode',
  'dgram',
  'console',
  'timers',
  'vm',
  'worker_threads',
  'diagnostics_channel',
  'async_hooks',
  'perf_hooks',
  'trace_events',
  'v8',
  'wasi',
  'inspector',
  'node:http',
  'node:https',
  'node:fs',
  'node:path',
  'node:stream',
  'node:util',
  'node:crypto',
  'node:events',
  'node:buffer',
  'node:querystring',
  'node:url',
  'node:http',
  'node:https',
  'node:zlib',
  'node:os',
  'node:net',
  'node:tls',
  'node:dns',
  'node:child_process',
  'node:cluster',
  'node:dgram',
  'node:readline',
  'node:repl',
  'node:string_decoder',
  'node:tls',
  'node:tty',
  'node:domain',
  'node:constants',
  'node:process',
  'node:punycode',
  'node:dgram',
  'node:console',
  'node:timers',
  'node:vm',
  'node:worker_threads',
  'node:diagnostics_channel',
  'node:async_hooks',
  'node:perf_hooks',
  'node:trace_events',
  'node:v8',
  'node:wasi',
  'node:inspector'
];

export default [
  // ESM build
  {
    input: 'index.ts',
    output: {
      file: 'dist/index.js',
      format: 'es',
      sourcemap: true,
    },
    external: externalDeps,
    plugins: [
      typescript({
        tsconfig: './tsconfig.json',
        declaration: false, // We'll let tsc handle declarations separately
        removeComments: true,
        importHelpers: true,
      }),
      terser({
        format: {
          comments: false
        },
        compress: {
          drop_console: true,
          drop_debugger: true,
          ecma: 2022,
          module: true,
          toplevel: true,
          passes: 3
        },
        mangle: {
          properties: {
            regex: /^__/,
          }
        },
        module: true,
        toplevel: true,
      }),
    ],
  },
  // CJS build
  {
    input: 'index.ts',
    output: {
      file: 'dist/index.cjs',
      format: 'cjs',
      sourcemap: true,
    },
    external: externalDeps, // Use shared external dependencies
    plugins: [
      typescript({
        tsconfig: './tsconfig.json',
        declaration: false, // We'll let tsc handle declarations separately
        removeComments: true,
        importHelpers: true,
      }),
      terser({
        format: {
          comments: false
        },
        compress: {
          drop_console: true,
          drop_debugger: true,
          ecma: 2022,
          module: true,
          toplevel: true,
          passes: 3
        },
        mangle: {
          properties: {
            regex: /^__/, 
          }
        },
        module: true,
        toplevel: true,
      }),
    ],
  },
  // Production build with more aggressive minification
  {
    input: 'index.ts',
    output: {
      file: 'dist/index.min.js',
      format: 'es',
      sourcemap: false,
    },
    external: externalDeps, // Use shared external dependencies
    plugins: [
      typescript({
        tsconfig: './tsconfig.json',
        declaration: false,
        removeComments: true,
        importHelpers: true,
      }),
      terser({
        format: {
          comments: false
        },
        compress: {
          drop_console: true,
          drop_debugger: true,
          ecma: 2022,
          pure_getters: true,
          unsafe: true,
          unsafe_comps: true,
          warnings: false,
          module: true,
          toplevel: true,
          passes: 5
        },
        mangle: {
          properties: {
            regex: /^__/,
          }
        },
        module: true,
        toplevel: true,
      }),
      visualizer({
        filename: 'dist/stats.html',
        gzipSize: true,
        brotliSize: true,
      }),
    ],
  }
];