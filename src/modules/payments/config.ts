import { z } from "zod";

import { PAYMENT_GATEWAY_PROVIDER_FAKE_DEV } from "./types";

export const FAKE_DEV_PAYMENT_ENV_KEYS = [
  "FAKE_PAYMENT_PROVIDER",
  "FAKE_PAYMENT_WEBHOOK_SECRET",
  "FAKE_PAYMENT_APPROVAL_MODE",
] as const;

export const PAYMENT_CONFIG_ISSUE_CODES = [
  "PAYMENT_CONFIG_MISSING_KEY",
  "PAYMENT_CONFIG_UNSUPPORTED_PROVIDER",
  "PAYMENT_CONFIG_WEAK_WEBHOOK_SECRET",
  "PAYMENT_CONFIG_UNSUPPORTED_APPROVAL_MODE",
  "PAYMENT_CONFIG_UNKNOWN_KEY",
] as const;

const FAKE_PAYMENT_ENV_PREFIX = "FAKE_PAYMENT_";
const EXPECTED_FAKE_PAYMENT_PROVIDER_FLAG = "enabled";
const EXPECTED_FAKE_PAYMENT_APPROVAL_MODE = "manual";
export const MIN_FAKE_PAYMENT_WEBHOOK_SECRET_LENGTH = 32;

const fakeDevPaymentEnvKeySet: ReadonlySet<string> = new Set(
  FAKE_DEV_PAYMENT_ENV_KEYS,
);
const paymentConfigIssueCodeSet: ReadonlySet<string> = new Set(
  PAYMENT_CONFIG_ISSUE_CODES,
);

const envStringSchema = z
  .string()
  .optional()
  .transform((value) => value?.trim() ?? "");

const fakeDevPaymentConfigEnvSchema = z
  .object({
    FAKE_PAYMENT_PROVIDER: envStringSchema,
    FAKE_PAYMENT_WEBHOOK_SECRET: envStringSchema,
    FAKE_PAYMENT_APPROVAL_MODE: envStringSchema,
  })
  .strict()
  .superRefine((env, context) => {
    if (env.FAKE_PAYMENT_PROVIDER.length === 0) {
      addConfigIssue(
        context,
        "PAYMENT_CONFIG_MISSING_KEY",
        "FAKE_PAYMENT_PROVIDER",
      );
    } else if (env.FAKE_PAYMENT_PROVIDER !== EXPECTED_FAKE_PAYMENT_PROVIDER_FLAG) {
      addConfigIssue(
        context,
        "PAYMENT_CONFIG_UNSUPPORTED_PROVIDER",
        "FAKE_PAYMENT_PROVIDER",
      );
    }

    if (env.FAKE_PAYMENT_WEBHOOK_SECRET.length === 0) {
      addConfigIssue(
        context,
        "PAYMENT_CONFIG_MISSING_KEY",
        "FAKE_PAYMENT_WEBHOOK_SECRET",
      );
    } else if (
      env.FAKE_PAYMENT_WEBHOOK_SECRET.length <
      MIN_FAKE_PAYMENT_WEBHOOK_SECRET_LENGTH
    ) {
      addConfigIssue(
        context,
        "PAYMENT_CONFIG_WEAK_WEBHOOK_SECRET",
        "FAKE_PAYMENT_WEBHOOK_SECRET",
      );
    }

    if (env.FAKE_PAYMENT_APPROVAL_MODE.length === 0) {
      addConfigIssue(
        context,
        "PAYMENT_CONFIG_MISSING_KEY",
        "FAKE_PAYMENT_APPROVAL_MODE",
      );
    } else if (
      env.FAKE_PAYMENT_APPROVAL_MODE !== EXPECTED_FAKE_PAYMENT_APPROVAL_MODE
    ) {
      addConfigIssue(
        context,
        "PAYMENT_CONFIG_UNSUPPORTED_APPROVAL_MODE",
        "FAKE_PAYMENT_APPROVAL_MODE",
      );
    }
  })
  .transform((env) => ({
    provider: PAYMENT_GATEWAY_PROVIDER_FAKE_DEV,
    enabled: true as const,
    approvalMode: EXPECTED_FAKE_PAYMENT_APPROVAL_MODE,
    webhookSecret: env.FAKE_PAYMENT_WEBHOOK_SECRET,
  }));

export type FakeDevPaymentEnvKey = (typeof FAKE_DEV_PAYMENT_ENV_KEYS)[number];
export type PaymentConfigIssueCode =
  (typeof PAYMENT_CONFIG_ISSUE_CODES)[number];
export type PaymentConfigEnv = Record<string, string | undefined>;

export type FakeDevPaymentConfig = z.infer<
  typeof fakeDevPaymentConfigEnvSchema
>;

export type PaymentConfigIssue = {
  code: PaymentConfigIssueCode;
  key: string;
};

export type FakeDevPaymentConfigParseResult =
  | { success: true; data: FakeDevPaymentConfig }
  | { success: false; error: PaymentConfigError };

export class PaymentConfigError extends Error {
  readonly code = "PAYMENT_CONFIG_INVALID";
  readonly publicMessage =
    "Configuração de pagamento indisponível. Contate o suporte.";
  readonly issues: readonly PaymentConfigIssue[];
  readonly keys: readonly string[];
  readonly resultCodes: readonly PaymentConfigIssueCode[];

  constructor(issues: readonly PaymentConfigIssue[]) {
    const normalizedIssues = normalizePaymentConfigIssues(issues);
    const keys = [...new Set(normalizedIssues.map((issue) => issue.key))].sort();
    const resultCodes = [
      ...new Set(normalizedIssues.map((issue) => issue.code)),
    ].sort();

    super(
      `Configuração de pagamento fake/dev inválida: ${normalizedIssues
        .map((issue) => `${issue.key}:${issue.code}`)
        .join(", ")}.`,
    );

    this.name = "PaymentConfigError";
    this.issues = normalizedIssues;
    this.keys = keys;
    this.resultCodes = resultCodes;
  }
}

export function safeParseFakeDevPaymentConfig(
  env: PaymentConfigEnv,
): FakeDevPaymentConfigParseResult {
  const result = fakeDevPaymentConfigEnvSchema.safeParse(
    buildFakeDevPaymentEnvCandidate(env),
  );

  if (result.success) {
    return { success: true, data: result.data };
  }

  return {
    success: false,
    error: new PaymentConfigError(formatPaymentConfigIssues(result.error)),
  };
}

export function parseFakeDevPaymentConfig(
  env: PaymentConfigEnv,
): FakeDevPaymentConfig {
  const result = safeParseFakeDevPaymentConfig(env);

  if (!result.success) {
    throw result.error;
  }

  return result.data;
}

export function getFakeDevPaymentConfig(
  env: PaymentConfigEnv = process.env,
): FakeDevPaymentConfig {
  return parseFakeDevPaymentConfig(env);
}

export function createFakeDevPaymentConfigGetter(
  envProvider: () => PaymentConfigEnv = () => process.env,
) {
  return () => parseFakeDevPaymentConfig(envProvider());
}

export function isPaymentConfigError(
  error: unknown,
): error is PaymentConfigError {
  return (
    error instanceof PaymentConfigError ||
    (isRecord(error) && error.code === "PAYMENT_CONFIG_INVALID")
  );
}

export function getPublicPaymentConfigErrorMessage(error: unknown) {
  if (
    isPaymentConfigError(error) &&
    isRecord(error) &&
    typeof error.publicMessage === "string"
  ) {
    return error.publicMessage;
  }

  return "Configuração de pagamento indisponível. Contate o suporte.";
}

function addConfigIssue(
  context: z.RefinementCtx,
  code: PaymentConfigIssueCode,
  key: FakeDevPaymentEnvKey,
) {
  context.addIssue({
    code: "custom",
    path: [key],
    message: code,
  });
}

function buildFakePaymentUnknownEnvKeys(env: PaymentConfigEnv) {
  return Object.keys(env).filter(
    (key) =>
      key.startsWith(FAKE_PAYMENT_ENV_PREFIX) &&
      !fakeDevPaymentEnvKeySet.has(key),
  );
}

function buildFakeDevPaymentEnvCandidate(env: PaymentConfigEnv) {
  const candidate: PaymentConfigEnv = {};

  for (const key of FAKE_DEV_PAYMENT_ENV_KEYS) {
    candidate[key] = env[key];
  }

  for (const key of buildFakePaymentUnknownEnvKeys(env)) {
    candidate[key] = env[key];
  }

  return candidate;
}

function formatPaymentConfigIssues(error: z.ZodError): PaymentConfigIssue[] {
  const issues: PaymentConfigIssue[] = [];

  for (const issue of error.issues) {
    if (issue.code === "unrecognized_keys") {
      for (const key of issue.keys) {
        issues.push({ code: "PAYMENT_CONFIG_UNKNOWN_KEY", key });
      }
      continue;
    }

    const key = String(issue.path[0] ?? "FAKE_PAYMENT_PROVIDER");
    const code = isPaymentConfigIssueCode(issue.message)
      ? issue.message
      : "PAYMENT_CONFIG_MISSING_KEY";

    issues.push({ code, key });
  }

  return normalizePaymentConfigIssues(issues);
}

function normalizePaymentConfigIssues(
  issues: readonly PaymentConfigIssue[],
): PaymentConfigIssue[] {
  const issueMap = new Map<string, PaymentConfigIssue>();

  for (const issue of issues) {
    issueMap.set(`${issue.key}:${issue.code}`, issue);
  }

  return [...issueMap.values()].sort((left, right) => {
    const keyComparison = left.key.localeCompare(right.key);

    if (keyComparison !== 0) {
      return keyComparison;
    }

    return left.code.localeCompare(right.code);
  });
}

function isPaymentConfigIssueCode(
  value: string,
): value is PaymentConfigIssueCode {
  return paymentConfigIssueCodeSet.has(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
