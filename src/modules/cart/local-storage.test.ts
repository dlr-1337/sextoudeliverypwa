import { describe, expect, it } from "vitest";

import {
  CHECKOUT_MAX_ITEM_COUNT,
  CHECKOUT_MAX_ITEM_QUANTITY,
} from "../orders/schemas";
import {
  CART_OPERATION_MESSAGES,
  CART_RESET_MESSAGE,
  CART_STORAGE_KEY,
  CART_STORAGE_VERSION,
  type AddCartItemInput,
  type LocalCart,
  addCartItem,
  clearCart,
  getCartTotals,
  parseStoredCart,
  removeCartItem,
  replaceCartWithItem,
  serializeCart,
  toCheckoutCartPayload,
  updateCartItemQuantity,
} from "./local-storage";

const storeA = {
  establishmentId: "establishment-a",
  name: "  Sextou Lanches  ",
};

const storeB = {
  establishmentId: "establishment-b",
  name: "Sextou Pizzas",
};

const productA = {
  productId: "product-a",
  name: "  X-Burger  ",
  price: "12.5",
  imageUrl: "/uploads/products/x-burger.webp",
};

const productB = {
  productId: "product-b",
  name: "Batata Frita",
  price: "8.00",
  imageUrl: null,
};

const productC = {
  productId: "product-c",
  name: "Refrigerante",
  price: "6",
  imageUrl: "/uploads/products/refrigerante.webp",
};

function addFirstItem(input: Partial<AddCartItemInput> = {}) {
  const result = addCartItem(null, {
    store: storeA,
    product: productA,
    quantity: 2,
    ...input,
  });

  expect(result.ok).toBe(true);
  expect(result.cart).not.toBeNull();

  return result.cart as LocalCart;
}

function expectSuccessfulCart(result: ReturnType<typeof addCartItem>) {
  expect(result.ok).toBe(true);
  expect(result.cart).not.toBeNull();
  return result.cart as LocalCart;
}

function cartWithMaxLines() {
  let cart: LocalCart | null = null;

  for (let index = 0; index < CHECKOUT_MAX_ITEM_COUNT; index += 1) {
    cart = expectSuccessfulCart(
      addCartItem(cart, {
        store: storeA,
        product: {
          productId: `product-${index}`,
          name: `Produto ${index}`,
          price: "1.00",
          imageUrl: null,
        },
      }),
    );
  }

  return cart;
}

describe("local cart storage contract", () => {
  it("parses and serializes a versioned strict cart without touching browser APIs", () => {
    const cart = addFirstItem();

    expect(CART_STORAGE_KEY).toBe("sextou-delivery.cart.v1");
    expect(cart).toEqual({
      version: CART_STORAGE_VERSION,
      store: {
        establishmentId: "establishment-a",
        name: "Sextou Lanches",
      },
      items: [
        {
          productId: "product-a",
          name: "X-Burger",
          price: "12.50",
          imageUrl: "/uploads/products/x-burger.webp",
          quantity: 2,
        },
      ],
    });

    const serialized = serializeCart(cart);
    expect(serialized).toEqual(JSON.stringify(cart));

    const parsed = parseStoredCart(serialized);
    expect(parsed).toEqual({
      status: "valid",
      cart,
      shouldClear: false,
      message: null,
      reason: null,
    });
  });

  it("returns explicit empty or malformed parse results for untrusted storage", () => {
    for (const raw of [null, undefined, "", "   "]) {
      expect(parseStoredCart(raw)).toEqual({
        status: "empty",
        cart: null,
        shouldClear: false,
        message: null,
        reason: "EMPTY",
      });
    }

    expect(parseStoredCart("{")) .toEqual({
      status: "malformed",
      cart: null,
      shouldClear: true,
      message: CART_RESET_MESSAGE,
      reason: "INVALID_JSON",
    });

    const validCart = addFirstItem();
    const malformedPayloads = [
      { ...validCart, version: 0 },
      { ...validCart, unexpected: true },
      { ...validCart, store: { ...validCart.store, ownerId: "owner-secret" } },
      { ...validCart, items: [{ ...validCart.items[0], status: "ACTIVE" }] },
      { ...validCart, store: { ...validCart.store, establishmentId: " " } },
      { ...validCart, items: [{ ...validCart.items[0], productId: " " }] },
      { ...validCart, items: [{ ...validCart.items[0], quantity: 0 }] },
      { ...validCart, items: [{ ...validCart.items[0], quantity: 1.5 }] },
      {
        ...validCart,
        items: [
          { ...validCart.items[0], quantity: CHECKOUT_MAX_ITEM_QUANTITY + 1 },
        ],
      },
      {
        ...validCart,
        items: [validCart.items[0], { ...validCart.items[0] }],
      },
      {
        ...validCart,
        items: Array.from({ length: CHECKOUT_MAX_ITEM_COUNT + 1 }, (_, index) => ({
          productId: `product-${index}`,
          name: `Produto ${index}`,
          price: "1.00",
          imageUrl: null,
          quantity: 1,
        })),
      },
    ];

    for (const payload of malformedPayloads) {
      expect(parseStoredCart(JSON.stringify(payload))).toMatchObject({
        status: "malformed",
        cart: null,
        shouldClear: true,
        message: CART_RESET_MESSAGE,
        reason: "SCHEMA_MISMATCH",
      });
    }
  });

  it("keeps the one-store invariant and exposes replace/cancel decisions", () => {
    const cart = addFirstItem();

    const crossStore = addCartItem(cart, {
      store: storeB,
      product: productB,
      quantity: 1,
    });

    expect(crossStore).toMatchObject({
      ok: false,
      code: "CROSS_STORE_CONFIRMATION_REQUIRED",
      cart,
      message: CART_OPERATION_MESSAGES.CROSS_STORE_CONFIRMATION_REQUIRED,
    });
    expect(crossStore.cart).toEqual(cart);
    expect(crossStore.replacementCart).toMatchObject({
      store: {
        establishmentId: "establishment-b",
        name: "Sextou Pizzas",
      },
      items: [{ productId: "product-b", quantity: 1 }],
    });

    const cancelledReplacementCart = crossStore.cart;
    expect(cancelledReplacementCart).toEqual(cart);

    const replaced = replaceCartWithItem({
      store: storeB,
      product: productB,
      quantity: 3,
    });

    expect(replaced).toMatchObject({
      ok: true,
      code: "CART_REPLACED",
      message: CART_OPERATION_MESSAGES.REPLACED,
    });
    expect(replaced.cart).toMatchObject({
      store: { establishmentId: "establishment-b" },
      items: [{ productId: "product-b", quantity: 3 }],
    });
  });

  it("merges same-product additions and blocks invalid quantity mutations", () => {
    let cart = addFirstItem({ quantity: CHECKOUT_MAX_ITEM_QUANTITY - 1 });

    const incrementToMax = addCartItem(cart, {
      store: storeA,
      product: productA,
      quantity: 1,
    });

    cart = expectSuccessfulCart(incrementToMax);
    expect(incrementToMax.code).toBe("CART_ITEM_MERGED");
    expect(cart.items).toHaveLength(1);
    expect(cart.items[0].quantity).toBe(CHECKOUT_MAX_ITEM_QUANTITY);

    const overMax = addCartItem(cart, {
      store: storeA,
      product: productA,
      quantity: 1,
    });

    expect(overMax).toEqual({
      ok: false,
      code: "QUANTITY_LIMIT_REACHED",
      cart,
      message: CART_OPERATION_MESSAGES.QUANTITY_LIMIT_REACHED,
    });

    expect(updateCartItemQuantity(cart, "product-a", CHECKOUT_MAX_ITEM_QUANTITY)).toMatchObject({
      ok: true,
      code: "CART_ITEM_UPDATED",
      cart,
    });
    expect(updateCartItemQuantity(cart, "product-a", 0)).toMatchObject({
      ok: false,
      code: "INVALID_CART_INPUT",
      cart,
    });
    expect(
      updateCartItemQuantity(cart, "product-a", CHECKOUT_MAX_ITEM_QUANTITY + 1),
    ).toMatchObject({
      ok: false,
      code: "QUANTITY_LIMIT_REACHED",
      cart,
    });
  });

  it("removes products, clears the cart, and reports display totals", () => {
    let cart = addFirstItem({ quantity: 2 });
    cart = expectSuccessfulCart(
      addCartItem(cart, {
        store: storeA,
        product: productC,
        quantity: 3,
      }),
    );

    expect(getCartTotals(cart)).toEqual({
      lineCount: 2,
      itemCount: 5,
      subtotalCents: 4300,
    });

    const removedOne = removeCartItem(cart, "product-c");
    cart = removedOne.cart as LocalCart;

    expect(removedOne).toMatchObject({
      ok: true,
      code: "CART_ITEM_REMOVED",
      message: CART_OPERATION_MESSAGES.REMOVED,
    });
    expect(cart.items).toEqual([{ ...cart.items[0], productId: "product-a" }]);

    const removedLast = removeCartItem(cart, "product-a");
    expect(removedLast).toEqual({
      ok: true,
      code: "CART_CLEARED",
      cart: null,
      message: CART_OPERATION_MESSAGES.CLEARED,
    });

    expect(clearCart()).toEqual({
      ok: true,
      code: "CART_CLEARED",
      cart: null,
      message: CART_OPERATION_MESSAGES.CLEARED,
    });
  });

  it("caps line count at the checkout contract before storage can bloat", () => {
    const cart = cartWithMaxLines();

    expect(cart.items).toHaveLength(CHECKOUT_MAX_ITEM_COUNT);

    const overLimit = addCartItem(cart, {
      store: storeA,
      product: {
        productId: "product-over-limit",
        name: "Produto acima do limite",
        price: "1.00",
        imageUrl: null,
      },
    });

    expect(overLimit).toEqual({
      ok: false,
      code: "ITEM_LIMIT_REACHED",
      cart,
      message: CART_OPERATION_MESSAGES.ITEM_LIMIT_REACHED,
    });
    expect(overLimit.cart?.items).toHaveLength(CHECKOUT_MAX_ITEM_COUNT);
  });

  it("projects checkout authority fields only and strips display/payment/provider data", () => {
    const secretToken = "provider-secret-token-123";
    const cart = expectSuccessfulCart(
      addCartItem(null, {
        store: {
          establishmentId: "establishment-a",
          name: `Loja ${secretToken}`,
        },
        product: {
          productId: "product-a",
          name: `Produto ${secretToken}`,
          price: "12.50",
          imageUrl: `/uploads/products/${secretToken}.webp`,
        },
        quantity: 4,
      }),
    );

    const payload = toCheckoutCartPayload(cart);

    expect(payload).toEqual({
      establishmentId: "establishment-a",
      items: [{ productId: "product-a", quantity: 4 }],
    });
    expect(Object.keys(payload?.items[0] ?? {})).toEqual(["productId", "quantity"]);

    const serializedPayload = JSON.stringify(payload);
    for (const forbiddenFragment of [
      "name",
      "price",
      "imageUrl",
      "status",
      "customer",
      "payment",
      "provider",
      secretToken,
    ]) {
      expect(serializedPayload).not.toContain(forbiddenFragment);
    }
  });
});
