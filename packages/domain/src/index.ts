/**
 * @fi/domain — the only place business arithmetic lives (BRD NFR-M-04).
 *
 * Pure functions, no I/O, no framework imports. Both the API and the client
 * import from here; neither reimplements a formula.
 */
export * from './decimal';
export * from './types';
export * from './units';
export * from './one-rep-max';
export * from './volume';
export * from './personal-records';
export * from './prefill';
export * from './progress';
export * from './hunter';
export * from './quests';
export * from './badges';
export * from './nutrition';
export * from './password-strength';
export * from './cardio';
export * from './insights';
export * from './muscle-work';
export * from './bar-path';
export * from './session-comparison';
export * from './progression';
