/**
 * Builds the architecture reference as a Word document.
 *
 *   pnpm doc:docx    ->  docs/Ascension-Architecture.docx
 *
 * WHY A GENERATOR AND NOT A HAND-WRITTEN FILE. A .docx that someone edits by
 * hand goes stale the first time a table changes and nobody can diff it to
 * find out. This reads like the rest of the repo's generated assets — icons,
 * the navigation sound, the web host headers — where the source of truth is
 * the script and the artefact is disposable.
 *
 * It is deliberately NOT a conversion of the HTML artifact. Word is a
 * different medium: no sticky navigation, no hover, printed page breaks,
 * and a reader who will click through the heading pane rather than a rail. The
 * content is the same; the structure is written for the medium.
 */
import { writeFileSync } from 'node:fs';
import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Header,
  HeadingLevel,
  PageBreak,
  PageNumber,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableOfContents,
  TableRow,
  TextRun,
  WidthType,
} from 'docx';

// The document's palette, taken from the app's own tokens but re-tuned for
// ink on white — a navy background does not survive a printer.
const INK = '0A1524';
const MUTED = '33475E';
const FAINT = '5A6F86';
const ACCENT = '0B4E8A';
const RULE = 'C9D4E0';
const HEAD_FILL = 'EEF3F9';

const FONT = 'Calibri';
const MONO = 'Consolas';

const NO_BORDER = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
const THIN = { style: BorderStyle.SINGLE, size: 4, color: RULE };

/** Body text. */
const p = (text, options = {}) =>
  new Paragraph({
    spacing: { after: options.after ?? 140, line: 288 },
    children: [
      new TextRun({
        text,
        font: FONT,
        size: options.size ?? 21,
        color: options.color ?? MUTED,
        bold: options.bold ?? false,
        italics: options.italics ?? false,
      }),
    ],
    ...(options.paragraph ?? {}),
  });

/** A paragraph mixing normal and bold runs, written as [text, bold?] pairs. */
const rich = (parts, options = {}) =>
  new Paragraph({
    spacing: { after: options.after ?? 140, line: 288 },
    children: parts.map(
      ([text, bold]) =>
        new TextRun({
          text,
          font: FONT,
          size: 21,
          bold: Boolean(bold),
          color: bold ? INK : MUTED,
        }),
    ),
  });

const h1 = (text) =>
  new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 360, after: 160 },
    children: [new TextRun({ text, font: FONT, size: 30, bold: true, color: INK })],
  });

const h2 = (text) =>
  new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 260, after: 120 },
    children: [new TextRun({ text, font: FONT, size: 24, bold: true, color: ACCENT })],
  });

/** A small uppercase label, for the document-control strip. */
const label = (text) =>
  new Paragraph({
    spacing: { after: 20 },
    children: [
      new TextRun({ text: text.toUpperCase(), font: FONT, size: 14, color: FAINT, bold: true }),
    ],
  });

const bullet = (text) =>
  new Paragraph({
    bullet: { level: 0 },
    spacing: { after: 90, line: 288 },
    children: [new TextRun({ text, font: FONT, size: 21, color: MUTED })],
  });

/** Fixed-width, for a command or a policy. */
const code = (lines) =>
  new Paragraph({
    spacing: { before: 100, after: 160 },
    shading: { type: ShadingType.CLEAR, fill: 'F5F7FA' },
    border: { left: { style: BorderStyle.SINGLE, size: 12, color: ACCENT } },
    children: lines.flatMap((line, index) => [
      ...(index > 0 ? [new TextRun({ break: 1 })] : []),
      new TextRun({ text: line, font: MONO, size: 17, color: INK }),
    ]),
  });

/**
 * A callout — the decisions worth reading twice.
 *
 * A left rule and a tint, which is as close as Word gets to the accent bar the
 * web version uses, without embedding an image.
 */
const callout = (title, body) =>
  new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: NO_BORDER,
      bottom: NO_BORDER,
      right: NO_BORDER,
      left: { style: BorderStyle.SINGLE, size: 18, color: ACCENT },
      insideHorizontal: NO_BORDER,
      insideVertical: NO_BORDER,
    },
    rows: [
      new TableRow({
        children: [
          new TableCell({
            shading: { type: ShadingType.CLEAR, fill: 'F5F8FC' },
            margins: { top: 140, bottom: 140, left: 180, right: 160 },
            children: [
              new Paragraph({
                spacing: { after: 80 },
                children: [
                  new TextRun({
                    text: title.toUpperCase(),
                    font: FONT,
                    size: 15,
                    bold: true,
                    color: ACCENT,
                  }),
                ],
              }),
              ...body.map((text) => p(text, { after: 80 })),
            ],
          }),
        ],
      }),
    ],
  });

/** A table with a shaded header row. Widths are percentages. */
function table(headers, rows, widths) {
  const cell = (text, { bold = false, header = false, width } = {}) =>
    new TableCell({
      width: width ? { size: width, type: WidthType.PERCENTAGE } : undefined,
      shading: header ? { type: ShadingType.CLEAR, fill: HEAD_FILL } : undefined,
      margins: { top: 90, bottom: 90, left: 120, right: 120 },
      children: [
        new Paragraph({
          spacing: { after: 0, line: 264 },
          children: [
            new TextRun({
              text,
              font: FONT,
              size: header ? 16 : 19,
              bold: header || bold,
              color: header ? FAINT : MUTED,
              allCaps: header,
            }),
          ],
        }),
      ],
    });

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: THIN,
      bottom: THIN,
      left: THIN,
      right: THIN,
      insideHorizontal: THIN,
      insideVertical: THIN,
    },
    rows: [
      new TableRow({
        tableHeader: true, // repeats when the table splits across pages
        children: headers.map((text, index) =>
          cell(text, { header: true, width: widths?.[index] }),
        ),
      }),
      ...rows.map(
        (row) =>
          new TableRow({
            children: row.map((text, index) =>
              cell(String(text), { bold: index === 0, width: widths?.[index] }),
            ),
          }),
      ),
    ],
  });
}

const spacer = (after = 200) => new Paragraph({ spacing: { after }, children: [] });

// ============================================================== content ==

const children = [];

// ---------------------------------------------------------- cover page --

children.push(
  new Paragraph({
    spacing: { before: 1400, after: 60 },
    children: [new TextRun({ text: 'ASCENSION', font: FONT, size: 68, bold: true, color: INK })],
  }),
  new Paragraph({
    spacing: { after: 320 },
    children: [
      new TextRun({
        text: 'Architecture & Security Reference',
        font: FONT,
        size: 30,
        color: ACCENT,
      }),
    ],
  }),
  p(
    'A cross-platform training log built as a pnpm monorepo: Fastify and PostgreSQL behind an Expo client, with all business arithmetic isolated in a pure, fully-covered domain package. This describes what is actually deployed, including what is not finished.',
    { after: 420 },
  ),

  table(
    ['', ''],
    [
      ['Version', '1.3.0 · build 19'],
      ['Status', 'Current — private trial'],
      ['Platforms', 'Android (sideloaded APK) and web (Netlify)'],
      ['Updated', '4 September 2026'],
      ['Scale', '27 tables · 76 endpoints · 562 tests · 100% domain branch coverage'],
    ],
    [22, 78],
  ),

  new Paragraph({ children: [new PageBreak()] }),
);

// ------------------------------------------------------------ contents --

children.push(
  h1('Contents'),
  p(
    'Right-click the field below and choose "Update Field" to populate page numbers — Word builds this from the headings when the document is opened.',
    { italics: true, after: 200 },
  ),
  new TableOfContents('Contents', { hyperlink: true, headingStyleRange: '1-2' }),
  new Paragraph({ children: [new PageBreak()] }),
);

// ------------------------------------------------------------ §1 shape --

children.push(
  h1('1. System shape'),
  p(
    'Four workspaces, one deployable server, one client codebase producing Android and web. No containers, no message broker, no cache tier — the constraint was that every piece must run inside a free tier and be understandable by one person.',
  ),
  table(
    ['Workspace', 'Role', 'Depends on'],
    [
      ['apps/api', 'Fastify server, 76 endpoints across 14 route modules', 'shared, domain'],
      ['apps/mobile', 'Expo Router client, 30 screens, Android + web', 'shared, domain'],
      ['packages/shared', 'Zod schemas, route table, derived types', '—'],
      ['packages/domain', '21 pure modules: all business arithmetic', '—'],
    ],
    [22, 56, 22],
  ),
  spacer(),
  callout('The load-bearing rule', [
    'Every number the product shows — one-rep max, volume, XP, streaks, tier, bar path, nutrition targets — is computed in packages/domain. It is pure, imports no framework, touches no I/O, and is held at 100% branch coverage.',
    'Routes and components format its output and never calculate. packages/shared holds the Zod schemas; types are derived with z.infer and never hand-written twice, so client and server cannot disagree about a payload.',
  ]),
  spacer(),
  h2('Request path'),
  p(
    'Client → shared schema → route (thin, schema-validated) → service (ownership, SQL, transactions) → domain (arithmetic) → Neon PostgreSQL. Media is presigned from Cloudflare R2; the client never builds a URL itself.',
  ),
  new Paragraph({ children: [new PageBreak()] }),
);

// ------------------------------------------------------- §2/3 clients --

children.push(
  h1('2. Frontend'),
  p(
    'Expo SDK 57 with Expo Router, React 19, React Native 0.86. One codebase compiles to an Android APK and a web bundle; there is no separate web app to keep in step.',
  ),
  table(
    ['Concern', 'Choice', 'Why this one'],
    [
      ['Navigation', 'expo-router 6', 'File-based, so the route tree is the directory tree'],
      ['Server state', '@tanstack/react-query 5', 'Caching, retry and optimistic mutation'],
      ['Local state', 'React hooks', 'No Redux — nothing is global enough to justify a store'],
      ['Animation', 'reanimated 4', 'Worklet-driven; RN Animated where the native driver suffices'],
      ['Charts', 'Hand-drawn views', 'Two rectangles and a label do not justify a dependency'],
      ['Icons', 'Unicode glyphs and SVG', 'One less dependency; scales with the OS font size'],
      [
        'Token storage',
        'expo-secure-store',
        'Android Keystore. Preferences use AsyncStorage; secrets never do',
      ],
    ],
    [18, 26, 56],
  ),
  spacer(),
  h2('Optimistic logging'),
  p(
    'Set logging never waits on the network. A tap writes to the React Query cache immediately and the request follows; a failed mutation is retried by the client. This is a product requirement, not an optimisation — a rep logged in a gym with no signal must still be a rep.',
  ),
  h2('Startup'),
  p(
    'The shell used to hold the launch screen until /me answered, putting a network round trip in front of every launch — 25 to 45 seconds against a cold free-tier instance. A device that has completed onboarding now renders immediately from a local hint and lets the profile arrive behind it. The hint is advisory: the real check still runs and still redirects.',
  ),

  new Paragraph({ children: [new PageBreak()] }),

  h1('3. Backend'),
  p(
    'Fastify 5 with fastify-type-provider-zod, bundled by tsup into a single artefact. Routes are thin; services hold the logic; the domain package holds the arithmetic.',
  ),
  table(
    ['Layer', 'Responsibility', 'Forbidden from'],
    [
      [
        'routes/',
        'Schema binding, auth pre-handler, calling one service',
        'SQL, arithmetic, business rules',
      ],
      [
        'services/',
        'Ownership checks, SQL via Drizzle, transactions',
        'Arithmetic — it delegates to the domain',
      ],
      ['plugins/', 'Auth, request context, error mapping, idempotency', 'Feature logic'],
      ['packages/domain', 'Every calculation in the product', 'I/O, framework imports, Date.now()'],
    ],
    [20, 44, 36],
  ),
  spacer(),
  p('Endpoint surface: 31 GET · 27 POST · 9 PATCH · 7 DELETE · 2 PUT.'),
  callout('Numbers on the wire', [
    'Weights are transmitted and stored as decimal strings in kilograms, never floats. The domain represents them as a branded fixed-point integer type.',
    'Conversion to pounds happens only in the presentation layer, so switching units never alters a stored value.',
  ]),

  new Paragraph({ children: [new PageBreak()] }),
);

// ------------------------------------------------------------ §4 domain --

children.push(
  h1('4. Domain layer'),
  p(
    '21 pure modules, 364 tests, 100% statement, branch, function and line coverage. The coverage figure is a gate, not an aspiration — and it is enforced by removing unreachable branches rather than by writing tests that cannot fail.',
  ),
  table(
    ['Module', 'Computes'],
    [
      ['decimal', 'Branded fixed-point arithmetic. The only place decimal maths happens'],
      ['one-rep-max · volume', 'Estimated 1RM (Epley), set and session volume, warmup exclusion'],
      ['personal-records', 'Heaviest weight, best estimated 1RM, best set volume'],
      ['cardio', 'Pace, speed, cardio records — pace being the one record where lower wins'],
      [
        'hunter · quests · badges',
        'XP curve, level, rank thresholds, daily quests, badge criteria',
      ],
      [
        'ascension',
        'Seven Ascensions: tier names, palettes, per-tier mark geometry, badge renaming',
      ],
      ['ascension-quotes', 'Deterministic line selection, seeded so text never changes mid-read'],
      [
        'insights · muscle-work',
        'Plateau and progression detection, imbalance, per-muscle volume split',
      ],
      ['session-comparison', 'This session against the previous run of the same routine'],
      ['bar-path', 'Calibration, smoothing, rep segmentation, concentric velocity, velocity loss'],
      ['format-number', 'Compact figures (10k, 1.2M), truncating rather than rounding'],
      ['nutrition', 'Energy and macro targets, per-100g scaling, kJ/kcal conversion'],
      [
        'prefill · progress · units · password-strength',
        'Next-set suggestion, trend windows, unit conversion, password rules',
      ],
    ],
    [30, 70],
  ),
  spacer(),
  callout('Why 100% is achievable here', [
    'Because the package is pure. There is no network to stub and no clock to freeze — every function is inputs to outputs.',
    'Where a branch proved unreachable, the fix was to make the function total rather than leave an untestable guard: tier lookups became a complete Record the type system enforces, and rank thresholds became a total record with the ordered list derived from it.',
  ]),

  new Paragraph({ children: [new PageBreak()] }),
);

// ---------------------------------------------------------- §5 database --

children.push(
  h1('5. Database'),
  p(
    'PostgreSQL on Neon, accessed through Drizzle ORM with the postgres driver. 27 tables, 35 foreign keys, 13 forward-only migrations (0000–0012). Schema is defined in TypeScript and migrations are generated from the diff — then read line by line before they are committed.',
  ),
  h2('The training spine'),
  code([
    'users ──1:1── user_profiles',
    '  │',
    '  ├──< workouts ──< workout_exercises ──< workout_sets',
    '  │                        │',
    '  │                  exercises ──< exercise_muscles >── muscles >── muscle_groups',
    '  │                        └──< exercise_media >── media_assets (licence required)',
    '  │',
    '  ├──< routines ──< routine_exercises',
    '  ├──< personal_records        (per exercise + record type)',
    '  ├──< xp_events               (append-only ledger; level is derived)',
    '  └──< refresh_tokens          (rotating family)',
  ]),
  h2('Every table, by group'),
  table(
    ['Group', 'Tables', 'Notes'],
    [
      [
        'Identity',
        'users · user_profiles · refresh_tokens · email_codes',
        'Profile is 1:1 and split out so a token check never loads it. Codes and tokens stored hashed',
      ],
      [
        'Catalogue',
        'exercises · muscle_groups · muscles · equipment · exercise_muscles',
        'Seeded from reviewable JSON. A partial unique index on slug covers only rows where user_id IS NULL, so a custom exercise cannot collide with the catalogue',
      ],
      [
        'Media',
        'media_assets · exercise_media',
        'No URL exists outside a media_assets row carrying source, licence and attribution. No licence, no render',
      ],
      [
        'Training',
        'workouts · workout_exercises · workout_sets · personal_records · body_measurements',
        'Positions contiguous and unique per parent. A partial unique index enforces one in-progress workout per user',
      ],
      [
        'Routines',
        'routines · routine_exercises',
        'Archived, never deleted, so a completed workout’s reference stays resolvable',
      ],
      [
        'Progression',
        'xp_events · daily_quests · user_badges',
        'XP is an append-only ledger; level is derived, never stored. A partial unique index on (user_id, source, reference_id) makes awards idempotent',
      ],
      [
        'Nutrition',
        'foods · food_entries',
        'Per-100g figures with CHECK bounds mirroring the Zod schema, so an invalid payload is a 400 rather than a 500',
      ],
      [
        'Platform',
        'ai_insights · cv_analyses · admin_audit_log · idempotency_keys',
        'AI output is confined to ai_insights and is never a source of truth. Admin actions are logged',
      ],
    ],
    [14, 30, 56],
  ),
  spacer(),
  h2('Structural features'),
  bullet(
    'Partial unique indexes carry three separate invariants: one active workout per user, catalogue slug uniqueness, and XP award idempotency. Each would otherwise need application-level locking.',
  ),
  bullet(
    'CHECK constraints mirror the Zod schemas — cardio duration ≤ 86,400s, distance ≤ 1,000,000m, energy ≤ 4,000 kJ/100g. The schema rejects first, so the constraint is a backstop rather than the error path.',
  ),
  bullet(
    'Keyset pagination on (started_at, id) rather than OFFSET, so deep history stays constant-time.',
  ),
  bullet(
    'Nullable means something. The Ascension column is nullable specifically so "never chosen" is distinguishable from "chose the default" — a default would make the first-run question unaskable.',
  ),
  bullet(
    'A rename is hand-written. drizzle-kit cannot tell a rename from a drop-and-add without being asked interactively, and the generated form destroys the column’s data. db:generate then confirms no drift.',
  ),

  new Paragraph({ children: [new PageBreak()] }),
);

// -------------------------------------------------------------- §6 auth --

children.push(
  h1('6. Authentication and authorisation'),
  table(
    ['Mechanism', 'Parameter', 'Detail'],
    [
      [
        'Password hashing',
        'argon2id',
        '19 MiB memory, t=2, p=1 — the OWASP baseline. Memory-hard, so offline cracking is expensive',
      ],
      ['Access token', '15 minutes', 'Signed JWT via jose, carrying subject and admin flag only'],
      ['Refresh token', '30 days', 'Opaque, stored as a peppered hash, rotated on every use'],
      [
        'Reuse detection',
        'family revoke',
        'Presenting a spent refresh token revokes the whole family — reuse means it leaked',
      ],
      [
        'One-time codes',
        '15 min · 5 tries',
        'Six digits from a CSPRNG, stored hashed with a domain-separated prefix',
      ],
      [
        'Client storage',
        'Keystore',
        'Android Keystore-backed storage; app data excluded from Android backups',
      ],
    ],
    [20, 18, 62],
  ),
  spacer(),
  h2('Authorisation model'),
  p(
    'There are no roles beyond one boolean. Authorisation is ownership, checked in the service layer before any row is touched, and every query carries a user_id predicate.',
  ),
  callout('404, not 403', [
    'A failed ownership check answers 404. A 403 would confirm the resource exists, which turns any id-addressed endpoint into an enumeration oracle. The same rule governs /admin/* — a non-admin receives 404 — and athlete profiles, where an account that has not opted into the ranking is indistinguishable from one that does not exist.',
    'This is not left to review. A dedicated suite has one account create every kind of resource, then attempts every id-addressed operation as a second account and requires 404 from all of them, plus a check that the first account’s data is unchanged afterwards.',
  ]),

  new Paragraph({ children: [new PageBreak()] }),
);

// ---------------------------------------------------------- §7 security --

children.push(
  h1('7. Security layers'),
  p(
    'Ten layers, each with what is implemented and its honest status. Cross-tenant isolation is the wall; everything else is damage limitation.',
  ),
  table(
    ['#', 'Layer', 'Implementation', 'Status'],
    [
      ['1', 'Transport', 'HTTPS with HSTS. Security headers via @fastify/helmet', 'Enforced'],
      [
        '2',
        'Identity',
        'argon2id, rotating refresh tokens, family revoke on reuse, hashed OTPs',
        'Enforced',
      ],
      [
        '3',
        'Tenant isolation',
        'Ownership checked before every mutation; user_id in every query; 404 on failure',
        'Tested',
      ],
      [
        '4',
        'Input validation',
        'Zod at every boundary, unknown keys rejected, DB CHECKs as a backstop',
        'Enforced',
      ],
      [
        '5',
        'Injection',
        'Drizzle parameterised queries only; no string-built SQL. Held current for a known CVE',
        'Enforced',
      ],
      [
        '6',
        'Rate limiting',
        'Auth 10/min · admin 30/min · global 300/min',
        'In-memory (per instance)',
      ],
      [
        '7',
        'CORS',
        'Exact-match allowlist from env; never * outside development',
        'Regression-tested',
      ],
      [
        '8',
        'Secrets',
        'Env and platform config only. Keystore gitignored; verified absent from tracked files',
        'Enforced',
      ],
      [
        '9',
        'Log privacy',
        'Correlation id on every line. Never logs email, tokens, codes, PII or request bodies',
        'Enforced',
      ],
      [
        '10',
        'Dependency hygiene',
        'pnpm audit in CI. 5 advisories reduced to 2, both in an iOS-only generator',
        'Non-blocking',
      ],
    ],
    [5, 20, 55, 20],
  ),
  spacer(),
  h2('Client hardening'),
  bullet(
    'Android permissions: 11, down from 28. Launcher-badge and install-referrer entries pulled in by transitive libraries were removed. WAKE_LOCK, RECEIVE_BOOT_COMPLETED and c2dm.RECEIVE were kept deliberately — the rest timer needs them.',
  ),
  bullet('allowBackup=false, so app data is excluded from Android’s cloud backup.'),
  bullet(
    'The signing certificate is verified identical across every release and recorded in the version log, so a changed signing identity is visible in a pull request rather than discovered by a user whose update refuses to install.',
  ),
  bullet(
    'The markdown renderer serving the privacy policy uses a scheme allowlist, so an unrecognised scheme degrades to plain text and javascript:/data: hrefs cannot become live links. Fifteen tests cover it.',
  ),
  spacer(),
  callout('Consent as a hard requirement', [
    'The ranking is opt-in and off by default, because training data is health-adjacent. When athlete profiles were added — publishing personal records — the existing consent text said individual lifts were never published.',
    'That promise no longer held, so a migration reset every existing opt-in and everyone re-consented against the new list. Bodyweight remains excluded even though it would make the strength figures more meaningful: it describes a person’s body, not their training.',
  ]),

  new Paragraph({ children: [new PageBreak()] }),
);

// ----------------------------------------------------------- §8 themes --

children.push(
  h1('8. Theming — the Ascension system'),
  p(
    'A user picks one of seven Ascensions at first launch. It renames every tier, recolours the app, redraws every tier icon, changes the wallpaper behind each screen and renames the rank badges. It changes nothing else, and that constraint is enforced by the type system rather than trusted.',
  ),
  table(
    ['Ascension', 'Tier ladder, E to S', 'Calls a level'],
    [
      [
        'The Monarch',
        'E-Rank Hunter → Awakened → Elite Hunter → National Level → Shadow Sovereign → Monarch',
        'Level',
      ],
      [
        'The Saiyan',
        'Base Form → Kaioken → Super Saiyan → Ascended → Beyond Ascended → Ultra Instinct',
        'Power Level',
      ],
      ['The Shinobi', 'Academy Student → Genin → Chunin → Jonin → Sannin → Hokage', 'Rank'],
      [
        'The Shinigami',
        'Substitute → Shinigami → Visored → Bankai → Final Form → Soul King',
        'Reiatsu',
      ],
      ['The Pirate', 'Rookie → Supernova → Haki → Awakened Gear → Gear Five → Nika', 'Bounty'],
      ['The Hero', 'C-Class → B-Class → A-Class → S-Class → Serious → One Punch', 'Class'],
      [
        'The Successor',
        'Quirkless → Inherited → Five Percent → Full Cowl → Blackwhip → Ninth',
        'Percentage',
      ],
    ],
    [18, 62, 20],
  ),
  spacer(),
  h2('How it is kept honest'),
  bullet(
    'Rank stays E–S internally, in the database and on the wire. An Ascension is a lookup from that rank to a name — never a second opinion about what rank you are.',
  ),
  bullet(
    'Six tiers, enforced at compile time. The ladder is built from a six-tuple keyed by rank, so TypeScript rejects an Ascension that miscounts, and a total Record removes the "tier not found" branch entirely.',
  ),
  bullet(
    'Unlock levels are asserted identical across all seven — 1, 10, 20, 35, 55, 80 — and the picker displays them. If one Ascension levelled faster, the leaderboard would be meaningless and people would pick the strong one rather than the one they like.',
  ),
  bullet(
    'Contrast is measured, not trusted. Every accent clears WCAG AA 4.5:1 on its own ground, in a test.',
  ),
  bullet(
    'Forty-two tier icons are drawn from data — geometry and colour in the domain package, one renderer in the client. No image files to fetch, licence or keep in step with seven palettes.',
  ),
  bullet(
    'Rank badges follow the Ascension too. Only the rank badges: Centurion and One Tonne describe the work rather than the world. The stored key never changes, so nothing earned can be affected.',
  ),
  spacer(),
  callout('A measurement worth stealing', [
    'Asserting the gold highlight was distinguishable from the blue accent failed using WCAG contrast — it scored 1.08. Contrast compares luminance only, and those two differ almost entirely by hue.',
    'Distinguishability needs a perceptual metric, so the test computes CIE76 ΔE instead. Contrast for text on a ground; ΔE for two colours side by side.',
  ]),

  new Paragraph({ children: [new PageBreak()] }),
);

// ----------------------------------------------------- §9 third parties --

children.push(
  h1('9. Third parties'),
  p(
    'Seven external services. Each is listed with exactly what reaches it, because the privacy policy has to name them and a vague answer there is worthless.',
  ),
  table(
    ['Service', 'Purpose', 'What it receives', 'Tier'],
    [
      ['Neon', 'PostgreSQL', 'All application data. Singapore, encrypted at rest', 'Free · 512 MB'],
      ['Render', 'API hosting', 'Runs the server. Singapore', 'Free · 750 h/mo'],
      [
        'Netlify',
        'Web app hosting',
        'Serves the browser build. Sees visitors’ IP addresses',
        'Free',
      ],
      [
        'Brevo',
        'Transactional email',
        'Email address and message body, only when a code is sent',
        'Free',
      ],
      [
        'Cloudflare R2',
        'Media object store',
        'Exercise media. Chosen for zero egress; presigned short-TTL URLs',
        'Free · 10 GB',
      ],
      [
        'jsDelivr',
        'Demonstration images',
        'The device’s IP and which image — the one third party the client contacts directly',
        'Free CDN',
      ],
      [
        'Open Food Facts',
        'Barcode lookup',
        'Nothing about the user. The server proxies, so it sees us and not them',
        'Free',
      ],
    ],
    [16, 20, 48, 16],
  ),
  spacer(),
  p(
    'There is no analytics, no advertising, no telemetry and no third-party SDK collecting anything in the background. The barcode scanner sends only the decoded number, and only to our own server.',
    { bold: false },
  ),

  new Paragraph({ children: [new PageBreak()] }),
);

// ------------------------------------------------------------ §10 VCS --

children.push(
  h1('10. Version control'),
  bullet(
    'Single Git repository, trunk-based on main. pnpm workspaces with nodeLinker: hoisted, and the package manager version pinned in packageManager so every machine resolves identically.',
  ),
  bullet(
    'Requirement IDs from the frozen BRD (FR-*, NFR-*) are the contract and are referenced in commits. Messages record why — including the cost of a decision and any bug the work uncovered.',
  ),
  bullet(
    'build-output/README.md is a tracked version log: version, versionCode, package id, APK digest and signing certificate. Binaries are not committed — ~72 MB each, and history keeps everything forever.',
  ),
  bullet(
    'Five ADRs in docs/adr/. New infrastructure requires an ADR proposal rather than a dependency, which is what has kept the runtime surface this small.',
  ),
  spacer(),
  callout('The version log is history, not state', [
    'When the package id changed, a blanket rename rewrote the log so earlier releases appeared to have shipped under the new id. That was reverted deliberately: the file exists to record which binary carried which id and which certificate, and rewriting it destroys the only account of that.',
  ]),

  new Paragraph({ children: [new PageBreak()] }),
);

// ------------------------------------------------------ §11 pipelines --

children.push(
  h1('11. Pipelines'),
  p(
    'Five CI jobs on GitHub Actions, two deploy pipelines — Render for the API and Netlify for the web app — one scheduled keep-warm, and a local release script. All configured as code in the repository.',
  ),
  h2('Continuous integration'),
  table(
    ['Job', 'Runs', 'Notes'],
    [
      [
        'quality',
        'typecheck, lint, format:check, unit tests with coverage',
        'The 100% domain gate fails the build',
      ],
      [
        'security',
        'pnpm audit',
        'Non-blocking by choice — a transitive advisory in a dev-only tool should not stop a release',
      ],
      [
        'integration',
        'Migrations then integration suites against a Postgres service container',
        'Locally these skip unless TEST_DATABASE_URL is set; CI always provides one',
      ],
      [
        'cors',
        'The CORS allowlist regression suite',
        'Its own job because native Android sends no Origin header, so a browser check is the only real one',
      ],
      [
        'web',
        'The browser build, then check-web-headers',
        'Fails on a stale CSP hash, on unsafe-inline in script-src, or a dynamic route with no rewrite',
      ],
    ],
    [14, 40, 46],
  ),
  spacer(),
  callout('A pipeline that never ran', [
    'CI failed on every commit for weeks. The cause was pnpm/action-setup being given an explicit version: while the repository also pinned packageManager — a hard conflict that fails during setup, so no test had ever executed.',
    'Removing the field fixed it. A red pipeline nobody reads is worse than no pipeline, because it looks like coverage.',
  ]),
  spacer(),
  h2('Deployment — Render (API)'),
  code([
    'buildCommand:  corepack enable',
    '            && pnpm install --frozen-lockfile --prod=false --filter @fi/api...',
    '            && pnpm --filter @fi/api build',
    '            && node apps/api/dist/migrate.js',
    '',
    'startCommand:  node apps/api/dist/index.js',
    'healthCheck:   /health   (returns the running commit SHA)',
  ]),
  bullet(
    'Migrations run in the build step, before the new code serves traffic. Render only offers a pre-deploy hook on paid plans, so appending to the build command preserves the ordering guarantee with one less moving part.',
  ),
  bullet(
    '--filter @fi/api... installs the API and the two workspace packages it needs, and nothing else — the Expo app’s dependencies are hundreds of megabytes the server has no use for.',
  ),
  bullet(
    '/health returns the running commit, which makes "is my change deployed?" a question with a factual answer rather than a guess.',
  ),
  spacer(),
  h2('Deployment — Netlify (web)'),
  p(
    'The export is 4.1 MB across 37 routes, each statically rendered to its own HTML file, so deep links resolve with no single-page rewrite. Only the six dynamic routes need one, and those are generated from the export.',
  ),
  callout('Why the host config is generated, not written', [
    'On Android the session lives in Keystore-backed storage. On web there is no equivalent, so it lives in localStorage, readable by any injected script. A strict Content-Security-Policy is the mitigation, and strict means no script-src unsafe-inline.',
    'Expo emits one inline bootstrap per page. It is allowed by SHA-256 hash, computed from the export that was just built — so an Expo upgrade moves the hash rather than silently blocking the script and serving a blank white page. That failure has the worst possible shape: no failing test, a green deploy, and a console error nobody sees.',
    'check-web-headers.mjs runs in CI immediately afterwards and has been verified to exit non-zero on a tampered policy.',
  ]),
  spacer(),
  h2('Keep-warm'),
  p(
    'A free Render instance spins down after ~15 minutes idle and cold-starts in 25–45 seconds, which reads as a hang rather than a wait. A scheduled workflow pings /health every 10 minutes between 04:00 and 19:00 UTC — not around the clock, because the free plan is 750 instance-hours a month across all services and staying awake 24/7 is 730 of them.',
  ),
  h2('Release'),
  code([
    'pnpm apk            prebuild → Gradle → sign → copy to build-output/',
    'pnpm apk --clean    required after any NATIVE change',
    '',
    'Refuses to run without credentials/keystore.env, because Gradle otherwise',
    'falls back to the DEBUG key silently and the APK cannot install over anything.',
  ]),
  p(
    'Verification is manual and deliberate: apksigner verify --print-certs must match the digest in the version log. These APKs are v2/v3-signed only, so there is no META-INF/*.RSA to unzip — the signature lives in the APK Signing Block, which is not a zip entry at all.',
  ),

  new Paragraph({ children: [new PageBreak()] }),
);

// ------------------------------------------------------ §12 decisions --

children.push(
  h1('12. Decisions and trade-offs'),
  h2('Object storage for user video'),
  table(
    ['Option', 'Free storage', 'Egress', 'Verdict'],
    [
      [
        'Cloudflare R2',
        '10 GB',
        'Free, unmetered',
        'CHOSEN — S3-compatible, and already modelled in the media schema',
      ],
      [
        'Backblaze B2',
        '10 GB',
        '3× stored, then charged',
        'Free only behind Cloudflare — two accounts to manage',
      ],
      ['Supabase Storage', '1 GB', '5 GB/mo', '~160 clips in total. Too small to bother wiring up'],
      [
        'Cloudinary',
        '~25 GB',
        'Shared credits',
        'Would transcode for us, but video burns credits opaquely',
      ],
      ['Postgres bytea', '512 MB', '—', 'Shares the app’s only database. Not seriously an option'],
    ],
    [22, 16, 22, 40],
  ),
  spacer(),
  p(
    'Egress is the number that actually matters for video, not storage — a clip is written once and watched repeatedly, so metered egress scales the bill with how much people enjoy the feature. The rule that keeps it inside the free tier: the video is evidence, the path is the data. A tracked bar path is under 20 KB and lives in Postgres permanently; clips live in R2 under a lifecycle rule.',
  ),
  h2('Other decisions'),
  table(
    ['Question', 'Chosen', 'Rejected, and why'],
    [
      [
        'Repository shape',
        'pnpm monorepo, 4 workspaces',
        'Polyrepo — the API contract would drift between two repos within a week',
      ],
      ['ORM', 'Drizzle', 'Prisma’s engine binary and generate step; raw SQL loses the schema diff'],
      [
        'API style',
        'REST + Zod',
        'GraphQL — a resolver layer and a schema language for one client',
      ],
      [
        'Money-like values',
        'Fixed-point integers',
        'Floats. 0.1 + 0.2 has no place near someone’s training log',
      ],
      [
        'Level storage',
        'Derived from an XP ledger',
        'A stored level column, which can disagree with its own history',
      ],
      [
        'Character art',
        'Generated figures',
        'Licensed artwork — the one asset that cannot be swapped later without redrawing the screen around it',
      ],
      [
        'Notification sound',
        'Synthesised by a committed script',
        'A stock clip, which arrives with terms attached',
      ],
      [
        'Infrastructure',
        'Managed free tiers',
        'Docker, Kubernetes, Redis, Kafka — each needs an ADR, and none has earned one',
      ],
    ],
    [20, 26, 54],
  ),

  new Paragraph({ children: [new PageBreak()] }),
);

// --------------------------------------------------------- §13 limits --

children.push(
  h1('13. Known limits'),
  p(
    'Stated because a document that only lists strengths is not a technical document. None of these is a surprise; all are consequences of choices above.',
  ),
  table(
    ['Limit', 'Consequence', 'Status'],
    [
      [
        'Single free instance, no horizontal scale',
        'Rate limits are in-process, so they are per-instance. Cold starts remain possible outside keep-warm hours',
        'Accepted',
      ],
      [
        'No independent security audit',
        'Everything in §7 is self-assessed. A written self-assessment naming what was not checked is published in the repository',
        'Disclosed',
      ],
      [
        'Web sessions live in localStorage',
        'No Keystore equivalent exists in a browser. Mitigated by a strict CSP and short-lived rotating tokens, not eliminated',
        'Mitigated',
      ],
      [
        'Integration suites are latency-bound',
        'One test logs four sessions and only one workout may be active at a time, so its round trips cannot be parallelised',
        'Mitigated',
      ],
      [
        'Deploy previews are refused by CORS',
        'Each preview gets its own origin and must be added by hand. Deliberate — an allowlist that admits every preview admits anyone who opens a PR',
        'By design',
      ],
      [
        'Sender domain not verified',
        'EMAIL_FROM is a Gmail address, so DMARC alignment fails and some codes will be spam-filtered',
        'Open',
      ],
      [
        'Bar-path capture not built',
        'The domain maths is complete and tested; storage, capture and tracking are designed but unimplemented',
        'Designed only',
      ],
      [
        'Tier names are placeholders',
        'They belong to other people and must be replaced before publication. Deliberately data-only, so the swap is one file',
        'Must change',
      ],
      [
        'iOS not shipped',
        'The client is already cross-platform and configured, but distribution needs a paid Apple account; TestFlight is the route',
        'Ready, not built',
      ],
      [
        'No independent backup',
        'Recovery depends on Neon’s own retention. The Android signing keystore is likewise not backed up, and cannot be re-keyed if lost',
        'Open',
      ],
    ],
    [26, 56, 18],
  ),
);

// ================================================================ build ==

const doc = new Document({
  creator: 'Ascension',
  title: 'Ascension — Architecture & Security Reference',
  description: 'Technical architecture, security layers, data model and pipelines.',
  styles: {
    default: {
      document: { run: { font: FONT, size: 21, color: MUTED } },
    },
  },
  sections: [
    {
      properties: {
        page: { margin: { top: 1100, right: 1100, bottom: 1100, left: 1100 } },
      },
      headers: {
        default: new Header({
          children: [
            new Paragraph({
              alignment: AlignmentType.RIGHT,
              spacing: { after: 200 },
              children: [
                new TextRun({
                  text: 'Ascension — Architecture & Security Reference · v1.3.0',
                  font: FONT,
                  size: 15,
                  color: FAINT,
                }),
              ],
            }),
          ],
        }),
      },
      footers: {
        default: new Footer({
          children: [
            new Paragraph({
              alignment: AlignmentType.RIGHT,
              children: [
                new TextRun({ text: 'Page ', font: FONT, size: 15, color: FAINT }),
                new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: 15, color: FAINT }),
                new TextRun({ text: ' of ', font: FONT, size: 15, color: FAINT }),
                new TextRun({
                  children: [PageNumber.TOTAL_PAGES],
                  font: FONT,
                  size: 15,
                  color: FAINT,
                }),
              ],
            }),
          ],
        }),
      },
      children,
    },
  ],
});

const out = 'docs/Ascension-Architecture.docx';
const buffer = await Packer.toBuffer(doc);
writeFileSync(out, buffer);
console.log(`wrote ${out} — ${(buffer.length / 1024).toFixed(0)} KB`);
