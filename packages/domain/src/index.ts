/**
 * @fi/domain — the only place business arithmetic lives (BRD NFR-M-04).
 *
 * Pure functions, no I/O, no framework imports. Both the API and the client
 * import from here; neither reimplements a formula.
 */
export * from './decimal.js';
export * from './types.js';
export * from './units.js';
export * from './one-rep-max.js';
export * from './volume.js';
export * from './personal-records.js';
export * from './prefill.js';
export * from './progress.js';
