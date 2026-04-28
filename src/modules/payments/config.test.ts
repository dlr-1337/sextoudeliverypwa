import { describe, expect, it } from "vitest";

import {
  FAKE_DEV_PAYMENT_ENV_KEYS,
  PaymentConfigError,
  createFakeDevPaymentConfigGetter,
  getFakeDevPaymentConfig,
  getPublicPaymentConfigErrorMessage,
  isPaymentConfigError,
  parseFakeDevPaymentConfig,
  safeParseFakeDevPaymentConfig,
  type PaymentConfigEnv,
  type PaymentConfigIssue,
} from "./config";
import { PAYMENT_GATEWAY_PROVIDER_FAKE_DEV } from "./types";

const VALID_FAKE_PAYMENT_ENV = {
  FAKE_PAYMENT_PROVIDER: " enabled ",
  FAKE_PAYMENT_WEBHOOK_SECRET: " 0123456789abcdef0123456789abcdef ",
  FAKE_PAYMENT_APPROVAL_MODE: " manual ",
  PATH: "/usr/bin",
} as const satisfies PaymentConfigEnv;

describe("fake/dev payment config", () => {
  it("parses valid fake/dev config lazily through safe parse and getter helpers", () => {
    expect(parseFakeDevPaymentConfig(VALID_FAKE_PAYMENT_ENV)).toEqual({
      provider: PAYMENT_GATEWAY_PROVIDER_FAKE_DEV,
      enabled: true,
      approvalMode: "manual",
      webhookSecret: "0123456789abcdef0123456789abcdef",
    });

    expect(getFakeDevPaymentConfig(VALID_FAKE_PAYMENT_ENV)).toEqual(
      parseFakeDevPaymentConfig(VALID_FAKE_PAYMENT_ENV),
    );

    const getter = createFakeDevPaymentConfigGetter(
      () => VALID_FAKE_PAYMENT_ENV,
    );
    expect(getter()).toEqual(parseFakeDevPaymentConfig(VALID_FAKE_PAYMENT_ENV));

    expect(safeParseFakeDevPaymentConfig(VALID_FAKE_PAYMENT_ENV)).toEqual({
      success: true,
      data: parseFakeDevPaymentConfig(VALID_FAKE_PAYMENT_ENV),
    });
  });

  it("reports an empty env and each missing required key by key name only", () => {
    expect(() => parseFakeDevPaymentConfig({})).toThrow(PaymentConfigError);

    const emptyEnvError = expectConfigError(
      {},
      FAKE_DEV_PAYMENT_ENV_KEYS.map((key) => ({
        key,
        code: "PAYMENT_CONFIG_MISSING_KEY",
      })),
    );

    expect(emptyEnvError.keys).toEqual([...FAKE_DEV_PAYMENT_ENV_KEYS].sort());
    expect(emptyEnvError.resultCodes).toEqual(["PAYMENT_CONFIG_MISSING_KEY"]);

    for (const key of FAKE_DEV_PAYMENT_ENV_KEYS) {
      const env: PaymentConfigEnv = { ...VALID_FAKE_PAYMENT_ENV };
      delete env[key];

      const error = expectConfigError(env, [
        { key, code: "PAYMENT_CONFIG_MISSING_KEY" },
      ]);

      expect(error.keys).toEqual([key]);
      expect(error.message).toContain(key);
    }
  });

  it("rejects unsupported provider and approval mode without echoing submitted values", () => {
    const unsupportedProvider = "provider-token-do-not-print";
    const unsupportedMode = "automatic-approval-do-not-print";

    const error = expectConfigError(
      {
        ...VALID_FAKE_PAYMENT_ENV,
        FAKE_PAYMENT_PROVIDER: unsupportedProvider,
        FAKE_PAYMENT_APPROVAL_MODE: unsupportedMode,
      },
      [
        {
          key: "FAKE_PAYMENT_PROVIDER",
          code: "PAYMENT_CONFIG_UNSUPPORTED_PROVIDER",
        },
        {
          key: "FAKE_PAYMENT_APPROVAL_MODE",
          code: "PAYMENT_CONFIG_UNSUPPORTED_APPROVAL_MODE",
        },
      ],
    );

    expectNoSecretLeak(error, [unsupportedProvider, unsupportedMode]);
  });

  it("rejects weak webhook secrets shorter than 32 characters without leaking the secret", () => {
    const weakSecret = "short-secret-do-not-print";

    const error = expectConfigError(
      {
        ...VALID_FAKE_PAYMENT_ENV,
        FAKE_PAYMENT_WEBHOOK_SECRET: weakSecret,
      },
      [
        {
          key: "FAKE_PAYMENT_WEBHOOK_SECRET",
          code: "PAYMENT_CONFIG_WEAK_WEBHOOK_SECRET",
        },
      ],
    );

    expect(error.keys).toEqual(["FAKE_PAYMENT_WEBHOOK_SECRET"]);
    expectNoSecretLeak(error, [weakSecret]);
  });

  it("rejects unknown FAKE_PAYMENT_* keys while allowing unrelated process env keys", () => {
    const unknownValue = "gateway-debug-token-do-not-print";

    const error = expectConfigError(
      {
        ...VALID_FAKE_PAYMENT_ENV,
        FAKE_PAYMENT_TIMEOUT_MS: unknownValue,
        DATABASE_URL: "postgresql://user:password@example.invalid/db",
      },
      [
        {
          key: "FAKE_PAYMENT_TIMEOUT_MS",
          code: "PAYMENT_CONFIG_UNKNOWN_KEY",
        },
      ],
    );

    expect(error.message).toContain("FAKE_PAYMENT_TIMEOUT_MS");
    expectNoSecretLeak(error, [
      unknownValue,
      "postgresql://user:password@example.invalid/db",
    ]);
  });

  it("exposes stable public error helpers without leaking raw config values", () => {
    const hostileSecret = "hostile-secret-do-not-print";
    const error = expectConfigError(
      {
        FAKE_PAYMENT_PROVIDER: "disabled-do-not-print",
        FAKE_PAYMENT_WEBHOOK_SECRET: hostileSecret,
        FAKE_PAYMENT_APPROVAL_MODE: "auto-do-not-print",
      },
      [
        {
          key: "FAKE_PAYMENT_PROVIDER",
          code: "PAYMENT_CONFIG_UNSUPPORTED_PROVIDER",
        },
        {
          key: "FAKE_PAYMENT_WEBHOOK_SECRET",
          code: "PAYMENT_CONFIG_WEAK_WEBHOOK_SECRET",
        },
        {
          key: "FAKE_PAYMENT_APPROVAL_MODE",
          code: "PAYMENT_CONFIG_UNSUPPORTED_APPROVAL_MODE",
        },
      ],
    );

    expect(isPaymentConfigError(error)).toBe(true);
    expect(getPublicPaymentConfigErrorMessage(error)).toBe(
      "Configuração de pagamento indisponível. Contate o suporte.",
    );
    expect(error.code).toBe("PAYMENT_CONFIG_INVALID");
    expect(error.resultCodes).toEqual([
      "PAYMENT_CONFIG_UNSUPPORTED_APPROVAL_MODE",
      "PAYMENT_CONFIG_UNSUPPORTED_PROVIDER",
      "PAYMENT_CONFIG_WEAK_WEBHOOK_SECRET",
    ]);
    expectNoSecretLeak(error, [
      "disabled-do-not-print",
      hostileSecret,
      "auto-do-not-print",
    ]);
  });

  it("keeps payments module imports safe when fake payment env is absent", async () => {
    const previousEnv = snapshotFakePaymentEnv();
    clearFakePaymentEnv();

    try {
      await expect(import("./index")).resolves.toMatchObject({
        PAYMENT_GATEWAY_PROVIDER_FAKE_DEV,
        parseFakeDevPaymentConfig: expect.any(Function),
      });
    } finally {
      restoreFakePaymentEnv(previousEnv);
    }
  });
});

function expectConfigError(
  env: PaymentConfigEnv,
  expectedIssues: readonly PaymentConfigIssue[],
) {
  const result = safeParseFakeDevPaymentConfig(env);

  expect(result.success).toBe(false);

  if (result.success) {
    throw new Error("Expected fake/dev payment config to be invalid.");
  }

  expect(result.error).toBeInstanceOf(PaymentConfigError);
  expect(result.error.issues).toEqual(sortPaymentConfigIssues(expectedIssues));

  const serializedError = serializeError(result.error);
  expect(serializedError).not.toContain("Error:");
  expect(serializedError).not.toContain("ZodError");
  expect(serializedError).not.toContain("Prisma");

  return result.error;
}

function sortPaymentConfigIssues(issues: readonly PaymentConfigIssue[]) {
  return [...issues].sort((left, right) => {
    const keyComparison = left.key.localeCompare(right.key);

    if (keyComparison !== 0) {
      return keyComparison;
    }

    return left.code.localeCompare(right.code);
  });
}

function expectNoSecretLeak(error: PaymentConfigError, forbiddenValues: string[]) {
  const serializedError = serializeError(error);

  for (const value of forbiddenValues) {
    expect(serializedError).not.toContain(value);
  }
}

function serializeError(error: PaymentConfigError) {
  return JSON.stringify({
    message: error.message,
    code: error.code,
    keys: error.keys,
    issues: error.issues,
    resultCodes: error.resultCodes,
    publicMessage: error.publicMessage,
  });
}

function snapshotFakePaymentEnv() {
  return Object.fromEntries(
    FAKE_DEV_PAYMENT_ENV_KEYS.map((key) => [key, process.env[key]]),
  ) as Record<(typeof FAKE_DEV_PAYMENT_ENV_KEYS)[number], string | undefined>;
}

function clearFakePaymentEnv() {
  for (const key of FAKE_DEV_PAYMENT_ENV_KEYS) {
    delete process.env[key];
  }
}

function restoreFakePaymentEnv(
  snapshot: Record<(typeof FAKE_DEV_PAYMENT_ENV_KEYS)[number], string | undefined>,
) {
  for (const key of FAKE_DEV_PAYMENT_ENV_KEYS) {
    const value = snapshot[key];

    if (value === undefined) {
      delete process.env[key];
      continue;
    }

    process.env[key] = value;
  }
}
