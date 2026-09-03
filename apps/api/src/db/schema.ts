/**
 * Drizzle schema — the executable form of BRD §9.2.
 *
 * Rules that must survive a careless change (BRD §9.3):
 * - weights are NUMERIC, never float;
 * - exercises and routines are archived, never deleted;
 * - workout -> exercises -> sets cascade, but a reference to an `exercises` row
 *   never does, so history cannot be destroyed by a catalogue edit;
 * - media exists only as a `media_assets` row, so provenance cannot be bypassed.
 */
import { sql } from 'drizzle-orm';
import {
  bigserial,
  boolean,
  check,
  customType,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  smallserial,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

/** Case-insensitive text, so `Sam@example.com` and `sam@example.com` collide. */
const citext = customType<{ data: string }>({
  dataType: () => 'citext',
});

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
};

// ============ Enums ============
export const unitSystem = pgEnum('unit_system', ['metric', 'imperial']);
export const experienceLevel = pgEnum('experience_level', ['beginner', 'intermediate', 'advanced']);
export const muscleRole = pgEnum('muscle_role', ['primary', 'secondary']);
/** Which numbers an exercise takes: weight and reps, or time and distance. */
export const exerciseKind = pgEnum('exercise_kind', ['strength', 'cardio']);
export const setType = pgEnum('set_type', ['normal', 'warmup', 'failure', 'drop']);
export const workoutStatus = pgEnum('workout_status', ['in_progress', 'completed', 'discarded']);
export const prType = pgEnum('pr_type', [
  'heaviest_weight',
  'best_1rm',
  'best_set_volume',
  'farthest_distance',
  'longest_duration',
  'best_pace',
]);
export const insightType = pgEnum('insight_type', [
  'plateau',
  'progression',
  'imbalance',
  'summary',
]);
export const analysisStatus = pgEnum('analysis_status', [
  'queued',
  'processing',
  'complete',
  'failed',
]);
export const mediaKind = pgEnum('media_kind', ['image', 'gif', 'video']);
export const mediaDelivery = pgEnum('media_delivery', ['r2_copy', 'external_embed']);
export const mediaState = pgEnum('media_state', ['pending_review', 'active', 'broken', 'removed']);
export const licenceStatus = pgEnum('licence_status', [
  'public_domain',
  'cc0',
  'cc_by',
  'cc_by_sa',
  'licensed_commercial',
  'original_work',
  'unknown',
]);

// ============ Identity ============
export const users = pgTable('users', {
  id: uuid('id').primaryKey(),
  email: citext('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  emailVerified: boolean('email_verified').notNull().default(false),
  /** FR-ADM-01: the only gate on the /admin namespace. Set by hand (Q14). */
  isAdmin: boolean('is_admin').notNull().default(false),
  ...timestamps,
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
});

export const userProfiles = pgTable('user_profiles', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  displayName: text('display_name').notNull(),
  units: unitSystem('units').notNull().default('metric'),
  experience: experienceLevel('experience'),
  bodyweightKg: numeric('bodyweight_kg', { precision: 5, scale: 2 }),
  dateOfBirth: date('date_of_birth'),
  /** FR-AUTH-08: only the R2 object key is stored; the API presigns on read. */
  avatarR2Key: text('avatar_r2_key'),
  /**
   * Onboarding's two questions about available time. Nullable because every
   * onboarding step is skippable — an unanswered question stays unanswered
   * rather than being invented as a default.
   */
  trainingDaysPerWeek: smallint('training_days_per_week'),
  sessionMinutes: smallint('session_minutes'),
  /**
   * When onboarding was last shown — set whether the user answered or skipped.
   * Answers alone cannot serve as the marker: someone who skips every question
   * would then be asked again on every launch, forever.
   */
  onboardedAt: timestamp('onboarded_at', { withTimezone: true }),
  /** Two minutes: the right default for the compound lifts most people log. */
  defaultRestSecs: integer('default_rest_secs').notNull().default(120),
  /** FR-AI-06: opt-in, off by default. */
  aiEnabled: boolean('ai_enabled').notNull().default(false),
  /**
   * Appearing on the leaderboard publishes name, level, rank, XP, volume and
   * streak to other users. Workout data is health-adjacent (R2), so this is
   * off until deliberately turned on.
   */
  leaderboardOptIn: boolean('leaderboard_opt_in').notNull().default(false),
  /**
   * Which Path the UI dresses the progression as (FR-HP-11). Presentation
   * only — no threshold anywhere depends on it, so changing it moves nothing
   * the user has earned. Defaults to the original ladder.
   */
  progressionPath: text('progression_path').notNull().default('monarch'),
  /**
   * Nutrition target overrides (FR-NUT-10). Null means "derive it from the
   * profile" — the estimate is not copied in, so it stays correct when
   * bodyweight changes. Nullable per field, so protein can be pinned while the
   * rest stays derived.
   */
  targetEnergyKj: integer('target_energy_kj'),
  targetProteinG: numeric('target_protein_g', { precision: 6, scale: 2 }),
  targetCarbsG: numeric('target_carbs_g', { precision: 6, scale: 2 }),
  targetFatG: numeric('target_fat_g', { precision: 6, scale: 2 }),
  ...timestamps,
});

export const refreshTokens = pgTable(
  'refresh_tokens',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** NFR-S-02: opaque token, hashed at rest, rotated on every use. */
    tokenHash: text('token_hash').notNull().unique(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_refresh_user')
      .on(table.userId)
      .where(sql`revoked_at IS NULL`),
  ],
);

export const emailCodePurpose = pgEnum('email_code_purpose', ['verify_email', 'password_reset']);

/**
 * One-time codes emailed to a user (FR-AUTH-06).
 *
 * Replaces `password_reset_tokens`. The old table held a 256-bit token meant
 * for a link; this holds a six-digit code meant to be typed, so it needs two
 * things that table did not have: a purpose, and an attempt counter. See
 * lib/otp.ts for why a short code is acceptable and what pays for it.
 *
 * The code is stored only as a peppered hash, so this table leaking does not
 * hand over a password reset.
 */
export const emailCodes = pgTable(
  'email_codes',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    purpose: emailCodePurpose('purpose').notNull(),
    codeHash: text('code_hash').notNull(),
    /** Counts wrong guesses; at lib/otp.ts MAX_ATTEMPTS the code is spent. */
    attempts: smallint('attempts').notNull().default(0),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // One live code per user per purpose: requesting a new one retires the
    // old, so a partial unique index makes that an invariant rather than a
    // convention the service has to remember.
    uniqueIndex('email_codes_live')
      .on(table.userId, table.purpose)
      .where(sql`used_at IS NULL`),
    index('idx_email_codes_lookup').on(table.userId, table.purpose),
  ],
);

// ============ Taxonomy ============
export const muscleGroups = pgTable('muscle_groups', {
  id: smallserial('id').primaryKey(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
});

export const muscles = pgTable('muscles', {
  id: smallserial('id').primaryKey(),
  muscleGroupId: smallint('muscle_group_id')
    .notNull()
    .references(() => muscleGroups.id),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
});

export const equipment = pgTable('equipment', {
  id: smallserial('id').primaryKey(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
});

// ============ Media provenance (FR-MED-*) ============
export const mediaAssets = pgTable(
  'media_assets',
  {
    id: uuid('id').primaryKey(),
    kind: mediaKind('kind').notNull(),
    delivery: mediaDelivery('delivery').notNull(),
    state: mediaState('state').notNull().default('pending_review'),
    r2Key: text('r2_key'),
    externalUrl: text('external_url'),
    sourceUrl: text('source_url').notNull(),
    sourceName: text('source_name').notNull(),
    licence: licenceStatus('licence').notNull().default('unknown'),
    licenceUrl: text('licence_url'),
    attributionText: text('attribution_text'),
    requiresAttribution: boolean('requires_attribution').notNull().default(false),
    verifiedAt: timestamp('verified_at', { withTimezone: true }),
    verifiedBy: uuid('verified_by').references(() => users.id),
    lastCheckedAt: timestamp('last_checked_at', { withTimezone: true }),
    width: smallint('width'),
    height: smallint('height'),
    durationSecs: smallint('duration_secs'),
    ...timestamps,
  },
  (table) => [
    // FR-MED-05: exactly one location, matching the delivery mode.
    check(
      'media_one_location',
      sql`(${table.delivery} = 'r2_copy' AND ${table.r2Key} IS NOT NULL AND ${table.externalUrl} IS NULL)
       OR (${table.delivery} = 'external_embed' AND ${table.externalUrl} IS NOT NULL AND ${table.r2Key} IS NULL)`,
    ),
    // FR-MED-03: an unlicensed asset is structurally incapable of being active.
    check(
      'media_licence_allowlist',
      sql`${table.state} <> 'active' OR ${table.licence} <> 'unknown'`,
    ),
    // FR-MED-02: provenance must be verified before activation.
    check(
      'media_verified_before_active',
      sql`${table.state} <> 'active' OR ${table.verifiedAt} IS NOT NULL`,
    ),
    // FR-MED-04: attribution text is required when the licence demands it.
    check(
      'media_attribution_present',
      sql`NOT ${table.requiresAttribution} OR ${table.attributionText} IS NOT NULL`,
    ),
    index('idx_media_state').on(table.state),
    index('idx_media_recheck')
      .on(table.lastCheckedAt)
      .where(sql`delivery = 'external_embed' AND state = 'active'`),
  ],
);

// ============ Exercises ============
export const exercises = pgTable(
  'exercises',
  {
    id: uuid('id').primaryKey(),
    /** NULL means a system exercise from the seeded catalogue. */
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    slug: text('slug'),
    /** FR-CAR-01: which numbers this takes. Existing rows default to strength. */
    kind: exerciseKind('kind').notNull().default('strength'),
    description: text('description'),
    instructions: text('instructions'),
    equipmentId: smallint('equipment_id').references(() => equipment.id),
    isUnilateral: boolean('is_unilateral').notNull().default(false),
    /** FR-ADM-09: the designated home for future AI/CV annotation. */
    metadata: jsonb('metadata').notNull().default({}),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('idx_ex_system_slug')
      .on(table.slug)
      .where(sql`user_id IS NULL`),
    index('idx_ex_user').on(table.userId),
    index('idx_ex_name_trgm').using('gin', sql`${table.name} gin_trgm_ops`),
  ],
);

export const exerciseMuscles = pgTable(
  'exercise_muscles',
  {
    exerciseId: uuid('exercise_id')
      .notNull()
      .references(() => exercises.id, { onDelete: 'cascade' }),
    muscleId: smallint('muscle_id')
      .notNull()
      .references(() => muscles.id),
    role: muscleRole('role').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.exerciseId, table.muscleId] }),
    index('idx_exmus_muscle').on(table.muscleId, table.role),
  ],
);

export const exerciseMedia = pgTable(
  'exercise_media',
  {
    exerciseId: uuid('exercise_id')
      .notNull()
      .references(() => exercises.id, { onDelete: 'cascade' }),
    /** RESTRICT, not CASCADE: a takedown is a state change, never a deletion. */
    mediaId: uuid('media_id')
      .notNull()
      .references(() => mediaAssets.id, { onDelete: 'restrict' }),
    position: smallint('position').notNull().default(0),
    isPrimary: boolean('is_primary').notNull().default(false),
  },
  (table) => [
    primaryKey({ columns: [table.exerciseId, table.mediaId] }),
    uniqueIndex('idx_exmedia_primary')
      .on(table.exerciseId)
      .where(sql`is_primary`),
  ],
);

// ============ Routines ============
export const routines = pgTable(
  'routines',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    notes: text('notes'),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    index('idx_routines_user')
      .on(table.userId)
      .where(sql`archived_at IS NULL`),
  ],
);

export const routineExercises = pgTable(
  'routine_exercises',
  {
    id: uuid('id').primaryKey(),
    routineId: uuid('routine_id')
      .notNull()
      .references(() => routines.id, { onDelete: 'cascade' }),
    exerciseId: uuid('exercise_id')
      .notNull()
      .references(() => exercises.id),
    position: smallint('position').notNull(),
    targetSets: smallint('target_sets'),
    targetRepsMin: smallint('target_reps_min'),
    targetRepsMax: smallint('target_reps_max'),
    targetWeightKg: numeric('target_weight_kg', { precision: 6, scale: 2 }),
    restSecs: integer('rest_secs'),
    notes: text('notes'),
  },
  (table) => [uniqueIndex('routine_exercises_position').on(table.routineId, table.position)],
);

// ============ Workouts ============
export const workouts = pgTable(
  'workouts',
  {
    /** Client-generated UUIDv7 so a workout can begin offline (NFR-R-04). */
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    routineId: uuid('routine_id').references(() => routines.id, { onDelete: 'set null' }),
    name: text('name'),
    status: workoutStatus('status').notNull().default('in_progress'),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    durationSecs: integer('duration_secs'),
    /** Denormalised on completion so history lists need no joins (§9.3). */
    totalVolumeKg: numeric('total_volume_kg', { precision: 10, scale: 2 }),
    notes: text('notes'),
    ...timestamps,
  },
  (table) => [
    index('idx_workouts_user_started').on(table.userId, table.startedAt.desc()),
    // FR-WK-02: one in-progress workout per user, enforced by the database.
    uniqueIndex('idx_one_active_workout')
      .on(table.userId)
      .where(sql`status = 'in_progress'`),
  ],
);

export const workoutExercises = pgTable(
  'workout_exercises',
  {
    id: uuid('id').primaryKey(),
    workoutId: uuid('workout_id')
      .notNull()
      .references(() => workouts.id, { onDelete: 'cascade' }),
    exerciseId: uuid('exercise_id')
      .notNull()
      .references(() => exercises.id),
    position: smallint('position').notNull(),
    restSecs: integer('rest_secs'),
    notes: text('notes'),
  },
  (table) => [
    uniqueIndex('workout_exercises_position').on(table.workoutId, table.position),
    index('idx_wex_exercise').on(table.exerciseId),
  ],
);

export const workoutSets = pgTable(
  'workout_sets',
  {
    id: uuid('id').primaryKey(),
    workoutExerciseId: uuid('workout_exercise_id')
      .notNull()
      .references(() => workoutExercises.id, { onDelete: 'cascade' }),
    position: smallint('position').notNull(),
    setType: setType('set_type').notNull().default('normal'),
    weightKg: numeric('weight_kg', { precision: 6, scale: 2 }),
    reps: smallint('reps'),
    rpe: numeric('rpe', { precision: 3, scale: 1 }),
    /**
     * Cardio (FR-CAR-02). Whole seconds and whole metres, both independently
     * optional: '20 minutes on the bike' and '5 km' are each a complete log.
     */
    durationSecs: integer('duration_secs'),
    distanceM: integer('distance_m'),
    isCompleted: boolean('is_completed').notNull().default(false),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    notes: text('notes'),
  },
  (table) => [
    uniqueIndex('workout_sets_position').on(table.workoutExerciseId, table.position),
    check(
      'workout_sets_rpe_range',
      sql`${table.rpe} IS NULL OR (${table.rpe} >= 1 AND ${table.rpe} <= 10)`,
    ),
    // Bounds mirror durationSecsSchema and distanceMetresSchema in
    // @fi/shared. If Zod were the looser of the two, a bad value would reach
    // Postgres and come back a 500 instead of a 400.
    check(
      'workout_sets_cardio_range',
      sql`(${table.durationSecs} IS NULL OR ${table.durationSecs} BETWEEN 0 AND 86400)
      AND (${table.distanceM} IS NULL OR ${table.distanceM} BETWEEN 0 AND 1000000)`,
    ),
  ],
);

// ============ Progress ============
export const personalRecords = pgTable(
  'personal_records',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    exerciseId: uuid('exercise_id')
      .notNull()
      .references(() => exercises.id),
    prType: prType('pr_type').notNull(),
    value: numeric('value', { precision: 10, scale: 2 }).notNull(),
    reps: smallint('reps'),
    weightKg: numeric('weight_kg', { precision: 6, scale: 2 }),
    setId: uuid('set_id').references(() => workoutSets.id, { onDelete: 'set null' }),
    achievedAt: timestamp('achieved_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_pr_user_ex').on(
      table.userId,
      table.exerciseId,
      table.prType,
      table.achievedAt.desc(),
    ),
  ],
);

export const bodyMeasurements = pgTable(
  'body_measurements',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    measuredAt: date('measured_at').notNull(),
    bodyweightKg: numeric('bodyweight_kg', { precision: 5, scale: 2 }),
    notes: text('notes'),
  },
  (table) => [uniqueIndex('body_measurements_day').on(table.userId, table.measuredAt)],
);

// ============ Phase 4: AI ============
export const aiInsights = pgTable(
  'ai_insights',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    workoutId: uuid('workout_id').references(() => workouts.id, { onDelete: 'cascade' }),
    insightType: insightType('insight_type').notNull(),
    title: text('title').notNull(),
    body: text('body').notNull(),
    payload: jsonb('payload'),
    model: text('model'),
    dismissedAt: timestamp('dismissed_at', { withTimezone: true }),
    feedback: smallint('feedback'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_insights_user')
      .on(table.userId, table.createdAt.desc())
      .where(sql`dismissed_at IS NULL`),
  ],
);

// ============ Phase 5: CV ============
export const cvAnalyses = pgTable(
  'cv_analyses',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    workoutExerciseId: uuid('workout_exercise_id').references(() => workoutExercises.id, {
      onDelete: 'set null',
    }),
    videoR2Key: text('video_r2_key').notNull(),
    status: analysisStatus('status').notNull().default('queued'),
    repCount: smallint('rep_count'),
    result: jsonb('result'),
    error: text('error'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
  },
  (table) => [index('idx_cv_user').on(table.userId, table.createdAt.desc())],
);

// ============ Admin audit (FR-ADM-08) ============
export const adminAuditLog = pgTable(
  'admin_audit_log',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    actorId: uuid('actor_id')
      .notNull()
      .references(() => users.id),
    action: text('action').notNull(),
    entityType: text('entity_type').notNull(),
    entityId: text('entity_id').notNull(),
    diff: jsonb('diff'),
    requestId: text('request_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_audit_entity').on(table.entityType, table.entityId, table.createdAt.desc()),
  ],
);

// ============ The Hunter System ============
export const xpSource = pgEnum('xp_source', ['workout', 'quest', 'badge', 'nutrition']);

/**
 * An append-only XP ledger rather than a running total on the user.
 *
 * A total would be a number nobody could audit: if it ever drifted from the
 * work behind it there would be no way to tell, and no way to rebuild it. From
 * a ledger, a level is a sum — and the unique index makes awarding twice for
 * the same workout impossible rather than merely unlikely.
 */
export const xpEvents = pgTable(
  'xp_events',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    source: xpSource('source').notNull(),
    amount: integer('amount').notNull(),
    /** The workout id, quest id or badge key this XP came from. */
    referenceId: text('reference_id'),
    /** The itemisation, kept so the UI can show why the XP was awarded. */
    breakdown: jsonb('breakdown'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_xp_user').on(table.userId, table.createdAt.desc()),
    // One award per source per reference. Replayed workout completions and
    // double-tapped quest claims both land here and become no-ops.
    uniqueIndex('idx_xp_once_per_reference')
      .on(table.userId, table.source, table.referenceId)
      .where(sql`reference_id is not null`),
    check('xp_amount_positive', sql`${table.amount} > 0`),
  ],
);

export const dailyQuests = pgTable(
  'daily_quests',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** The user's local date, supplied by the client — a day is a local fact. */
    questDate: date('quest_date').notNull(),
    questKey: text('quest_key').notNull(),
    target: integer('target').notNull(),
    progress: integer('progress').notNull().default(0),
    xp: integer('xp').notNull(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    /** Separate from completion: the user taps to collect, which is the payoff. */
    claimedAt: timestamp('claimed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('idx_quest_per_day').on(table.userId, table.questDate, table.questKey),
    index('idx_quest_user_date').on(table.userId, table.questDate.desc()),
  ],
);

export const userBadges = pgTable(
  'user_badges',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    badgeKey: text('badge_key').notNull(),
    earnedAt: timestamp('earned_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.badgeKey] })],
);

// ============ Nutrition (FR-NUT-*, BRD v0.2) ============
export const mealSlot = pgEnum('meal_slot', ['breakfast', 'lunch', 'dinner', 'snack']);
export const foodSource = pgEnum('food_source', ['open_food_facts', 'custom']);

/**
 * The food catalogue: cached external products and users' own foods.
 *
 * Nutrition is stored **per 100 g**, which is how every label and every food
 * database states it, so nothing is converted on the way in or out.
 *
 * Macros are NUMERIC, never float — §9.3's rule for weights applies for the
 * same reason: grams get added dozens of times a day.
 */
export const foods = pgTable(
  'foods',
  {
    id: uuid('id').primaryKey(),
    name: text('name').notNull(),
    brand: text('brand'),
    /** EAN/UPC, for the products that carry one (FR-NUT-05). */
    barcode: text('barcode'),
    source: foodSource('source').notNull(),
    /** Null for a catalogue food; set for a custom one, private to that user. */
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
    energyKj: integer('energy_kj').notNull(),
    proteinG: numeric('protein_g', { precision: 5, scale: 2 }).notNull(),
    carbsG: numeric('carbs_g', { precision: 5, scale: 2 }).notNull(),
    fatG: numeric('fat_g', { precision: 5, scale: 2 }).notNull(),
    /** A likely portion, advisory only — an entry always stores grams. */
    servingG: numeric('serving_g', { precision: 7, scale: 2 }),
    servingLabel: text('serving_label'),
    ...timestamps,
  },
  (table) => [
    // One catalogue row per barcode. Partial, so two users may each have a
    // custom food that happens to carry the same barcode.
    uniqueIndex('foods_barcode_unique')
      .on(table.barcode)
      .where(sql`user_id IS NULL AND barcode IS NOT NULL`),
    index('idx_foods_user').on(table.userId),
    index('idx_foods_name_trgm').using('gin', sql`${table.name} gin_trgm_ops`),
    // FR-NUT-08: a custom food belongs to someone; a cached one belongs to
    // nobody. Anything else means the ownership rules have been bypassed.
    check(
      'foods_source_ownership',
      sql`(${table.source} = 'custom' AND ${table.userId} IS NOT NULL)
       OR (${table.source} = 'open_food_facts' AND ${table.userId} IS NULL)`,
    ),
    check(
      'foods_macros_per_100g',
      sql`${table.proteinG} BETWEEN 0 AND 100
      AND ${table.carbsG} BETWEEN 0 AND 100
      AND ${table.fatG} BETWEEN 0 AND 100
      AND ${table.energyKj} BETWEEN 0 AND 4000`,
    ),
  ],
);

/**
 * A logged food entry.
 *
 * The panel columns are a **snapshot**, not a join (FR-NUT-03). Open Food Facts
 * is crowd-edited and recipes change, so an entry that only pointed at `foods`
 * would let a later edit silently rewrite yesterday's total. `food_id` is kept
 * for provenance and set to NULL if the food goes away — the entry survives,
 * because it holds its own figures.
 */
export const foodEntries = pgTable(
  'food_entries',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** The local date the food was eaten — a date, not a timestamp. */
    entryDate: date('entry_date').notNull(),
    mealSlot: mealSlot('meal_slot').notNull(),
    foodId: uuid('food_id').references(() => foods.id, { onDelete: 'set null' }),
    foodName: text('food_name').notNull(),
    brand: text('brand'),
    quantityG: numeric('quantity_g', { precision: 8, scale: 2 }).notNull(),
    energyKj: integer('energy_kj').notNull(),
    proteinG: numeric('protein_g', { precision: 5, scale: 2 }).notNull(),
    carbsG: numeric('carbs_g', { precision: 5, scale: 2 }).notNull(),
    fatG: numeric('fat_g', { precision: 5, scale: 2 }).notNull(),
    loggedAt: timestamp('logged_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Every read is "this user, this day", so this is the index that matters.
    index('idx_food_entries_user_date').on(table.userId, table.entryDate),
    check('food_entries_quantity_positive', sql`${table.quantityG} > 0`),
  ],
);

// ============ Idempotency (NFR-R-03) ============
export const idempotencyKeys = pgTable('idempotency_keys', {
  key: text('key').primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  requestHash: text('request_hash').notNull(),
  response: jsonb('response').notNull(),
  statusCode: smallint('status_code').notNull().default(200),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
