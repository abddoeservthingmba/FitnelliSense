# ARISE — Privacy Policy

**Last updated: 3 September 2026**

ARISE is a training log. This policy describes exactly what it stores, where,
who else sees it, and how to get rid of it.

It is written against what the code actually does rather than from a template.
Where something is uncomfortable — a third party seeing your IP address, a
feature that publishes your name to other users — it is stated plainly rather
than buried.

> **ARISE is currently a private trial** shared with a small number of people.
> It is not on any app store, and there is no company behind it. Treat it
> accordingly: it holds your training data with reasonable care, but it is not
> an established service with a support desk.

---

## 1. Who is responsible

ARISE is run by an individual, not a company.

**Contact for any privacy question, correction or complaint:**
`REPLACE_WITH_CONTACT_EMAIL`

## 2. What ARISE stores

Only what you type in, plus what the app needs to keep you signed in. There is
**no analytics, no advertising, no tracking, and no third-party SDK collecting
anything in the background.**

### Account

| Data          | Why                                                                                         |
| ------------- | ------------------------------------------------------------------------------------------- |
| Email address | Signing in, and sending password reset or verification codes                                |
| Password      | Stored only as an **argon2id hash**. Nobody, including the operator, can read your password |
| Display name  | Shown to you, and to others only if you opt in to the ranking                               |

### Profile — all optional

Bodyweight, date of birth, experience level, training days per week, session
length, preferred units, default rest time, and daily nutrition targets.

Every one of these can be left blank. They are used to prefill sensible
defaults and to estimate nutrition targets — nothing more.

### Training

Workouts, exercises, sets, weights, repetitions, RPE, cardio duration and
distance, personal records, routines, body measurements, and your own custom
exercises.

### Nutrition

Food entries with quantities and their nutrition figures, plus any foods you
create yourself. Custom foods are private to you.

### Progress mechanics

Experience points, levels, tiers, badges, daily quests, and streaks. All of it
is derived from the training data above.

Which **Ascension** you have chosen — the theme that renames your tiers and
recolours the app. It is a display preference and nothing else: every level and
threshold is identical whichever one you pick, so changing it moves nothing you
have earned.

### Technical

Session tokens, stored on your device in Android's Keystore-backed secure
storage. Server logs that record which endpoint was called, a request
identifier, and a **hashed** user id.

**Server logs never contain** your email, your password, a verification code, a
request body, or your name.

### On your device only

Three small preferences are kept in ordinary app storage on your phone, are
never sent anywhere, and are removed when you sign out or uninstall:

- whether the navigation sound is on
- that this device has finished onboarding — so the app can open straight away
  instead of waiting for the server to answer
- which Ascension to colour the app with before your profile has loaded

## 3. What ARISE does NOT do

- No advertising, and no data is ever sold or rented.
- No analytics or product telemetry of any kind.
- No location tracking. ARISE never requests location permission.
- No contacts, no photo library, no microphone.
- No profiling, and no automated decision-making with legal effects.
- No cookies, and no cross-site tracking.
- **The camera is used only to read a food barcode.** No image is stored,
  transmitted, or seen by anyone — only the decoded number is sent, and only
  to our own server.

## 4. Where it is stored

|                    |                                                     |
| ------------------ | --------------------------------------------------- |
| Database           | **Neon** (PostgreSQL), Singapore (`ap-southeast-1`) |
| Application server | **Render**, Singapore                               |

If you are in India or the EU, your data is therefore processed **outside your
country**, in Singapore. Both providers encrypt data at rest, and every
connection between the app and the server uses HTTPS.

## 5. Who else can see it

Four third parties are involved. Each is listed with exactly what reaches it.

### Brevo — sending email

Receives **your email address** and the message body, only when a verification
or password-reset code is sent. It never receives your training or nutrition
data. [Brevo privacy policy](https://www.brevo.com/legal/privacypolicy/)

### jsDelivr — exercise demonstration images

Exercise demonstration images are hosted on the jsDelivr CDN, and **your device
fetches them directly**. That means jsDelivr can see your IP address and which
image was requested — and therefore, in principle, which exercise you were
looking at.

It does not see your account, your name, or anything you have logged. This is
the one place the app talks to a third party without going through our server,
and it exists because it avoids copying and re-hosting several hundred images.
[jsDelivr privacy policy](https://www.jsdelivr.com/terms/privacy-policy-jsdelivr-net)

### Open Food Facts — food and barcode lookups

**Your device never contacts Open Food Facts.** Searches and barcode lookups go
to our server, which asks on your behalf. Open Food Facts sees our server, not
you, and never learns who searched or what account it was for.

### Neon and Render — the infrastructure above

They hold the data because they host the database and the server. Neither
analyses it.

## 6. The ranking publishes some of your data

The ranking is **off by default**. Nothing about you is visible to another user
until you turn it on in your profile.

> **This section changed on 3 September 2026, and it now covers more than it
> did.** Ranking profiles were added, which publish personal records — and the
> previous version of this policy said individual lifts were never published.
> Because that promise no longer held, **every existing opt-in was switched
> off** and everyone has to opt in again against the list below. Nobody's
> records were published under the old wording.

If you turn it on, other users of ARISE can see the following, and nothing
else.

**On the ranking list:**

- your display name
- your level and tier
- your experience points
- your total volume lifted
- your number of sessions in the window

**On your profile, which any signed-in user can open from the ranking:**

- your personal records — the exercise name, the record type, the weight and
  the reps
- how much volume you have done per muscle group, and how many sets
- the same level, tier and totals as the list

**Never published, even when opted in:** your email address, your bodyweight,
your date of birth, anything you eat or log in Food, any note you have written,
the dates and times you trained, your individual sessions, or your custom
exercises and foods.

Bodyweight is excluded deliberately. It would make the strength figures more
meaningful, and it is still not shared: it is information about your body
rather than about your training, and agreeing to be ranked on training is not
agreeing to publish it.

Switching the ranking off removes you from the list and makes your profile
unavailable again, immediately.

## 7. Other users cannot see anything else

Beyond section 6, every request is scoped to the account making it. One account
cannot read or change another's workouts, routines, foods, notes or profile —
enforced at the database query level, and covered by automated tests that
attempt exactly that and require it to fail.

A profile belonging to someone who has not opted in does not merely refuse to
load; the server answers as though the account does not exist. That is
deliberate, so this cannot be used to find out who has an ARISE account.

## 8. How long it is kept

Your data is kept until you delete it.

**Deleting your account** immediately anonymises it: the email address is
released and the login credentials are destroyed, so nobody can sign in. The
underlying rows are then removed within 30 days.

## 9. Your rights

You can, at any time and without asking anyone:

- **See everything.** Profile → _Export my data_ returns every row ARISE holds
  about you, as JSON.
- **Correct it.** Every profile field and every logged entry is editable, and
  entries can be deleted outright.
- **Delete your account.** Profile → _Delete account_.
- **Leave the ranking.** One switch, effective immediately.
- **Object or complain.** Email the contact address above.

Under India's Digital Personal Data Protection Act 2023, and the GDPR if you
are in the EU or UK, you also have the right to lodge a complaint with your data
protection authority.

## 10. Security

- Passwords hashed with **argon2id** — a memory-hard algorithm chosen to make
  offline cracking expensive.
- Access tokens expire after 15 minutes. Refresh tokens are opaque, stored only
  as a peppered hash, and rotate on every use; reusing an old one revokes the
  whole family, because reuse means it leaked.
- One-time codes are six digits, expire in 15 minutes, allow five wrong
  guesses, and are stored hashed.
- On your phone, tokens live in Android's Keystore-backed secure storage, and
  the app's data is excluded from Android backups.
- HTTPS everywhere, with HSTS.

No system is perfect, and this one has not had an independent security audit.
A written self-assessment, including what has **not** been checked, is public at
[docs/security.md](https://github.com/abddoeservthingmba/FitnelliSense/blob/main/docs/security.md).

## 11. Children

ARISE is not intended for anyone under 16, and accounts should not be created
for children. If you believe a child has created an account, email the contact
address and it will be deleted.

## 12. Health data

Training and nutrition information is health-adjacent, and in some countries
counts as health data with extra protection. It is treated as sensitive
throughout: never published without the explicit ranking opt-in, never sold,
never analysed for advertising.

**ARISE gives no medical or dietary advice.** Nutrition targets are estimates
derived from figures you provided, they are always overrideable, and nothing in
the app is scored against them. Ask a doctor or a dietitian, not a phone.

## 13. Changes

Material changes will be announced in the app before they take effect. The date
at the top of this page always reflects the current version, and the full
history is public in the repository.
