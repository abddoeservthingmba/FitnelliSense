/**
 * Process entry point.
 *
 * Configuration is validated before anything else, so a misconfigured deploy
 * fails loudly at boot rather than quietly at request time (BRD §12.3).
 */
import { buildApp } from './app';
import { ConfigError, loadConfig } from './config';
import { createDatabase } from './db/client';
import { createMailer, providerFor } from './lib/mailer';
import { createFoodLookup } from './lib/open-food-facts';
import { createStorage } from './lib/r2';

async function main(): Promise<void> {
  const config = loadConfig();
  const database = createDatabase(config);
  const storage = createStorage(config);
  const mailer = createMailer({
    brevoApiKey: config.BREVO_API_KEY,
    resendApiKey: config.RESEND_API_KEY,
    from: config.EMAIL_FROM,
    timeoutMs: config.EMAIL_TIMEOUT_MS,
  });

  const foodLookup = createFoodLookup({ timeoutMs: config.FOOD_LOOKUP_TIMEOUT_MS });

  const app = await buildApp({
    config,
    database,
    storage,
    mailer,
    foodLookup,
    tokens: {
      accessSecret: config.JWT_ACCESS_SECRET,
      refreshPepper: config.JWT_REFRESH_PEPPER,
      accessTtlSecs: config.ACCESS_TOKEN_TTL,
      refreshTtlSecs: config.REFRESH_TOKEN_TTL,
    },
    startedAt: new Date(),
  });

  const shutdown = async (signal: string): Promise<void> => {
    app.log.info({ signal }, 'shutting down');
    await app.close();
    await database.close();
    process.exit(0);
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  await app.listen({ port: config.PORT, host: config.HOST });
  app.log.info(
    {
      port: config.PORT,
      commit: config.COMMIT_SHA,
      r2: config.r2Configured,
      email: providerFor({ brevoApiKey: config.BREVO_API_KEY, resendApiKey: config.RESEND_API_KEY }) ?? 'none',
    },
    'api listening',
  );
  // Worth saying once and loudly: without this, verification and password
  // reset both accept requests and deliver nothing.
  if (!config.emailConfigured) {
    app.log.warn(
      'No email provider configured (set BREVO_API_KEY or RESEND_API_KEY) — verification and reset emails will not be sent',
    );
  }
}

main().catch((error: unknown) => {
  if (error instanceof ConfigError) {
    console.error(error.message);
    process.exit(78); // EX_CONFIG
  }
  console.error('Failed to start:', error);
  process.exit(1);
});
