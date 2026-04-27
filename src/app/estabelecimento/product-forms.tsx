"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { PRODUCT_ACTION_IDLE_STATE } from "@/modules/products/action-state";
import type {
  ProductActionHandler,
  ProductActionState,
} from "@/modules/products/action-state";
import {
  activateProductAction,
  archiveProductAction,
  createProductAction,
  pauseProductAction,
  updateProductAction,
} from "@/modules/products/actions";
import type { ProductStatusValue } from "@/modules/products/service-core";

import {
  canActivateProductStatus,
  canArchiveProductStatus,
  canEditProductStatus,
  canPauseProductStatus,
  getProductActionLabel,
  type ProductActionKind,
} from "./product-copy";

export type ProductCategoryOption = {
  id: string;
  name: string;
};

export type MerchantProductFormProduct = {
  categoryId: string | null;
  description: string | null;
  id: string;
  name: string;
  price: string;
  status: ProductStatusValue;
};

type ProductFormProps = {
  categories?: ProductCategoryOption[];
  disabled?: boolean;
};

export function ProductCreateForm({
  categories = [],
  disabled = false,
}: ProductFormProps) {
  const [state, formAction] = useActionState(
    createProductAction,
    PRODUCT_ACTION_IDLE_STATE,
  );
  const fieldErrors = state.fieldErrors ?? {};

  return (
    <section className="rounded-[1.75rem] border border-orange-100 bg-white p-5 shadow-sm shadow-orange-950/5">
      <div className="grid gap-2">
        <p className="text-xs font-black uppercase tracking-[0.28em] text-orange-700">
          Novo produto
        </p>
        <h2 className="text-2xl font-black tracking-[-0.04em] text-orange-950">
          Cadastrar produto
        </h2>
        <p className="text-sm leading-6 text-slate-600">
          Cadastre nome, preço, categoria e descrição. Dono, loja, slug, status e
          foto continuam resolvidos no servidor pela sessão merchant.
        </p>
      </div>

      <ProductActionFeedback state={state} />

      <form action={formAction} className="mt-5 grid gap-4 lg:grid-cols-2">
        <ProductTextField
          errors={fieldErrors.name}
          id="product-create-name"
          label="Nome do produto"
          name="name"
          placeholder="Ex.: Batata frita"
          required
          value={state.values?.name ?? ""}
        />
        <ProductPriceField
          errors={fieldErrors.price}
          id="product-create-price"
          value={state.values?.price ?? ""}
        />
        <ProductCategoryField
          categories={categories}
          errors={fieldErrors.categoryId}
          id="product-create-category"
          value={state.values?.categoryId ?? ""}
        />
        <ProductTextareaField
          errors={fieldErrors.description}
          id="product-create-description"
          label="Descrição"
          name="description"
          placeholder="Descreva ingredientes, tamanho ou diferenciais."
          value={state.values?.description ?? ""}
        />
        <div className="lg:col-span-2">
          <ProductSubmitButton action="create" disabled={disabled} />
        </div>
      </form>
    </section>
  );
}

export function ProductEditForm({
  categories = [],
  disabled = false,
  product,
}: ProductFormProps & { product: MerchantProductFormProduct }) {
  const [state, formAction] = useActionState(
    updateProductAction,
    PRODUCT_ACTION_IDLE_STATE,
  );
  const fieldErrors = state.fieldErrors ?? {};
  const canSubmit = !disabled && canEditProductStatus(product.status);
  const idPrefix = `product-edit-${toDomId(product.id)}`;

  return (
    <section className="rounded-3xl border border-slate-200/80 bg-white/90 p-4 shadow-sm shadow-slate-950/5">
      <div>
        <p className="text-xs font-black uppercase tracking-[0.24em] text-slate-500">
          Edição segura
        </p>
        <h3 className="mt-1 text-lg font-black text-orange-950">
          Ajustar dados do produto
        </h3>
        <p className="mt-1 text-sm leading-6 text-slate-600">
          O formulário envia apenas campos editáveis e o identificador do produto;
          status e loja são validados pela ação no servidor.
        </p>
      </div>

      <ProductActionFeedback state={state} />

      {!canSubmit ? (
        <p
          className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold leading-6 text-amber-950"
          role="status"
        >
          Produtos arquivados não podem ser editados nesta tela.
        </p>
      ) : null}

      <form action={formAction} className="mt-4 grid gap-4 lg:grid-cols-2">
        <input name="productId" type="hidden" value={product.id} />
        <ProductTextField
          errors={fieldErrors.name}
          id={`${idPrefix}-name`}
          label="Nome do produto"
          name="name"
          placeholder="Ex.: Batata frita"
          required
          value={state.values?.name ?? product.name}
        />
        <ProductPriceField
          errors={fieldErrors.price}
          id={`${idPrefix}-price`}
          value={state.values?.price ?? product.price}
        />
        <ProductCategoryField
          categories={categories}
          errors={fieldErrors.categoryId}
          id={`${idPrefix}-category`}
          value={state.values?.categoryId ?? product.categoryId ?? ""}
        />
        <ProductTextareaField
          errors={fieldErrors.description}
          id={`${idPrefix}-description`}
          label="Descrição"
          name="description"
          placeholder="Descreva ingredientes, tamanho ou diferenciais."
          value={state.values?.description ?? product.description ?? ""}
        />
        <div className="lg:col-span-2">
          <ProductSubmitButton action="update" disabled={!canSubmit} />
        </div>
      </form>
    </section>
  );
}

export function ProductLifecycleControls({
  disabled = false,
  product,
}: {
  disabled?: boolean;
  product: Pick<MerchantProductFormProduct, "id" | "name" | "status">;
}) {
  const canActivate = canActivateProductStatus(product.status);
  const canPause = canPauseProductStatus(product.status);
  const canArchive = canArchiveProductStatus(product.status);

  if (!canActivate && !canPause && !canArchive) {
    return (
      <p
        className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold leading-6 text-slate-700"
        role="status"
      >
        Este produto está arquivado e não exibe ações de ciclo de vida.
      </p>
    );
  }

  return (
    <div className="grid gap-3 rounded-3xl border border-slate-200/80 bg-white/90 p-4 shadow-sm shadow-slate-950/5">
      <div>
        <p className="text-xs font-black uppercase tracking-[0.24em] text-slate-500">
          Ciclo de vida
        </p>
        <p className="mt-1 text-sm leading-6 text-slate-600">
          Pause, reative ou arquive sem excluir histórico do produto.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {canActivate ? (
          <ProductLifecycleForm
            action={activateProductAction}
            actionKind="activate"
            disabled={disabled}
            productId={product.id}
          />
        ) : null}
        {canPause ? (
          <ProductLifecycleForm
            action={pauseProductAction}
            actionKind="pause"
            disabled={disabled}
            productId={product.id}
          />
        ) : null}
        {canArchive ? (
          <ProductLifecycleForm
            action={archiveProductAction}
            actionKind="archive"
            disabled={disabled}
            productId={product.id}
          />
        ) : null}
      </div>
    </div>
  );
}

function ProductLifecycleForm({
  action,
  actionKind,
  disabled,
  productId,
}: {
  action: ProductActionHandler;
  actionKind: Extract<ProductActionKind, "activate" | "archive" | "pause">;
  disabled: boolean;
  productId: string;
}) {
  const [state, formAction] = useActionState(action, PRODUCT_ACTION_IDLE_STATE);

  return (
    <form action={formAction} className="grid gap-2">
      <input name="productId" type="hidden" value={productId} />
      <LifecycleSubmitButton action={actionKind} disabled={disabled} />
      <ProductActionFeedback compact state={state} />
    </form>
  );
}

function ProductTextField({
  errors,
  id,
  label,
  name,
  placeholder,
  required = false,
  value,
}: {
  errors?: string[];
  id: string;
  label: string;
  name: "name";
  placeholder: string;
  required?: boolean;
  value: string;
}) {
  const errorId = `${id}-error`;
  const hasErrors = Boolean(errors?.length);

  return (
    <label className="grid gap-2 text-sm font-bold text-slate-800" htmlFor={id}>
      {label}
      <input
        aria-describedby={hasErrors ? errorId : undefined}
        aria-invalid={hasErrors || undefined}
        className="rounded-2xl border border-orange-100 bg-white px-4 py-3 text-base text-slate-950 outline-none transition focus:border-orange-400 focus:ring-4 focus:ring-orange-100 disabled:cursor-not-allowed disabled:opacity-65"
        defaultValue={value}
        id={id}
        name={name}
        placeholder={placeholder}
        required={required}
        type="text"
      />
      <ProductFieldError errors={errors} id={errorId} />
    </label>
  );
}

function ProductPriceField({
  errors,
  id,
  value,
}: {
  errors?: string[];
  id: string;
  value: string;
}) {
  const errorId = `${id}-error`;
  const hasErrors = Boolean(errors?.length);

  return (
    <label className="grid gap-2 text-sm font-bold text-slate-800" htmlFor={id}>
      Preço
      <input
        aria-describedby={hasErrors ? errorId : `${id}-hint`}
        aria-invalid={hasErrors || undefined}
        className="rounded-2xl border border-orange-100 bg-white px-4 py-3 text-base text-slate-950 outline-none transition focus:border-orange-400 focus:ring-4 focus:ring-orange-100 disabled:cursor-not-allowed disabled:opacity-65"
        defaultValue={value}
        id={id}
        inputMode="decimal"
        name="price"
        placeholder="19,90"
        required
        type="text"
      />
      <span className="text-xs font-semibold text-slate-500" id={`${id}-hint`}>
        Use vírgula ou ponto para centavos.
      </span>
      <ProductFieldError errors={errors} id={errorId} />
    </label>
  );
}

function ProductCategoryField({
  categories,
  errors,
  id,
  value,
}: {
  categories: ProductCategoryOption[];
  errors?: string[];
  id: string;
  value: string;
}) {
  const errorId = `${id}-error`;
  const hasErrors = Boolean(errors?.length);
  const hasCurrentCategory = categories.some((category) => category.id === value);

  return (
    <label className="grid gap-2 text-sm font-bold text-slate-800" htmlFor={id}>
      Categoria
      <select
        aria-describedby={hasErrors ? errorId : undefined}
        aria-invalid={hasErrors || undefined}
        className="rounded-2xl border border-orange-100 bg-white px-4 py-3 text-base text-slate-950 outline-none transition focus:border-orange-400 focus:ring-4 focus:ring-orange-100 disabled:cursor-not-allowed disabled:opacity-65"
        defaultValue={value}
        id={id}
        name="categoryId"
      >
        <option value="">Sem categoria</option>
        {!hasCurrentCategory && value ? (
          <option value={value}>Categoria atual indisponível</option>
        ) : null}
        {categories.map((category) => (
          <option key={category.id} value={category.id}>
            {category.name}
          </option>
        ))}
      </select>
      <ProductFieldError errors={errors} id={errorId} />
    </label>
  );
}

function ProductTextareaField({
  errors,
  id,
  label,
  name,
  placeholder,
  value,
}: {
  errors?: string[];
  id: string;
  label: string;
  name: "description";
  placeholder: string;
  value: string;
}) {
  const errorId = `${id}-error`;
  const hasErrors = Boolean(errors?.length);

  return (
    <label className="grid gap-2 text-sm font-bold text-slate-800 lg:col-span-2" htmlFor={id}>
      {label}
      <textarea
        aria-describedby={hasErrors ? errorId : undefined}
        aria-invalid={hasErrors || undefined}
        className="min-h-24 rounded-2xl border border-orange-100 bg-white px-4 py-3 text-base text-slate-950 outline-none transition focus:border-orange-400 focus:ring-4 focus:ring-orange-100 disabled:cursor-not-allowed disabled:opacity-65"
        defaultValue={value}
        id={id}
        maxLength={500}
        name={name}
        placeholder={placeholder}
      />
      <ProductFieldError errors={errors} id={errorId} />
    </label>
  );
}

function ProductFieldError({ errors, id }: { errors?: string[]; id: string }) {
  if (!errors?.length) {
    return null;
  }

  return (
    <span className="text-xs font-bold text-rose-700" id={id}>
      {errors[0]}
    </span>
  );
}

function ProductActionFeedback({
  compact = false,
  state,
}: {
  compact?: boolean;
  state: ProductActionState;
}) {
  if (state.status === "idle") {
    return null;
  }

  const isError = state.status === "error";

  return (
    <div
      aria-live={isError ? "assertive" : "polite"}
      className={[
        compact ? "mt-2" : "mt-4",
        "rounded-2xl border px-4 py-3 text-sm font-semibold leading-6",
        isError
          ? "border-rose-200 bg-rose-50 text-rose-950"
          : "border-lime-200 bg-lime-50 text-lime-950",
      ].join(" ")}
      role={isError ? "alert" : "status"}
    >
      {state.message ??
        (isError
          ? "Não foi possível salvar o produto."
          : "Produto salvo com sucesso.")}
      {state.formErrors?.length ? (
        <ul className="mt-2 list-disc pl-5">
          {state.formErrors.map((error) => (
            <li key={error}>{error}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function ProductSubmitButton({
  action,
  disabled,
}: {
  action: Extract<ProductActionKind, "create" | "update">;
  disabled: boolean;
}) {
  const { pending } = useFormStatus();

  return (
    <button
      className="rounded-2xl bg-orange-600 px-5 py-3 text-sm font-black uppercase tracking-[0.18em] text-white shadow-xl shadow-orange-600/20 transition hover:bg-orange-700 focus:outline-none focus:ring-4 focus:ring-orange-100 disabled:cursor-not-allowed disabled:opacity-65"
      disabled={disabled || pending}
      type="submit"
    >
      {getProductActionLabel(action, pending)}
    </button>
  );
}

function LifecycleSubmitButton({
  action,
  disabled,
}: {
  action: Extract<ProductActionKind, "activate" | "archive" | "pause">;
  disabled: boolean;
}) {
  const { pending } = useFormStatus();
  const isArchive = action === "archive";

  return (
    <button
      className={[
        "rounded-2xl px-4 py-2.5 text-xs font-black uppercase tracking-[0.16em] transition focus:outline-none focus:ring-4 disabled:cursor-not-allowed disabled:opacity-65",
        isArchive
          ? "border border-rose-200 bg-white text-rose-800 hover:bg-rose-50 focus:ring-rose-100"
          : "bg-orange-950 text-white hover:bg-orange-900 focus:ring-orange-100",
      ].join(" ")}
      disabled={disabled || pending}
      type="submit"
    >
      {getProductActionLabel(action, pending)}
    </button>
  );
}

function toDomId(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]/g, "-") || "product";
}
