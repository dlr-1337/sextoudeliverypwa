import { z } from "zod";

const REQUIRED_FIELD_MESSAGE = "Campo obrigatório.";
const FORBIDDEN_FIELD_MESSAGE = "Campo não permitido.";
const PAYMENT_METHOD_UNAVAILABLE_MESSAGE =
  "Escolha dinheiro, PIX ou cartão para concluir este pedido.";

export const CHECKOUT_PAYMENT_METHODS = ["CASH", "PIX", "CARD"] as const;
export const CHECKOUT_CONFIRMABLE_PAYMENT_METHODS = [
  "CASH",
  "PIX",
  "CARD",
] as const;

export const CHECKOUT_MAX_ITEM_COUNT = 50;
export const CHECKOUT_MAX_ITEM_QUANTITY = 99;
export const CHECKOUT_MAX_GENERAL_OBSERVATION_LENGTH = 500;
export const CHECKOUT_MAX_DELIVERY_REFERENCE_LENGTH = 160;

export type CheckoutPaymentMethod = (typeof CHECKOUT_PAYMENT_METHODS)[number];
export type CheckoutConfirmablePaymentMethod =
  (typeof CHECKOUT_CONFIRMABLE_PAYMENT_METHODS)[number];

export type CheckoutPaymentOption = {
  method: CheckoutPaymentMethod;
  label: string;
  description: string;
  isConfirmable: boolean;
  disabledReason: string | null;
};

export type CheckoutFieldErrors = Record<string, string[]>;
export type CheckoutValidationErrors = {
  fieldErrors: CheckoutFieldErrors;
  formErrors: string[];
};

export const CHECKOUT_PAYMENT_OPTIONS = [
  {
    method: "CASH",
    label: "Dinheiro",
    description: "Pague em dinheiro ao receber o pedido.",
    isConfirmable: true,
    disabledReason: null,
  },
  {
    method: "PIX",
    label: "PIX",
    description: "Pague via PIX online em modo fake/dev.",
    isConfirmable: true,
    disabledReason: null,
  },
  {
    method: "CARD",
    label: "Cartão",
    description: "Pague com cartão online em modo fake/dev.",
    isConfirmable: true,
    disabledReason: null,
  },
] as const satisfies readonly CheckoutPaymentOption[];

const idSchema = (message: string) =>
  z
    .string({ error: REQUIRED_FIELD_MESSAGE })
    .trim()
    .min(1, message)
    .max(128, "Informe um identificador com até 128 caracteres.");

const requiredTextSchema = (message: string, max: number, maxMessage: string) =>
  z
    .string({ error: REQUIRED_FIELD_MESSAGE })
    .trim()
    .min(1, message)
    .max(max, maxMessage);

const optionalNullableTextSchema = (max: number, maxMessage: string) =>
  z
    .string({ error: REQUIRED_FIELD_MESSAGE })
    .trim()
    .max(max, maxMessage)
    .optional()
    .transform((value) => {
      if (value === undefined) {
        return undefined;
      }

      return value.length > 0 ? value : null;
    });

const quantitySchema = z
  .number({ error: "Informe a quantidade." })
  .int("Informe uma quantidade inteira.")
  .min(1, "Informe pelo menos 1 item.")
  .max(
    CHECKOUT_MAX_ITEM_QUANTITY,
    `Informe até ${CHECKOUT_MAX_ITEM_QUANTITY} unidades por item.`,
  );

export const checkoutCartItemSchema = z
  .object({
    productId: idSchema("Informe o identificador do produto."),
    quantity: quantitySchema,
  })
  .strict();

export const checkoutConfirmablePaymentMethodSchema = z.enum(
  CHECKOUT_CONFIRMABLE_PAYMENT_METHODS,
  { error: PAYMENT_METHOD_UNAVAILABLE_MESSAGE },
);

export const checkoutOrderPayloadSchema = z
  .object({
    establishmentId: idSchema("Informe o identificador da loja."),
    items: z
      .array(checkoutCartItemSchema, { error: "Informe os itens do pedido." })
      .min(1, "Adicione pelo menos um item ao pedido.")
      .max(
        CHECKOUT_MAX_ITEM_COUNT,
        `Informe até ${CHECKOUT_MAX_ITEM_COUNT} itens por pedido.`,
      ),
    customerName: requiredTextSchema(
      "Informe o nome para entrega.",
      120,
      "Informe um nome com até 120 caracteres.",
    ),
    customerPhone: requiredTextSchema(
      "Informe o telefone para contato.",
      32,
      "Informe um telefone com até 32 caracteres.",
    ),
    deliveryStreet: requiredTextSchema(
      "Informe a rua da entrega.",
      160,
      "Informe uma rua com até 160 caracteres.",
    ),
    deliveryNumber: requiredTextSchema(
      "Informe o número da entrega.",
      32,
      "Informe um número com até 32 caracteres.",
    ),
    deliveryComplement: optionalNullableTextSchema(
      160,
      "Informe um complemento com até 160 caracteres.",
    ),
    deliveryNeighborhood: requiredTextSchema(
      "Informe o bairro da entrega.",
      120,
      "Informe um bairro com até 120 caracteres.",
    ),
    deliveryCity: requiredTextSchema(
      "Informe a cidade da entrega.",
      120,
      "Informe uma cidade com até 120 caracteres.",
    ),
    deliveryState: requiredTextSchema(
      "Informe o estado da entrega.",
      64,
      "Informe um estado com até 64 caracteres.",
    ),
    deliveryPostalCode: requiredTextSchema(
      "Informe o CEP da entrega.",
      32,
      "Informe um CEP com até 32 caracteres.",
    ),
    deliveryReference: optionalNullableTextSchema(
      CHECKOUT_MAX_DELIVERY_REFERENCE_LENGTH,
      `Informe uma referência com até ${CHECKOUT_MAX_DELIVERY_REFERENCE_LENGTH} caracteres.`,
    ),
    generalObservation: optionalNullableTextSchema(
      CHECKOUT_MAX_GENERAL_OBSERVATION_LENGTH,
      `Informe uma observação com até ${CHECKOUT_MAX_GENERAL_OBSERVATION_LENGTH} caracteres.`,
    ),
    paymentMethod: checkoutConfirmablePaymentMethodSchema,
  })
  .strict()
  .transform(
    ({ deliveryComplement, deliveryReference, generalObservation, ...input }) => ({
      ...input,
      deliveryComplement: deliveryComplement ?? null,
      deliveryReference: deliveryReference ?? null,
      generalObservation: generalObservation ?? null,
    }),
  );

export type CheckoutCartItem = z.infer<typeof checkoutCartItemSchema>;
export type CheckoutOrderPayload = z.infer<typeof checkoutOrderPayloadSchema>;
export type CheckoutConfirmablePaymentMethodInput = z.infer<
  typeof checkoutConfirmablePaymentMethodSchema
>;

export function formatCheckoutValidationErrors(
  error: z.ZodError,
): CheckoutValidationErrors {
  const fieldErrors: CheckoutFieldErrors = {};
  const formErrors: string[] = [];

  for (const issue of error.issues) {
    if (issue.code === "unrecognized_keys") {
      for (const key of issue.keys) {
        addFieldError(
          fieldErrors,
          formatIssuePath([...issue.path, key]),
          FORBIDDEN_FIELD_MESSAGE,
        );
      }
      continue;
    }

    const field = formatIssuePath(issue.path);

    if (field) {
      addFieldError(fieldErrors, field, issue.message);
    } else {
      formErrors.push(issue.message);
    }
  }

  return { fieldErrors, formErrors };
}

function formatIssuePath(path: PropertyKey[]) {
  return path.map(String).join(".");
}

function addFieldError(
  fieldErrors: CheckoutFieldErrors,
  field: string,
  message: string,
) {
  fieldErrors[field] = [...(fieldErrors[field] ?? []), message];
}
