import { z } from "zod";

import {
  CHECKOUT_MAX_ITEM_COUNT,
  CHECKOUT_MAX_ITEM_QUANTITY,
  type CheckoutCartItem,
} from "../orders/schemas";

export const CART_STORAGE_KEY = "sextou-delivery.cart.v1";
export const CART_STORAGE_VERSION = 1;

export const CART_RESET_MESSAGE =
  "Seu carrinho salvo estava inválido e foi reiniciado.";

export const CART_OPERATION_MESSAGES = {
  ADDED: "Produto adicionado ao carrinho.",
  MERGED: "Quantidade atualizada no carrinho.",
  UPDATED: "Quantidade atualizada no carrinho.",
  REMOVED: "Produto removido do carrinho.",
  CLEARED: "Carrinho limpo.",
  REPLACED: "Carrinho trocado para esta loja.",
  CROSS_STORE_CONFIRMATION_REQUIRED:
    "Seu carrinho tem itens de outra loja. Confirme para trocar de loja.",
  ITEM_LIMIT_REACHED: `Você pode adicionar até ${CHECKOUT_MAX_ITEM_COUNT} produtos diferentes ao carrinho.`,
  QUANTITY_LIMIT_REACHED: `Você pode adicionar até ${CHECKOUT_MAX_ITEM_QUANTITY} unidades por produto.`,
  INVALID_CART_INPUT:
    "Não foi possível atualizar o carrinho. Revise o produto e tente novamente.",
  ITEM_NOT_FOUND: "Produto não encontrado no carrinho.",
} as const;

type CartSuccessCode =
  | "CART_ITEM_ADDED"
  | "CART_ITEM_MERGED"
  | "CART_ITEM_UPDATED"
  | "CART_ITEM_REMOVED"
  | "CART_CLEARED"
  | "CART_REPLACED";

type CartFailureCode =
  | "CROSS_STORE_CONFIRMATION_REQUIRED"
  | "ITEM_LIMIT_REACHED"
  | "QUANTITY_LIMIT_REACHED"
  | "INVALID_CART_INPUT"
  | "ITEM_NOT_FOUND";

export type CartOperationResult =
  | {
      ok: true;
      code: CartSuccessCode;
      cart: LocalCart | null;
      message: string;
    }
  | {
      ok: false;
      code: CartFailureCode;
      cart: LocalCart | null;
      message: string;
      replacementCart?: LocalCart;
    };

export type ParseStoredCartResult =
  | {
      status: "empty";
      cart: null;
      shouldClear: false;
      message: null;
      reason: "EMPTY";
    }
  | {
      status: "valid";
      cart: LocalCart;
      shouldClear: false;
      message: null;
      reason: null;
    }
  | {
      status: "malformed";
      cart: null;
      shouldClear: true;
      message: string;
      reason: "INVALID_JSON" | "SCHEMA_MISMATCH";
    };

export type CheckoutCartPayload = {
  establishmentId: string;
  items: CheckoutCartItem[];
};

const REQUIRED_FIELD_MESSAGE = "Campo obrigatório.";

const cartIdSchema = z
  .string({ error: REQUIRED_FIELD_MESSAGE })
  .trim()
  .min(1, "Informe um identificador válido.")
  .max(128, "Informe um identificador com até 128 caracteres.");

const displayTextSchema = z
  .string({ error: REQUIRED_FIELD_MESSAGE })
  .trim()
  .min(1, "Informe um texto de exibição.")
  .max(160, "Informe um texto de exibição com até 160 caracteres.");

const displayImageUrlSchema = z
  .union([
    z
      .string({ error: REQUIRED_FIELD_MESSAGE })
      .trim()
      .min(1, "Informe uma imagem válida.")
      .max(2048, "Informe uma imagem com até 2048 caracteres."),
    z.null(),
  ])
  .optional()
  .transform((value) => value ?? null);

const displayMoneySchema = z
  .string({ error: REQUIRED_FIELD_MESSAGE })
  .trim()
  .regex(/^\d{1,10}(?:\.\d{1,2})?$/, "Informe um preço válido.")
  .transform(normalizeMoneyString);

export const cartQuantitySchema = z
  .number({ error: "Informe a quantidade." })
  .int("Informe uma quantidade inteira.")
  .min(1, "Informe pelo menos 1 item.")
  .max(
    CHECKOUT_MAX_ITEM_QUANTITY,
    `Informe até ${CHECKOUT_MAX_ITEM_QUANTITY} unidades por item.`,
  );

export const cartStoreSchema = z
  .object({
    establishmentId: cartIdSchema,
    name: displayTextSchema,
  })
  .strict();

export const cartDisplayProductSchema = z
  .object({
    productId: cartIdSchema,
    name: displayTextSchema,
    price: displayMoneySchema,
    imageUrl: displayImageUrlSchema,
  })
  .strict();

export const localCartItemSchema = cartDisplayProductSchema
  .extend({
    quantity: cartQuantitySchema,
  })
  .strict();

export const localCartSchema = z
  .object({
    version: z.literal(CART_STORAGE_VERSION),
    store: cartStoreSchema,
    items: z
      .array(localCartItemSchema, { error: "Informe os itens do carrinho." })
      .min(1, "Adicione pelo menos um item ao carrinho.")
      .max(
        CHECKOUT_MAX_ITEM_COUNT,
        `Informe até ${CHECKOUT_MAX_ITEM_COUNT} itens por carrinho.`,
      ),
  })
  .strict()
  .superRefine((cart, context) => {
    const productIds = new Set<string>();

    cart.items.forEach((item, index) => {
      if (productIds.has(item.productId)) {
        context.addIssue({
          code: "custom",
          message: "Produto duplicado no carrinho.",
          path: ["items", index, "productId"],
        });
        return;
      }

      productIds.add(item.productId);
    });
  });

export const addCartItemInputSchema = z
  .object({
    store: cartStoreSchema,
    product: cartDisplayProductSchema,
    quantity: cartQuantitySchema.optional().default(1),
  })
  .strict();

export type CartStore = z.infer<typeof cartStoreSchema>;
export type CartDisplayProduct = z.infer<typeof cartDisplayProductSchema>;
export type LocalCartItem = z.infer<typeof localCartItemSchema>;
export type LocalCart = z.infer<typeof localCartSchema>;
export type AddCartItemInput = z.input<typeof addCartItemInputSchema>;
export type CartTotals = {
  lineCount: number;
  itemCount: number;
  subtotalCents: number;
};

export function parseStoredCart(raw: string | null | undefined): ParseStoredCartResult {
  if (raw === null || raw === undefined || raw.trim().length === 0) {
    return {
      status: "empty",
      cart: null,
      shouldClear: false,
      message: null,
      reason: "EMPTY",
    };
  }

  let parsedJson: unknown;

  try {
    parsedJson = JSON.parse(raw);
  } catch {
    return malformedStoredCart("INVALID_JSON");
  }

  const parsedCart = localCartSchema.safeParse(parsedJson);

  if (!parsedCart.success) {
    return malformedStoredCart("SCHEMA_MISMATCH");
  }

  return {
    status: "valid",
    cart: parsedCart.data,
    shouldClear: false,
    message: null,
    reason: null,
  };
}

export function serializeCart(cart: LocalCart | null): string | null {
  if (cart === null) {
    return null;
  }

  const parsedCart = localCartSchema.safeParse(cart);

  if (!parsedCart.success) {
    return null;
  }

  return JSON.stringify(parsedCart.data);
}

export function addCartItem(
  cart: LocalCart | null,
  input: AddCartItemInput,
): CartOperationResult {
  const currentCart = normalizeExistingCart(cart);

  if (!currentCart.ok) {
    return invalidCartInput(null);
  }

  const parsedInput = addCartItemInputSchema.safeParse(input);

  if (!parsedInput.success) {
    return invalidCartInput(currentCart.cart);
  }

  const { store, product, quantity } = parsedInput.data;
  const replacementCart = createCart(store, product, quantity);

  if (!replacementCart.ok || replacementCart.cart === null) {
    return invalidCartInput(currentCart.cart);
  }

  if (currentCart.cart === null) {
    return success("CART_ITEM_ADDED", replacementCart.cart, CART_OPERATION_MESSAGES.ADDED);
  }

  if (currentCart.cart.store.establishmentId !== store.establishmentId) {
    return {
      ok: false,
      code: "CROSS_STORE_CONFIRMATION_REQUIRED",
      cart: currentCart.cart,
      replacementCart: replacementCart.cart,
      message: CART_OPERATION_MESSAGES.CROSS_STORE_CONFIRMATION_REQUIRED,
    };
  }

  const existingItemIndex = currentCart.cart.items.findIndex(
    (item) => item.productId === product.productId,
  );

  if (existingItemIndex >= 0) {
    const existingItem = currentCart.cart.items[existingItemIndex];
    const nextQuantity = existingItem.quantity + quantity;

    if (nextQuantity > CHECKOUT_MAX_ITEM_QUANTITY) {
      return quantityLimitReached(currentCart.cart);
    }

    const nextCart = ensureValidCart({
      ...currentCart.cart,
      store,
      items: currentCart.cart.items.map((item, index) =>
        index === existingItemIndex
          ? {
              ...product,
              quantity: nextQuantity,
            }
          : item,
      ),
    });

    if (!nextCart) {
      return invalidCartInput(currentCart.cart);
    }

    return success("CART_ITEM_MERGED", nextCart, CART_OPERATION_MESSAGES.MERGED);
  }

  if (currentCart.cart.items.length >= CHECKOUT_MAX_ITEM_COUNT) {
    return itemLimitReached(currentCart.cart);
  }

  const nextCart = ensureValidCart({
    ...currentCart.cart,
    store,
    items: [...currentCart.cart.items, { ...product, quantity }],
  });

  if (!nextCart) {
    return invalidCartInput(currentCart.cart);
  }

  return success("CART_ITEM_ADDED", nextCart, CART_OPERATION_MESSAGES.ADDED);
}

export function replaceCartWithItem(input: AddCartItemInput): CartOperationResult {
  const parsedInput = addCartItemInputSchema.safeParse(input);

  if (!parsedInput.success) {
    return invalidCartInput(null);
  }

  const { store, product, quantity } = parsedInput.data;
  const nextCart = createCart(store, product, quantity);

  if (!nextCart.ok || nextCart.cart === null) {
    return invalidCartInput(null);
  }

  return success("CART_REPLACED", nextCart.cart, CART_OPERATION_MESSAGES.REPLACED);
}

export function updateCartItemQuantity(
  cart: LocalCart | null,
  productId: string,
  quantity: number,
): CartOperationResult {
  const currentCart = normalizeExistingCart(cart);

  if (!currentCart.ok) {
    return invalidCartInput(null);
  }

  if (currentCart.cart === null) {
    return itemNotFound(null);
  }

  const parsedProductId = cartIdSchema.safeParse(productId);

  if (!parsedProductId.success) {
    return invalidCartInput(currentCart.cart);
  }

  const quantityResult = cartQuantitySchema.safeParse(quantity);

  if (!quantityResult.success) {
    if (quantity > CHECKOUT_MAX_ITEM_QUANTITY) {
      return quantityLimitReached(currentCart.cart);
    }

    return invalidCartInput(currentCart.cart);
  }

  const existingItemIndex = currentCart.cart.items.findIndex(
    (item) => item.productId === parsedProductId.data,
  );

  if (existingItemIndex < 0) {
    return itemNotFound(currentCart.cart);
  }

  const nextCart = ensureValidCart({
    ...currentCart.cart,
    items: currentCart.cart.items.map((item, index) =>
      index === existingItemIndex ? { ...item, quantity: quantityResult.data } : item,
    ),
  });

  if (!nextCart) {
    return invalidCartInput(currentCart.cart);
  }

  return success("CART_ITEM_UPDATED", nextCart, CART_OPERATION_MESSAGES.UPDATED);
}

export function removeCartItem(
  cart: LocalCart | null,
  productId: string,
): CartOperationResult {
  const currentCart = normalizeExistingCart(cart);

  if (!currentCart.ok) {
    return invalidCartInput(null);
  }

  if (currentCart.cart === null) {
    return itemNotFound(null);
  }

  const parsedProductId = cartIdSchema.safeParse(productId);

  if (!parsedProductId.success) {
    return invalidCartInput(currentCart.cart);
  }

  const nextItems = currentCart.cart.items.filter(
    (item) => item.productId !== parsedProductId.data,
  );

  if (nextItems.length === currentCart.cart.items.length) {
    return itemNotFound(currentCart.cart);
  }

  if (nextItems.length === 0) {
    return success("CART_CLEARED", null, CART_OPERATION_MESSAGES.CLEARED);
  }

  const nextCart = ensureValidCart({
    ...currentCart.cart,
    items: nextItems,
  });

  if (!nextCart) {
    return invalidCartInput(currentCart.cart);
  }

  return success("CART_ITEM_REMOVED", nextCart, CART_OPERATION_MESSAGES.REMOVED);
}

export function clearCart(): CartOperationResult {
  return success("CART_CLEARED", null, CART_OPERATION_MESSAGES.CLEARED);
}

export function getCartLineCount(cart: LocalCart | null): number {
  return cart?.items.length ?? 0;
}

export function getCartItemCount(cart: LocalCart | null): number {
  return cart?.items.reduce((total, item) => total + item.quantity, 0) ?? 0;
}

export function getCartSubtotalCents(cart: LocalCart | null): number {
  return (
    cart?.items.reduce(
      (total, item) => total + moneyStringToCents(item.price) * item.quantity,
      0,
    ) ?? 0
  );
}

export function getCartTotals(cart: LocalCart | null): CartTotals {
  return {
    lineCount: getCartLineCount(cart),
    itemCount: getCartItemCount(cart),
    subtotalCents: getCartSubtotalCents(cart),
  };
}

export function toCheckoutCartPayload(
  cart: LocalCart | null,
): CheckoutCartPayload | null {
  const parsedCart = localCartSchema.safeParse(cart);

  if (!parsedCart.success) {
    return null;
  }

  return {
    establishmentId: parsedCart.data.store.establishmentId,
    items: parsedCart.data.items.map((item) => ({
      productId: item.productId,
      quantity: item.quantity,
    })),
  };
}

function createCart(
  store: CartStore,
  product: CartDisplayProduct,
  quantity: number,
): CartOperationResult {
  const cart = ensureValidCart({
    version: CART_STORAGE_VERSION,
    store,
    items: [{ ...product, quantity }],
  });

  if (!cart) {
    return invalidCartInput(null);
  }

  return success("CART_ITEM_ADDED", cart, CART_OPERATION_MESSAGES.ADDED);
}

function normalizeExistingCart(
  cart: LocalCart | null,
): { ok: true; cart: LocalCart | null } | { ok: false } {
  if (cart === null) {
    return { ok: true, cart: null };
  }

  const parsedCart = localCartSchema.safeParse(cart);

  if (!parsedCart.success) {
    return { ok: false };
  }

  return { ok: true, cart: parsedCart.data };
}

function ensureValidCart(candidate: unknown): LocalCart | null {
  const parsedCart = localCartSchema.safeParse(candidate);
  return parsedCart.success ? parsedCart.data : null;
}

function success(
  code: CartSuccessCode,
  cart: LocalCart | null,
  message: string,
): CartOperationResult {
  return { ok: true, code, cart, message };
}

function invalidCartInput(cart: LocalCart | null): CartOperationResult {
  return {
    ok: false,
    code: "INVALID_CART_INPUT",
    cart,
    message: CART_OPERATION_MESSAGES.INVALID_CART_INPUT,
  };
}

function itemLimitReached(cart: LocalCart): CartOperationResult {
  return {
    ok: false,
    code: "ITEM_LIMIT_REACHED",
    cart,
    message: CART_OPERATION_MESSAGES.ITEM_LIMIT_REACHED,
  };
}

function quantityLimitReached(cart: LocalCart): CartOperationResult {
  return {
    ok: false,
    code: "QUANTITY_LIMIT_REACHED",
    cart,
    message: CART_OPERATION_MESSAGES.QUANTITY_LIMIT_REACHED,
  };
}

function itemNotFound(cart: LocalCart | null): CartOperationResult {
  return {
    ok: false,
    code: "ITEM_NOT_FOUND",
    cart,
    message: CART_OPERATION_MESSAGES.ITEM_NOT_FOUND,
  };
}

function malformedStoredCart(
  reason: "INVALID_JSON" | "SCHEMA_MISMATCH",
): ParseStoredCartResult {
  return {
    status: "malformed",
    cart: null,
    shouldClear: true,
    message: CART_RESET_MESSAGE,
    reason,
  };
}

function normalizeMoneyString(value: string): string {
  const [whole, cents = ""] = value.split(".");
  return `${whole}.${cents.padEnd(2, "0")}`;
}

function moneyStringToCents(value: string): number {
  const [whole = "0", cents = "0"] = value.split(".");
  return Number(whole) * 100 + Number(cents.padEnd(2, "0").slice(0, 2));
}
