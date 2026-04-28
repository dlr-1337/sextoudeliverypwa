import {
  PaymentConfigError,
  getFakeDevPaymentConfig,
  type FakeDevPaymentConfig,
  type PaymentConfigEnv,
} from "./config";
import {
  createFakeDevPaymentProvider,
  type FakeDevPaymentProviderOptions,
} from "./fake-dev-provider";
import {
  PAYMENT_GATEWAY_PROVIDER_FAKE_DEV,
  type PaymentGatewayProvider,
  type PaymentGatewayProviderName,
} from "./types";

export type FakeDevPaymentProviderFactory = (
  config: FakeDevPaymentConfig,
  options?: FakeDevPaymentProviderOptions,
) => PaymentGatewayProvider;

export type PaymentGatewayProviderFactoryOptions = {
  provider?: PaymentGatewayProviderName | string;
  env?: PaymentConfigEnv;
  config?: FakeDevPaymentConfig;
  fakeDevProviderOptions?: FakeDevPaymentProviderOptions;
  fakeDevProviderFactory?: FakeDevPaymentProviderFactory;
};

export function getPaymentGatewayProvider(
  options: PaymentGatewayProviderFactoryOptions = {},
): PaymentGatewayProvider {
  const provider = options.provider ?? PAYMENT_GATEWAY_PROVIDER_FAKE_DEV;

  if (provider === PAYMENT_GATEWAY_PROVIDER_FAKE_DEV) {
    return getFakeDevPaymentProvider(options);
  }

  throw new PaymentConfigError([
    {
      key: "FAKE_PAYMENT_PROVIDER",
      code: "PAYMENT_CONFIG_UNSUPPORTED_PROVIDER",
    },
  ]);
}

export function getFakeDevPaymentProvider(
  options: Omit<PaymentGatewayProviderFactoryOptions, "provider"> = {},
): PaymentGatewayProvider {
  const config = options.config ?? getFakeDevPaymentConfig(options.env ?? process.env);
  const providerFactory =
    options.fakeDevProviderFactory ?? defaultFakeDevPaymentProviderFactory;

  return providerFactory(config, options.fakeDevProviderOptions);
}

function defaultFakeDevPaymentProviderFactory(
  _config: FakeDevPaymentConfig,
  options?: FakeDevPaymentProviderOptions,
) {
  return createFakeDevPaymentProvider(options);
}
