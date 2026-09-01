/**
 * Path builders for every endpoint in BRD §10.1.
 *
 * The client never concatenates a URL by hand: a renamed route breaks the
 * build in one file instead of failing at runtime in five screens.
 */
export const API_PREFIX = '/api/v1';

export const routes = {
  auth: {
    register: '/auth/register',
    login: '/auth/login',
    refresh: '/auth/refresh',
    logout: '/auth/logout',
    passwordResetRequest: '/auth/password-reset/request',
    passwordResetConfirm: '/auth/password-reset/confirm',
    verifyEmailRequest: '/auth/verify-email/request',
    verifyEmailConfirm: '/auth/verify-email/confirm',
  },
  me: {
    root: '/me',
    avatarUploadUrl: '/me/avatar-upload-url',
    export: '/me/export',
  },
  taxonomy: '/taxonomy',
  exercises: {
    list: '/exercises',
    detail: (id: string) => `/exercises/${id}`,
  },
  routines: {
    list: '/routines',
    detail: (id: string) => `/routines/${id}`,
    duplicate: (id: string) => `/routines/${id}/duplicate`,
  },
  workouts: {
    list: '/workouts',
    active: '/workouts/active',
    detail: (id: string) => `/workouts/${id}`,
    complete: (id: string) => `/workouts/${id}/complete`,
    discard: (id: string) => `/workouts/${id}/discard`,
    exercises: (id: string) => `/workouts/${id}/exercises`,
    reorderExercises: (id: string) => `/workouts/${id}/exercises/reorder`,
    exercise: (id: string, workoutExerciseId: string) =>
      `/workouts/${id}/exercises/${workoutExerciseId}`,
    sets: (id: string, workoutExerciseId: string) =>
      `/workouts/${id}/exercises/${workoutExerciseId}/sets`,
    sync: (id: string) => `/workouts/${id}/sync`,
  },
  sets: {
    detail: (setId: string) => `/sets/${setId}`,
  },
  progress: {
    exercise: (exerciseId: string) => `/progress/exercises/${exerciseId}`,
    records: '/progress/records',
    summary: '/progress/summary',
  },
  media: {
    url: (mediaId: string) => `/media/${mediaId}/url`,
  },
  nutrition: {
    /** The day: entries, totals by meal, and the targets (FR-NUT-09). */
    day: (date: string) => `/nutrition/days/${date}`,
    entries: '/nutrition/entries',
    entry: (id: string) => `/nutrition/entries/${id}`,
    targets: '/nutrition/targets',
    /** FR-NUT-06: search and barcode are proxied, never called from a client. */
    foodSearch: '/nutrition/foods',
    foodByBarcode: (barcode: string) => `/nutrition/foods/barcode/${barcode}`,
    customFoods: '/nutrition/foods/custom',
  },
  admin: {
    exercises: '/admin/exercises',
    exercise: (id: string) => `/admin/exercises/${id}`,
    exerciseMedia: (id: string) => `/admin/exercises/${id}/media`,
    exerciseMediaItem: (id: string, mediaId: string) => `/admin/exercises/${id}/media/${mediaId}`,
    taxonomy: '/admin/taxonomy',
    taxonomyEntity: (entity: string) => `/admin/taxonomy/${entity}`,
    taxonomyItem: (entity: string, id: number | string) => `/admin/taxonomy/${entity}/${id}`,
    media: '/admin/media',
    mediaItem: (id: string) => `/admin/media/${id}`,
    mediaTakedown: (id: string) => `/admin/media/${id}/takedown`,
    contentExport: '/admin/content/export',
    contentImport: '/admin/content/import',
  },
  health: '/health',
  healthDeep: '/health/deep',
} as const;

/** Header names used as protocol, not decoration (§10.2, NFR-O-04, NFR-R-03). */
export const HEADERS = {
  idempotencyKey: 'idempotency-key',
  requestId: 'x-request-id',
} as const;
