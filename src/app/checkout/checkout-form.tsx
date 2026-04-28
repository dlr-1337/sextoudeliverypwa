"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { useFormStatus } from "react-dom";

import {
  CART_STORAGE_KEY,
  getCartTotals,
  parseStoredCart,
  toCheckoutCartPayload,
  type LocalCart,
  type LocalCartItem,
} from "@/modules/cart/local-storage";
import {
  CHECKOUT_ACTION_IDLE_STATE,
  type CheckoutActionState,
} from "@/modules/orders/action-state";
import { checkoutOrderAction as submitCheckoutAction } from "@/modules/orders/actions";
import {
  CHECKOUT_PAYMENT_OPTIONS,
  type CheckoutPaymentMethod,
} from "@/modules/orders/schemas";

export type CheckoutCustomerDefaults = {
  name: string;
  phone: string;
};

type CheckoutFormProps = {
  customerDefaults: CheckoutCustomerDefaults;
};

type FieldName =
  | "customerName"
  | "customerPhone"
  | "deliveryStreet"
  | "deliveryNumber"
  | "deliveryComplement"
  | "deliveryNeighborhood"
  | "deliveryCity"
  | "deliveryState"
  | "deliveryPostalCode"
  | "deliveryReference"
  | "generalObservation"
  | "paymentMethod"
  | "items";

const moneyFormatter = new Intl.NumberFormat("pt-BR", {
  currency: "BRL",
  style: "currency",
});

const ORDER_CONFIRMATION_ROUTE_PREFIX = "/pedido/";
const CART_HYDRATING_MESSAGE = "Carrinho carregando no navegador.";
const CART_READY_MESSAGE = "Carrinho salvo carregado para revisão.";
const CART_EMPTY_MESSAGE =
  "Nenhum carrinho salvo foi encontrado. Adicione produtos de uma loja antes de finalizar.";
const CART_READ_FAILURE_MESSAGE =
  "Não foi possível ler o carrinho salvo neste navegador. Revise o catálogo e tente montar o carrinho novamente.";
const CART_CLEAR_STORAGE_FAILURE_MESSAGE =
  "Não foi possível limpar o carrinho inválido do navegador, mas ele foi ignorado neste checkout.";
const CART_INVALID_PAYLOAD_MESSAGE =
  "O carrinho salvo não gerou um payload seguro para checkout. Volte à loja e monte o carrinho novamente.";
const CART_CREATED_CLEAR_FAILURE_MESSAGE =
  "Pedido criado, mas não foi possível limpar o carrinho salvo deste navegador. Use o link de confirmação abaixo.";
const CART_CREATED_NAVIGATION_FAILURE_MESSAGE =
  "Pedido criado, mas o redirecionamento automático falhou. Use o link de confirmação abaixo.";
const ESTIMATE_COPY =
  "Valores e disponibilidade são estimativas do carrinho salvo; o servidor recalculará tudo antes de criar o pedido e iniciar pagamentos online quando selecionados.";

export function CheckoutForm({ customerDefaults }: CheckoutFormProps) {
  const router = useRouter();
  const [state, formAction] = useActionState(
    submitCheckoutAction,
    CHECKOUT_ACTION_IDLE_STATE,
  );
  const [cart, setCart] = useState<LocalCart | null>(null);
  const [hasHydrated, setHasHydrated] = useState(false);
  const [cartStatusMessage, setCartStatusMessage] = useState(
    CART_HYDRATING_MESSAGE,
  );
  const [cartAlertMessage, setCartAlertMessage] = useState<string | null>(null);
  const handledCreatedCodeRef = useRef<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    function publishCartState({
      alertMessage,
      nextCart,
      statusMessage,
    }: {
      alertMessage: string | null;
      nextCart: LocalCart | null;
      statusMessage: string;
    }) {
      queueMicrotask(() => {
        if (!isMounted) {
          return;
        }

        setCart(nextCart);
        setCartAlertMessage(alertMessage);
        setCartStatusMessage(statusMessage);
        setHasHydrated(true);
      });
    }

    try {
      const storedCart = parseStoredCart(window.localStorage.getItem(CART_STORAGE_KEY));

      if (storedCart.status === "valid") {
        publishCartState({
          alertMessage: null,
          nextCart: storedCart.cart,
          statusMessage: CART_READY_MESSAGE,
        });
        return () => {
          isMounted = false;
        };
      }

      if (storedCart.shouldClear) {
        let resetMessage = storedCart.message ?? CART_INVALID_PAYLOAD_MESSAGE;

        try {
          window.localStorage.removeItem(CART_STORAGE_KEY);
        } catch {
          resetMessage = `${resetMessage} ${CART_CLEAR_STORAGE_FAILURE_MESSAGE}`;
        }

        publishCartState({
          alertMessage: resetMessage,
          nextCart: null,
          statusMessage: CART_EMPTY_MESSAGE,
        });
        return () => {
          isMounted = false;
        };
      }

      publishCartState({
        alertMessage: null,
        nextCart: null,
        statusMessage: CART_EMPTY_MESSAGE,
      });
    } catch {
      publishCartState({
        alertMessage: CART_READ_FAILURE_MESSAGE,
        nextCart: null,
        statusMessage: CART_EMPTY_MESSAGE,
      });
    }

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (state.status !== "created") {
      return;
    }

    if (handledCreatedCodeRef.current === state.publicCode) {
      return;
    }

    handledCreatedCodeRef.current = state.publicCode;
    let didClearSubmittedCart = false;
    let postCreateAlert: string | null = null;
    let isMounted = true;

    if (cart) {
      try {
        const storedCart = parseStoredCart(window.localStorage.getItem(CART_STORAGE_KEY));

        if (
          storedCart.status === "valid" &&
          storedCart.cart.store.establishmentId === cart.store.establishmentId
        ) {
          window.localStorage.removeItem(CART_STORAGE_KEY);
          didClearSubmittedCart = true;
        }
      } catch {
        postCreateAlert = CART_CREATED_CLEAR_FAILURE_MESSAGE;
      }
    }

    try {
      router.push(state.redirectPath);
    } catch {
      postCreateAlert = postCreateAlert
        ? `${postCreateAlert} ${CART_CREATED_NAVIGATION_FAILURE_MESSAGE}`
        : CART_CREATED_NAVIGATION_FAILURE_MESSAGE;
    }

    queueMicrotask(() => {
      if (!isMounted) {
        return;
      }

      if (didClearSubmittedCart) {
        setCart(null);
        setCartStatusMessage(CART_EMPTY_MESSAGE);
      }

      if (postCreateAlert) {
        setCartAlertMessage(postCreateAlert);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [cart, router, state]);

  const checkoutCartPayload = useMemo(() => toCheckoutCartPayload(cart), [cart]);
  const cartTotals = useMemo(() => getCartTotals(cart), [cart]);
  const errorState = state.status === "error" ? state : null;
  const fieldErrors = errorState?.fieldErrors ?? {};
  const selectedPaymentMethod = getSelectedPaymentMethod(
    errorState?.values?.paymentMethod,
  );
  const canSubmit = hasHydrated && checkoutCartPayload !== null;

  function valueFor(field: Exclude<FieldName, "items">, fallback = "") {
    return errorState?.values?.[field] ?? fallback;
  }

  return (
    <form
      action={formAction}
      className="rounded-[2rem] border border-orange-200/75 bg-white/95 p-5 shadow-2xl shadow-orange-950/10 backdrop-blur sm:p-7"
    >
      <div className="space-y-2">
        <p className="text-xs font-black uppercase tracking-[0.28em] text-orange-700">
          Checkout CUSTOMER
        </p>
        <h2 className="text-3xl font-black tracking-[-0.04em] text-orange-950 sm:text-4xl">
          Dados para criar o pedido
        </h2>
        <p className="text-sm leading-6 text-slate-600">
          Enviaremos somente identificadores de loja/produtos, quantidades e os
          campos abaixo. Preços, imagens, nomes do carrinho e estado de
          pagamento não têm autoridade no servidor.
        </p>
      </div>

      <CartHydrationStatus
        alertMessage={cartAlertMessage}
        statusMessage={cartStatusMessage}
      />

      {errorState ? (
        <ActionError
          formErrors={errorState.formErrors}
          message={errorState.message ?? "Não foi possível criar o pedido."}
        />
      ) : null}

      {state.status === "created" ? <CreatedOrderStatus state={state} /> : null}

      <CartReview
        cart={cart}
        cartTotals={cartTotals}
        fieldErrors={fieldErrors}
        hasHydrated={hasHydrated}
      />

      {checkoutCartPayload ? (
        <div aria-hidden="true">
          <input
            name="establishmentId"
            type="hidden"
            value={checkoutCartPayload.establishmentId}
          />
          {checkoutCartPayload.items.map((item, index) => (
            <div key={`${item.productId}-${index}`}>
              <input
                name={`items.${index}.productId`}
                type="hidden"
                value={item.productId}
              />
              <input
                name={`items.${index}.quantity`}
                type="hidden"
                value={item.quantity}
              />
            </div>
          ))}
        </div>
      ) : null}

      <div className="mt-7 grid gap-5 md:grid-cols-2">
        <TextField
          autoComplete="name"
          defaultValue={valueFor("customerName", customerDefaults.name)}
          errors={fieldErrors.customerName}
          label="Nome para entrega"
          name="customerName"
          placeholder="Maria Cliente"
          required
        />
        <TextField
          autoComplete="tel"
          defaultValue={valueFor("customerPhone", customerDefaults.phone)}
          errors={fieldErrors.customerPhone}
          label="Telefone para contato"
          name="customerPhone"
          placeholder="(11) 99999-9999"
          required
        />
        <TextField
          autoComplete="address-line1"
          defaultValue={valueFor("deliveryStreet")}
          errors={fieldErrors.deliveryStreet}
          label="Rua"
          name="deliveryStreet"
          placeholder="Rua das Flores"
          required
        />
        <TextField
          autoComplete="address-line2"
          defaultValue={valueFor("deliveryNumber")}
          errors={fieldErrors.deliveryNumber}
          label="Número"
          name="deliveryNumber"
          placeholder="42A"
          required
        />
        <TextField
          defaultValue={valueFor("deliveryComplement")}
          errors={fieldErrors.deliveryComplement}
          label="Complemento"
          name="deliveryComplement"
          placeholder="Apto, bloco ou casa"
        />
        <TextField
          autoComplete="address-level3"
          defaultValue={valueFor("deliveryNeighborhood")}
          errors={fieldErrors.deliveryNeighborhood}
          label="Bairro"
          name="deliveryNeighborhood"
          placeholder="Centro"
          required
        />
        <TextField
          autoComplete="address-level2"
          defaultValue={valueFor("deliveryCity")}
          errors={fieldErrors.deliveryCity}
          label="Cidade"
          name="deliveryCity"
          placeholder="São Paulo"
          required
        />
        <TextField
          autoComplete="address-level1"
          defaultValue={valueFor("deliveryState")}
          errors={fieldErrors.deliveryState}
          label="Estado"
          name="deliveryState"
          placeholder="SP"
          required
        />
        <TextField
          autoComplete="postal-code"
          defaultValue={valueFor("deliveryPostalCode")}
          errors={fieldErrors.deliveryPostalCode}
          label="CEP"
          name="deliveryPostalCode"
          placeholder="01001-000"
          required
        />
        <TextField
          defaultValue={valueFor("deliveryReference")}
          errors={fieldErrors.deliveryReference}
          label="Ponto de referência"
          name="deliveryReference"
          placeholder="Portão laranja, próximo à praça"
        />
      </div>

      <TextareaField
        defaultValue={valueFor("generalObservation")}
        errors={fieldErrors.generalObservation}
        label="Observações gerais"
        name="generalObservation"
        placeholder="Ex.: tocar campainha, sem cebola, entregar na portaria"
      />

      <PaymentFieldset
        errors={fieldErrors.paymentMethod}
        selectedPaymentMethod={selectedPaymentMethod}
      />

      {!canSubmit ? (
        <p
          aria-atomic="true"
          className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-950"
          role="alert"
        >
          {hasHydrated ? CART_INVALID_PAYLOAD_MESSAGE : CART_HYDRATING_MESSAGE}
        </p>
      ) : null}

      <SubmitButton disabled={!canSubmit} />
    </form>
  );
}

function CreatedOrderStatus({
  state,
}: {
  state: Extract<CheckoutActionState, { status: "created" }>;
}) {
  const isStableOrderRoute = state.redirectPath.startsWith(
    ORDER_CONFIRMATION_ROUTE_PREFIX,
  );

  return (
    <div
      aria-atomic="true"
      className="mt-5 rounded-2xl border border-lime-200 bg-lime-50 px-4 py-3 text-sm font-bold text-lime-950"
      role="status"
    >
      <p>{state.message}</p>
      <p className="mt-2">Pedido criado: {state.publicCode}</p>
      <Link
        className="mt-3 inline-flex rounded-full bg-lime-700 px-4 py-2 text-xs font-black uppercase tracking-[0.16em] text-white transition hover:bg-lime-800 focus:outline-none focus:ring-4 focus:ring-lime-100"
        href={state.redirectPath}
      >
        {isStableOrderRoute ? "Acompanhar pedido" : "Abrir confirmação"}
      </Link>
    </div>
  );
}

function CartHydrationStatus({
  alertMessage,
  statusMessage,
}: {
  alertMessage: string | null;
  statusMessage: string;
}) {
  return (
    <div className="mt-5 space-y-3">
      <p
        aria-atomic="true"
        aria-live="polite"
        className="rounded-2xl border border-lime-200 bg-lime-50 px-4 py-3 text-sm font-bold text-lime-900"
        role="status"
      >
        {statusMessage}
      </p>
      {alertMessage ? (
        <p
          aria-atomic="true"
          className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-900"
          role="alert"
        >
          {alertMessage}
        </p>
      ) : null}
    </div>
  );
}

function ActionError({
  formErrors,
  message,
}: {
  formErrors?: string[];
  message: string;
}) {
  return (
    <div
      aria-atomic="true"
      className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-950"
      role="alert"
    >
      <p>{message}</p>
      {formErrors?.length ? (
        <ul className="mt-2 list-disc space-y-1 pl-5">
          {formErrors.map((error) => (
            <li key={error}>{error}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function CartReview({
  cart,
  cartTotals,
  fieldErrors,
  hasHydrated,
}: {
  cart: LocalCart | null;
  cartTotals: ReturnType<typeof getCartTotals>;
  fieldErrors: Record<string, string[] | undefined>;
  hasHydrated: boolean;
}) {
  const itemErrors = getItemFieldErrors(fieldErrors);

  return (
    <section
      aria-labelledby="checkout-cart-review-heading"
      className="mt-7 rounded-[1.75rem] border border-orange-100 bg-orange-50/80 p-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.24em] text-orange-700">
            Carrinho salvo
          </p>
          <h3
            className="mt-2 text-2xl font-black tracking-[-0.04em] text-orange-950"
            id="checkout-cart-review-heading"
          >
            Revisão do pedido
          </h3>
        </div>
        <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-orange-800 shadow-sm shadow-orange-950/5">
          {cartTotals.itemCount} unidades
        </span>
      </div>

      <p className="mt-3 text-sm font-semibold leading-6 text-slate-700">
        {ESTIMATE_COPY}
      </p>

      {!hasHydrated ? (
        <div className="mt-4 rounded-2xl border border-dashed border-orange-200 bg-white px-4 py-5 text-sm font-bold text-orange-950">
          Carregando carrinho deste navegador...
        </div>
      ) : cart === null ? (
        <div className="mt-4 rounded-2xl border border-dashed border-orange-200 bg-white px-4 py-5 text-sm leading-6 text-slate-700">
          Carrinho vazio para checkout. Volte ao catálogo de uma loja ativa e
          adicione itens antes de concluir.
          <div className="mt-3">
            <Link
              className="font-black text-orange-700 underline-offset-4 hover:underline focus:outline-none focus:ring-4 focus:ring-orange-100"
              href="/lojas"
            >
              Ver lojas ativas
            </Link>
          </div>
        </div>
      ) : (
        <div className="mt-4 space-y-4">
          <div className="rounded-2xl border border-orange-100 bg-white px-4 py-3 text-sm font-bold text-orange-950">
            Loja: {cart.store.name}
          </div>
          <ul aria-label="Itens estimados do carrinho" className="space-y-3">
            {cart.items.map((item) => (
              <CartReviewItem item={item} key={item.productId} />
            ))}
          </ul>
          <div className="rounded-3xl bg-orange-950 p-4 text-white">
            <div className="flex items-center justify-between gap-3 text-sm font-bold text-orange-100">
              <span>{cartTotals.lineCount} produtos diferentes</span>
              <span>{cartTotals.itemCount} unidades</span>
            </div>
            <div className="mt-3 flex items-end justify-between gap-3">
              <span className="text-sm font-bold text-orange-100">
                Subtotal estimado
              </span>
              <strong className="text-2xl font-black tracking-[-0.04em]">
                {formatMoneyFromCents(cartTotals.subtotalCents)}
              </strong>
            </div>
          </div>
        </div>
      )}

      <FieldError errors={fieldErrors.items} field="items" />
      {itemErrors.length > 0 ? (
        <ul className="mt-3 space-y-1 text-xs font-bold text-rose-700" role="alert">
          {itemErrors.map(({ field, message }) => (
            <li key={`${field}-${message}`}>{message}</li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function CartReviewItem({ item }: { item: LocalCartItem }) {
  return (
    <li className="rounded-3xl border border-orange-100 bg-white p-4 shadow-sm shadow-orange-950/5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h4 className="text-sm font-black text-orange-950">{item.name}</h4>
          <p className="mt-1 text-sm font-bold text-orange-700">
            {formatMoney(item.price)} cada · quantidade {item.quantity}
          </p>
        </div>
        <strong className="text-sm font-black text-orange-950">
          {formatMoneyFromCents(getLineSubtotalCents(item))}
        </strong>
      </div>
    </li>
  );
}

function TextField({
  autoComplete,
  defaultValue,
  errors,
  label,
  name,
  placeholder,
  required = false,
}: {
  autoComplete?: string;
  defaultValue: string;
  errors?: string[];
  label: string;
  name: Exclude<FieldName, "generalObservation" | "items" | "paymentMethod">;
  placeholder: string;
  required?: boolean;
}) {
  const errorId = `${name}-error`;
  const inputId = `checkout-${name}`;

  return (
    <label className="grid gap-2 text-sm font-bold text-slate-800" htmlFor={inputId}>
      {label}
      <input
        aria-describedby={errors?.length ? errorId : undefined}
        aria-invalid={errors?.length ? true : undefined}
        autoComplete={autoComplete}
        className="rounded-2xl border border-orange-100 bg-white px-4 py-3 text-base text-slate-950 outline-none transition focus:border-orange-400 focus:bg-white focus:ring-4 focus:ring-orange-100"
        defaultValue={defaultValue}
        id={inputId}
        name={name}
        placeholder={placeholder}
        required={required}
        type="text"
      />
      <FieldError errors={errors} field={name} id={errorId} />
    </label>
  );
}

function TextareaField({
  defaultValue,
  errors,
  label,
  name,
  placeholder,
}: {
  defaultValue: string;
  errors?: string[];
  label: string;
  name: "generalObservation";
  placeholder: string;
}) {
  const errorId = `${name}-error`;
  const inputId = `checkout-${name}`;

  return (
    <label className="mt-5 grid gap-2 text-sm font-bold text-slate-800" htmlFor={inputId}>
      {label}
      <textarea
        aria-describedby={errors?.length ? errorId : undefined}
        aria-invalid={errors?.length ? true : undefined}
        className="min-h-28 rounded-2xl border border-orange-100 bg-white px-4 py-3 text-base text-slate-950 outline-none transition focus:border-orange-400 focus:bg-white focus:ring-4 focus:ring-orange-100"
        defaultValue={defaultValue}
        id={inputId}
        name={name}
        placeholder={placeholder}
      />
      <FieldError errors={errors} field={name} id={errorId} />
    </label>
  );
}

function PaymentFieldset({
  errors,
  selectedPaymentMethod,
}: {
  errors?: string[];
  selectedPaymentMethod: CheckoutPaymentMethod;
}) {
  return (
    <fieldset
      aria-describedby={errors?.length ? "paymentMethod-error" : undefined}
      className="mt-7 rounded-[1.75rem] border border-orange-100 bg-white p-4"
    >
      <legend className="text-sm font-black uppercase tracking-[0.22em] text-orange-700">
        Forma de pagamento
      </legend>
      <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">
        Dinheiro fica manual na entrega. PIX e cartão iniciam um pagamento
        online fake/dev pendente; dados sensíveis do cartão não são digitados
        neste formulário.
      </p>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        {CHECKOUT_PAYMENT_OPTIONS.map((option) => {
          const inputId = `payment-${option.method.toLowerCase()}`;

          return (
            <label
              className={[
                "rounded-3xl border p-4 text-sm transition",
                option.isConfirmable
                  ? "border-lime-200 bg-lime-50 text-lime-950"
                  : "border-slate-200 bg-slate-50 text-slate-500 opacity-75",
              ].join(" ")}
              htmlFor={inputId}
              key={option.method}
            >
              <span className="flex items-center gap-2 font-black">
                <input
                  defaultChecked={selectedPaymentMethod === option.method}
                  disabled={!option.isConfirmable}
                  id={inputId}
                  name="paymentMethod"
                  type="radio"
                  value={option.method}
                />
                {option.label}
              </span>
              <span className="mt-2 block leading-6">{option.description}</span>
              {option.disabledReason ? (
                <span className="mt-2 block text-xs font-black uppercase tracking-[0.16em]">
                  Indisponível: {option.disabledReason}
                </span>
              ) : null}
            </label>
          );
        })}
      </div>
      <FieldError errors={errors} field="paymentMethod" id="paymentMethod-error" />
    </fieldset>
  );
}

function SubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();

  return (
    <button
      className="mt-7 w-full rounded-2xl bg-orange-600 px-5 py-3 text-sm font-black uppercase tracking-[0.2em] text-white shadow-xl shadow-orange-600/25 transition hover:bg-orange-700 focus:outline-none focus:ring-4 focus:ring-orange-100 disabled:cursor-not-allowed disabled:opacity-65"
      disabled={disabled || pending}
      type="submit"
    >
      {pending ? "Criando pedido..." : "Criar pedido"}
    </button>
  );
}

function FieldError({
  errors,
  field,
  id,
}: {
  errors?: string[];
  field: string;
  id?: string;
}) {
  if (!errors?.length) {
    return null;
  }

  return (
    <span className="mt-1 text-xs font-bold text-rose-700" id={id} role="alert">
      {field ? `${errors[0]}` : errors[0]}
    </span>
  );
}

function getItemFieldErrors(fieldErrors: Record<string, string[] | undefined>) {
  return Object.entries(fieldErrors)
    .filter(([field]) => /^items\.\d+\.(productId|quantity)$/u.test(field))
    .flatMap(([field, errors]) =>
      (errors ?? []).map((message) => ({ field, message })),
    );
}

function getSelectedPaymentMethod(value: string | undefined): CheckoutPaymentMethod {
  const paymentOption = CHECKOUT_PAYMENT_OPTIONS.find(
    (option) => option.method === value,
  );

  return paymentOption?.method ?? "CASH";
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

function getLineSubtotalCents(item: LocalCartItem) {
  return Math.round(Number(item.price) * 100) * item.quantity;
}
