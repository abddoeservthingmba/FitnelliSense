/**
 * Password quality (FR-AUTH-02, NFR-S-01).
 *
 * BRD §6.1 sets a 12-character floor and deliberately no composition rules,
 * because forced symbols and digits produce `Passw0rd!` rather than security.
 * Length is the right primary rule.
 *
 * But length alone lets through `passwordpassword`, `aaaaaaaaaaaa` and
 * `123456789012`, all of which are twelve characters and all of which are in
 * every cracking dictionary. This module rejects the small set of passwords
 * that are weak *despite* being long.
 *
 * The rules are deliberately few. Every additional rule is a person locked out
 * of a password they would have remembered, and the marginal attacker is not
 * stopped by rule twelve. These are the patterns that actually appear at the
 * top of breach corpora.
 */

/**
 * A reason a password was rejected, phrased for the person who typed it.
 *
 * Never phrased as "your password is bad" — it says what to change.
 */
export interface PasswordProblem {
  readonly code: 'too-short' | 'repeated' | 'sequence' | 'common' | 'contains-identity';
  readonly message: string;
}

/** BRD §6.1. Length is the rule that does the real work. */
export const MIN_PASSWORD_LENGTH = 12;

/**
 * Long passwords that are still trivially guessable.
 *
 * Short entries like `password` are not listed: the length floor already
 * rejects them. These are the twelve-plus-character strings that appear near
 * the top of published breach lists.
 */
const COMMON_LONG_PASSWORDS = new Set([
  'passwordpassword',
  'password123456',
  'password1234',
  'passw0rdpassw0rd',
  '123456789012',
  '1234567890123',
  '12345678901234',
  '123456789101112',
  'qwertyuiopas',
  'qwertyuiop123',
  'qwertyuiopasdf',
  'iloveyouiloveyou',
  'letmeinletmein',
  'administrator',
  'welcome123456',
  'trustno1trustno1',
  'football123456',
  'superman12345',
  'abcdefghijkl',
  'abcd1234abcd',
  'zaq12wsxzaq12wsx',
  '1q2w3e4r5t6y',
  'qazwsxedcrfv',
  'thisismypassword',
  'mypasswordismypassword',
  'fitnessintellisense',
]);

/** Keyboard runs and alphabets, forwards. Reversed forms are checked too. */
const SEQUENCES = [
  'abcdefghijklmnopqrstuvwxyz',
  '01234567890',
  'qwertyuiop',
  'asdfghjkl',
  'zxcvbnm',
];

function isRepeatedCharacter(value: string): boolean {
  return value.length > 0 && new Set(value).size === 1;
}

/**
 * A short repeating unit tiled to length — `abcabcabcabc`, `12341234`.
 *
 * Checks units up to a quarter of the length: `abcdefabcdef` is a real
 * repetition, whereas a "unit" half the password long is not a meaningful
 * pattern to reject.
 */
function isRepeatedUnit(value: string): boolean {
  for (let size = 1; size <= Math.floor(value.length / 2); size += 1) {
    if (value.length % size !== 0) continue;
    const unit = value.slice(0, size);
    if (unit.repeat(value.length / size) === value) return true;
  }
  return false;
}

/** Whether the whole password is a run along one of the sequences. */
function isSequence(value: string): boolean {
  const lowered = value.toLowerCase();
  for (const sequence of SEQUENCES) {
    const reversed = [...sequence].reverse().join('');
    // Repeat the ring so wrap-around runs (`yz` into `ab`) are not missed.
    if ((sequence + sequence).includes(lowered)) return true;
    if ((reversed + reversed).includes(lowered)) return true;
  }
  return false;
}

/**
 * Whether the password is mostly the user's own email or display name.
 *
 * Someone whose password is their email address has effectively no password,
 * because the attacker already has the email — it is the other half of the
 * credential pair they are typing into the same form.
 */
function containsIdentity(password: string, identity: readonly string[]): boolean {
  const lowered = password.toLowerCase();
  for (const raw of identity) {
    // The local part of an email; the whole string otherwise.
    //
    // Written with `indexOf` rather than `split('@')[0] ?? ''` because that
    // form needs a fallback for an element `split` can never fail to return —
    // an unreachable branch, and unreachable branches fight the 100% coverage
    // bar for no benefit. Both arms here are real cases: an address, and a name.
    const at = raw.indexOf('@');
    const part = (at === -1 ? raw : raw.slice(0, at)).toLowerCase().trim();
    // Below four characters this would reject far too much by coincidence.
    if (part.length < 4) continue;
    if (lowered.includes(part)) return true;
  }
  return false;
}

/**
 * Checks a password, returning the first problem or null.
 *
 * First rather than all: a list of five complaints about one password is
 * demoralising, and fixing the first usually fixes the rest.
 */
export function checkPassword(
  password: string,
  identity: readonly string[] = [],
): PasswordProblem | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return {
      code: 'too-short',
      message: `Use at least ${MIN_PASSWORD_LENGTH} characters. A few unrelated words is the easiest way to get there.`,
    };
  }

  const normalised = password.toLowerCase();

  if (isRepeatedCharacter(password) || isRepeatedUnit(normalised)) {
    return {
      code: 'repeated',
      message: 'That is the same thing repeated. Try a few unrelated words instead.',
    };
  }

  if (isSequence(password)) {
    return {
      code: 'sequence',
      message: 'That is a straight run along the keyboard. Try a few unrelated words instead.',
    };
  }

  if (COMMON_LONG_PASSWORDS.has(normalised)) {
    return {
      code: 'common',
      message: 'That password appears in public breach lists. Please pick another.',
    };
  }

  if (containsIdentity(password, identity)) {
    return {
      code: 'contains-identity',
      message:
        'That is too close to your email or name — anyone guessing already knows both. Try something unrelated.',
    };
  }

  return null;
}
