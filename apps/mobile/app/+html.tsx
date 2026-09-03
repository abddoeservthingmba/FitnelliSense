/**
 * The HTML shell every statically-exported page is wrapped in.
 *
 * This file exists to make the browser build feel like the app rather than
 * like a web page that happens to contain it. Four things it fixes, all of
 * which are invisible in the React tree and therefore cannot be fixed there:
 *
 * 1. **The white flash.** Expo's reset styles the layout but sets no
 *    background, so every load painted white until React mounted and drew the
 *    first screen. On a cold Render instance that is a white page for a good
 *    second, which is the least app-like thing the build did.
 * 2. **The tab title.** It showed the URL.
 * 3. **The browser chrome.** `theme-color` tints Chrome's address bar on
 *    Android, so the browser's own furniture matches the app instead of
 *    framing it in white.
 * 4. **Installability.** With the manifest it can be added to a home screen
 *    and opens without browser chrome at all.
 *
 * The background here is the DEFAULT Ascension's, not the chosen one — a
 * static export cannot know who is loading it. That is the right colour
 * anyway: it matches `LaunchScreen`, so the shell, the launch screen and the
 * first painted frame are one continuous colour rather than three.
 */
import { ScrollViewStyleReset } from 'expo-router/html';
import type { PropsWithChildren } from 'react';

/** ASCENSIONS.monarch.palette.background — the launch screen's ground. */
const SHELL_BACKGROUND = '#050D1F';

export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        {/*
          `viewport-fit=cover` so the app reaches under a notch, matching
          native. Zoom is deliberately NOT disabled: `user-scalable=no` is the
          usual trick for making a web app feel native and it takes pinch-zoom
          away from anyone who needs it (NFR-U-04).
        */}
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />

        <title>Ascension</title>
        <meta
          name="description"
          content="Train. Rank. Repeat. A training log that levels up with you."
        />

        {/* Tints the browser's own chrome to the app's ground. */}
        <meta name="theme-color" content={SHELL_BACKGROUND} />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Ascension" />

        <link rel="manifest" href="/manifest.json" />
        <link rel="icon" href="/favicon.ico" />
        <link rel="apple-touch-icon" href="/icon.png" />

        {/*
          Expo's own reset, which stops the body scrolling so the app's own
          scroll views own it. Without this, two scrollbars fight.
        */}
        <ScrollViewStyleReset />

        {/*
          Painted before any script runs, which is the entire point — this is
          what removes the white flash. `color-scheme: dark` additionally stops
          the browser flashing its own white overscroll and form controls.
        */}
        <style
          dangerouslySetInnerHTML={{
            __html: `
              :root { color-scheme: dark; }
              html, body, #root {
                background-color: ${SHELL_BACKGROUND};
                margin: 0;
              }
              /* The overscroll gutter, so a rubber-band scroll shows the app's
                 colour rather than white. */
              body { overscroll-behavior: none; }
            `,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
