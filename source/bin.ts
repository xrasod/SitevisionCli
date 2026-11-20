#!/usr/bin/env node
// React and the reconciler pick their build from NODE_ENV when first loaded.
// Without it they load the development build, which records a
// performance.measure() entry for every component on every render. Node keeps
// those entries for good, so the shell grew by megabytes a minute while a task
// ran. Load them as production, then put NODE_ENV back so npm install, webpack
// and sitevision-scripts see the user's own value.
const nodeEnv = process.env['NODE_ENV'];
process.env['NODE_ENV'] = 'production';
await import('react');
await import('react/jsx-runtime');
await import('ink');
if (nodeEnv === undefined) delete process.env['NODE_ENV'];
else process.env['NODE_ENV'] = nodeEnv;

await import('./cli.js');
