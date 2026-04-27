"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";

import { FeedbackState } from "@/components/ui/feedback-state";
import {
  CART_OPERATION_MESSAGES,
  CART_STORAGE_KEY,
  addCartItem,
  clearCart,
  getCartTotals,
  parseStoredCart,
  removeCartItem,
  replaceCartWithItem,
  serializeCart,
  updateCartItemQuantity,
  type AddCartItemInput,
  type CartDisplayProduct,
  type CartOperationResult,
  type CartStore,
  type LocalCart,
  type LocalCartItem,
} from "@/modules/cart/local-storage";
import type {
  CatalogProductDto,
  CatalogStoreCatalogDto,
} from "@/modules/catalog/service-core";
import { CHECKOUT_MAX_ITEM_QUANTITY } from "@/modules/orders/schemas";

type StoreCartProps = {
  catalog: CatalogStoreCatalogDto;
};

const moneyFormatter = new Intl.NumberFormat("pt-BR", {
  currency: "BRL",
  style: "currency",
});

const CART_CANCELLED_MESSAGE = "Carrinho anterior foi mantido.";
const CART_READ_FAILURE_MESSAGE =
  "Não foi possível ler o carrinho salvo. Você ainda pode usar o carrinho nesta sessão.";
const CART_CLEAR_STORAGE_FAILURE_MESSAGE =
  "Não foi possível limpar o carrinho antigo do navegador, mas ele foi ignorado nesta sessão.";
const CART_WRITE_FAILURE_MESSAGE =
  "Não foi possível salvar o carrinho neste navegador. Ele continuará disponível somente nesta sessão.";
const EMPTY_CART_MESSAGE =
  "Seu carrinho está vazio. Adicione produtos ativos deste catálogo para começar.";

export function StoreCart({ catalog }: StoreCartProps) {
  const [cart, setCart] = useState<LocalCart | null>(null);
  const [hasHydrated, setHasHydrated] = useState(false);
  const [statusMessage, setStatusMessage] = useState(
    "Carrinho carregando no navegador.",
  );
  const [alertMessage, setAlertMessage] = useState<string | null>(null);
  const skipNextPersistRef = useRef(false);

  useEffect(() => {
    let isMounted = true;

    function publishHydrationState({
      nextAlertMessage,
      nextCart,
      nextStatusMessage,
      skipNextPersist,
    }: {
      nextAlertMessage: string | null;
      nextCart: LocalCart | null;
      nextStatusMessage: string;
      skipNextPersist?: boolean;
    }) {
      if (skipNextPersist) {
        skipNextPersistRef.current = true;
      }

      queueMicrotask(() => {
        if (!isMounted) {
          return;
        }

        setCart(nextCart);
        setAlertMessage(nextAlertMessage);
        setStatusMessage(nextStatusMessage);
        setHasHydrated(true);
      });
    }

    try {
      const storedCart = parseStoredCart(window.localStorage.getItem(CART_STORAGE_KEY));

      if (storedCart.status === "valid") {
        publishHydrationState({
          nextAlertMessage: null,
          nextCart: storedCart.cart,
          nextStatusMessage: "Carrinho salvo carregado.",
        });
        return () => {
          isMounted = false;
        };
      }

      if (storedCart.shouldClear) {
        let resetMessage = storedCart.message ?? "Seu carrinho antigo foi reiniciado.";

        try {
          window.localStorage.removeItem(CART_STORAGE_KEY);
        } catch {
          resetMessage = `${resetMessage} ${CART_CLEAR_STORAGE_FAILURE_MESSAGE}`;
        }

        publishHydrationState({
          nextAlertMessage: resetMessage,
          nextCart: null,
          nextStatusMessage: "Carrinho pronto para receber produtos.",
          skipNextPersist: true,
        });
        return () => {
          isMounted = false;
        };
      }

      publishHydrationState({
        nextAlertMessage: null,
        nextCart: null,
        nextStatusMessage: "Carrinho pronto para receber produtos.",
      });
    } catch {
      publishHydrationState({
        nextAlertMessage: CART_READ_FAILURE_MESSAGE,
        nextCart: null,
        nextStatusMessage: "Carrinho disponível apenas nesta sessão.",
      });
    }

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    function reportPersistenceFailure(message: string) {
      queueMicrotask(() => {
        if (isMounted) {
          setAlertMessage(message);
        }
      });
    }

    if (!hasHydrated) {
      return () => {
        isMounted = false;
      };
    }

    if (skipNextPersistRef.current) {
      skipNextPersistRef.current = false;
      return () => {
        isMounted = false;
      };
    }

    try {
      if (cart === null) {
        window.localStorage.removeItem(CART_STORAGE_KEY);
        return () => {
          isMounted = false;
        };
      }

      const serializedCart = serializeCart(cart);

      if (serializedCart === null) {
        reportPersistenceFailure(CART_OPERATION_MESSAGES.INVALID_CART_INPUT);
        return () => {
          isMounted = false;
        };
      }

      window.localStorage.setItem(CART_STORAGE_KEY, serializedCart);
    } catch {
      reportPersistenceFailure(CART_WRITE_FAILURE_MESSAGE);
    }

    return () => {
      isMounted = false;
    };
  }, [cart, hasHydrated]);

  const cartTotals = useMemo(() => getCartTotals(cart), [cart]);
  const productQuantities = useMemo(() => {
    const quantities = new Map<string, number>();

    for (const item of cart?.items ?? []) {
      quantities.set(item.productId, item.quantity);
    }

    return quantities;
  }, [cart]);

  function applyCartResult(
    result: CartOperationResult,
    options: { successMessage?: string; failureMessage?: string } = {},
  ) {
    if (result.ok) {
      setCart(result.cart);
      setStatusMessage(options.successMessage ?? result.message);
      setAlertMessage(null);
      return;
    }

    setCart(result.cart);
    setAlertMessage(options.failureMessage ?? result.message);
  }

  function handleAddProduct(product: CatalogProductDto) {
    const input = toAddCartItemInput(catalog, product);
    const result = addCartItem(cart, input);

    if (result.ok) {
      applyCartResult(result, {
        successMessage: `${result.message} ${product.name} está no carrinho.`,
      });
      return;
    }

    if (result.code !== "CROSS_STORE_CONFIRMATION_REQUIRED") {
      applyCartResult(result);
      return;
    }

    const confirmed =
      typeof window.confirm === "function"
        ? window.confirm(
            `${result.message}\n\nTrocar o carrinho de ${
              result.cart?.store.name ?? "outra loja"
            } por ${catalog.name}?`,
          )
        : false;

    if (!confirmed) {
      setStatusMessage(CART_CANCELLED_MESSAGE);
      setAlertMessage(null);
      return;
    }

    const replacementResult = replaceCartWithItem(input);

    applyCartResult(replacementResult, {
      successMessage: `${replacementResult.message} ${product.name} está no carrinho.`,
    });
  }

  function handleIncrement(item: LocalCartItem) {
    applyCartResult(updateCartItemQuantity(cart, item.productId, item.quantity + 1));
  }

  function handleDecrement(item: LocalCartItem) {
    if (item.quantity <= 1) {
      applyCartResult(updateCartItemQuantity(cart, item.productId, 0));
      return;
    }

    applyCartResult(updateCartItemQuantity(cart, item.productId, item.quantity - 1));
  }

  function handleQuantityChange(
    item: LocalCartItem,
    event: ChangeEvent<HTMLInputElement>,
  ) {
    applyCartResult(
      updateCartItemQuantity(cart, item.productId, event.currentTarget.valueAsNumber),
    );
  }

  function handleRemove(item: LocalCartItem) {
    applyCartResult(removeCartItem(cart, item.productId));
  }

  function handleClearCart() {
    applyCartResult(clearCart());
  }

  const cartStoreName = cart?.store.name ?? catalog.name;
  const isOtherStoreCart =
    cart !== null && cart.store.establishmentId !== catalog.id;
  const canCheckoutCurrentStoreCart =
    hasHydrated && cart !== null && cart.store.establishmentId === catalog.id;

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_24rem] xl:items-start">
      <section aria-labelledby="active-products-heading" className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.28em] text-orange-700">
              Produtos ativos
            </p>
            <h2
              className="mt-2 text-2xl font-black tracking-[-0.04em] text-orange-950"
              id="active-products-heading"
            >
              Cardápio disponível
            </h2>
          </div>
          <span className="rounded-full border border-orange-100 bg-white px-4 py-2 text-xs font-black uppercase tracking-[0.18em] text-orange-800 shadow-sm shadow-orange-950/5">
            {catalog.products.length} ativos
          </span>
        </div>

        {catalog.products.length === 0 ? (
          <FeedbackState
            description="Esta loja está ativa, mas ainda não possui produtos ativos no catálogo público."
            title="Nenhum produto ativo no momento"
            tone="empty"
          />
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {catalog.products.map((product) => (
              <ProductCard
                key={product.slug}
                onAddProduct={handleAddProduct}
                product={product}
                quantityInCart={productQuantities.get(product.id) ?? 0}
              />
            ))}
          </div>
        )}
      </section>

      <aside
        aria-labelledby="cart-panel-heading"
        className="rounded-[2rem] border border-orange-200/80 bg-white/95 p-5 shadow-xl shadow-orange-950/10 backdrop-blur xl:sticky xl:top-6"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.28em] text-orange-700">
              Carrinho local
            </p>
            <h2
              className="mt-2 text-2xl font-black tracking-[-0.045em] text-orange-950"
              id="cart-panel-heading"
            >
              Seu carrinho
            </h2>
          </div>
          <span className="rounded-full bg-lime-100 px-3 py-1 text-xs font-black text-lime-800">
            {cartTotals.itemCount} itens
          </span>
        </div>

        <div className="mt-4 grid gap-2 rounded-3xl border border-orange-100 bg-orange-50/80 p-4 text-sm font-bold text-orange-950">
          <span>Loja do carrinho: {cartStoreName}</span>
          <span>Subtotal: {formatMoneyFromCents(cartTotals.subtotalCents)}</span>
          <span>Entrega desta loja: {formatMoney(catalog.deliveryFee)}</span>
          <span>Pedido mínimo desta loja: {formatMinimumOrder(catalog.minimumOrder)}</span>
        </div>

        {isOtherStoreCart ? (
          <p className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-900">
            Este carrinho é de outra loja. Ao adicionar um produto daqui, você poderá trocar o carrinho com confirmação.
          </p>
        ) : null}

        <p
          aria-atomic="true"
          aria-live="polite"
          className="mt-4 rounded-2xl border border-lime-200 bg-lime-50 px-4 py-3 text-sm font-bold text-lime-900"
          role="status"
        >
          {statusMessage}
        </p>

        {alertMessage ? (
          <p
            aria-atomic="true"
            className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-900"
            role="alert"
          >
            {alertMessage}
          </p>
        ) : null}

        {cart === null ? (
          <div className="mt-5 rounded-3xl border border-dashed border-orange-200 bg-white p-5 text-sm leading-6 text-slate-700">
            {EMPTY_CART_MESSAGE}
          </div>
        ) : (
          <div className="mt-5 space-y-4">
            <ul className="space-y-3" aria-label="Itens do carrinho">
              {cart.items.map((item, index) => (
                <CartItemRow
                  index={index}
                  item={item}
                  key={item.productId}
                  onDecrement={handleDecrement}
                  onIncrement={handleIncrement}
                  onQuantityChange={handleQuantityChange}
                  onRemove={handleRemove}
                />
              ))}
            </ul>

            <div className="rounded-3xl bg-orange-950 p-4 text-white">
              <div className="flex items-center justify-between gap-3 text-sm font-bold text-orange-100">
                <span>{cartTotals.lineCount} produtos diferentes</span>
                <span>{cartTotals.itemCount} unidades</span>
              </div>
              <div className="mt-3 flex items-end justify-between gap-3">
                <span className="text-sm font-bold text-orange-100">Total parcial</span>
                <strong className="text-2xl font-black tracking-[-0.04em]">
                  {formatMoneyFromCents(cartTotals.subtotalCents)}
                </strong>
              </div>
            </div>

            {canCheckoutCurrentStoreCart ? (
              <Link
                className="block w-full rounded-full bg-lime-500 px-4 py-3 text-center text-sm font-black text-lime-950 shadow-sm shadow-lime-950/10 transition hover:bg-lime-400 focus:outline-none focus:ring-4 focus:ring-lime-100"
                href="/checkout"
              >
                Revisar entrega e pagamento
              </Link>
            ) : null}

            <button
              className="w-full rounded-full border border-orange-200 px-4 py-3 text-sm font-black text-orange-800 transition hover:border-orange-300 hover:bg-orange-50 focus:outline-none focus:ring-4 focus:ring-orange-100"
              onClick={handleClearCart}
              type="button"
            >
              Limpar carrinho
            </button>
          </div>
        )}
      </aside>
    </div>
  );
}

type ProductCardProps = {
  product: CatalogProductDto;
  quantityInCart: number;
  onAddProduct(product: CatalogProductDto): void;
};

function ProductCard({ product, quantityInCart, onAddProduct }: ProductCardProps) {
  const imageUrl = getSafeLocalImageUrl(product.imageUrl);

  return (
    <article className="flex h-full flex-col overflow-hidden rounded-[1.75rem] border border-orange-100 bg-white shadow-sm shadow-orange-950/5">
      <div className="relative grid aspect-[4/3] place-items-center bg-orange-50 text-4xl font-black text-orange-700">
        {imageUrl ? (
          <Image
            alt={`Foto de ${product.name}`}
            className="object-cover"
            fill
            sizes="(min-width: 1280px) 33vw, (min-width: 768px) 50vw, 100vw"
            src={imageUrl}
          />
        ) : (
          <span aria-hidden="true">{product.name.slice(0, 1).toUpperCase()}</span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-4 p-5">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.24em] text-orange-600">
            {product.category?.name ?? "Produto"}
          </p>
          <h3 className="mt-2 text-xl font-black tracking-[-0.04em] text-orange-950">
            {product.name}
          </h3>
        </div>
        <p className="text-sm leading-7 text-slate-700">
          {product.description ?? "Produto ativo disponível neste catálogo."}
        </p>
        <div className="mt-auto space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-2xl font-black tracking-[-0.04em] text-orange-700">
              {formatMoney(product.price)}
            </p>
            {quantityInCart > 0 ? (
              <span className="rounded-full bg-lime-100 px-3 py-1 text-xs font-black text-lime-800">
                No carrinho: {quantityInCart}
              </span>
            ) : null}
          </div>
          <button
            aria-label={`Adicionar ${product.name} ao carrinho`}
            className="w-full rounded-full bg-orange-600 px-4 py-3 text-sm font-black text-white shadow-sm shadow-orange-950/10 transition hover:bg-orange-700 focus:outline-none focus:ring-4 focus:ring-orange-100"
            onClick={() => onAddProduct(product)}
            type="button"
          >
            Adicionar ao carrinho
          </button>
        </div>
      </div>
    </article>
  );
}

type CartItemRowProps = {
  index: number;
  item: LocalCartItem;
  onIncrement(item: LocalCartItem): void;
  onDecrement(item: LocalCartItem): void;
  onQuantityChange(item: LocalCartItem, event: ChangeEvent<HTMLInputElement>): void;
  onRemove(item: LocalCartItem): void;
};

function CartItemRow({
  index,
  item,
  onIncrement,
  onDecrement,
  onQuantityChange,
  onRemove,
}: CartItemRowProps) {
  const imageUrl = getSafeLocalImageUrl(item.imageUrl);
  const quantityInputId = `cart-quantity-${index}`;

  return (
    <li className="rounded-3xl border border-orange-100 bg-white p-3 shadow-sm shadow-orange-950/5">
      <div className="flex gap-3">
        <div className="relative grid size-16 shrink-0 place-items-center overflow-hidden rounded-2xl bg-orange-50 text-xl font-black text-orange-700">
          {imageUrl ? (
            <Image
              alt={`Foto de ${item.name}`}
              className="object-cover"
              fill
              sizes="64px"
              src={imageUrl}
            />
          ) : (
            <span aria-hidden="true">{item.name.slice(0, 1).toUpperCase()}</span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-black text-orange-950">{item.name}</h3>
          <p className="mt-1 text-sm font-bold text-orange-700">
            {formatMoney(item.price)} cada
          </p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          aria-label={`Diminuir quantidade de ${item.name}`}
          className="grid size-9 place-items-center rounded-full border border-orange-200 text-lg font-black text-orange-800 transition hover:bg-orange-50 focus:outline-none focus:ring-4 focus:ring-orange-100 disabled:cursor-not-allowed disabled:opacity-45"
          disabled={item.quantity <= 1}
          onClick={() => onDecrement(item)}
          type="button"
        >
          −
        </button>
        <label className="sr-only" htmlFor={quantityInputId}>
          Quantidade de {item.name}
        </label>
        <input
          className="h-9 w-16 rounded-full border border-orange-200 text-center text-sm font-black text-orange-950 focus:outline-none focus:ring-4 focus:ring-orange-100"
          id={quantityInputId}
          inputMode="numeric"
          max={CHECKOUT_MAX_ITEM_QUANTITY}
          min={1}
          onChange={(event) => onQuantityChange(item, event)}
          type="number"
          value={item.quantity}
        />
        <button
          aria-label={`Aumentar quantidade de ${item.name}`}
          className="grid size-9 place-items-center rounded-full border border-orange-200 text-lg font-black text-orange-800 transition hover:bg-orange-50 focus:outline-none focus:ring-4 focus:ring-orange-100"
          onClick={() => onIncrement(item)}
          type="button"
        >
          +
        </button>
        <button
          className="ml-auto rounded-full px-3 py-2 text-xs font-black text-rose-700 transition hover:bg-rose-50 focus:outline-none focus:ring-4 focus:ring-rose-100"
          onClick={() => onRemove(item)}
          type="button"
        >
          Remover
        </button>
      </div>
    </li>
  );
}

function toAddCartItemInput(
  catalog: CatalogStoreCatalogDto,
  product: CatalogProductDto,
): AddCartItemInput {
  return {
    store: toCartStore(catalog),
    product: toCartDisplayProduct(product),
    quantity: 1,
  };
}

function toCartStore(catalog: CatalogStoreCatalogDto): CartStore {
  return {
    establishmentId: catalog.id,
    name: catalog.name,
  };
}

function toCartDisplayProduct(product: CatalogProductDto): CartDisplayProduct {
  return {
    productId: product.id,
    name: product.name,
    price: product.price,
    imageUrl: getSafeLocalImageUrl(product.imageUrl),
  };
}

function formatMinimumOrder(value: string) {
  return Number(value) === 0 ? "sem mínimo" : formatMoney(value);
}

function formatMoney(value: string) {
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) {
    return `R$ ${value}`;
  }

  return moneyFormatter.format(numericValue);
}

function formatMoneyFromCents(value: number) {
  return moneyFormatter.format(value / 100);
}

function getSafeLocalImageUrl(value: string | null | undefined) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return null;
  }

  return value;
}
