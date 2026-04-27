"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import {
  activateCategoryAction,
  createCategoryAction,
  inactivateCategoryAction,
  updateCategoryAction,
} from "@/modules/admin/actions";
import { ADMIN_ACTION_IDLE_STATE } from "@/modules/admin/action-state";
import type { AdminActionState } from "@/modules/admin/action-state";
import type {
  AdminCategoryListItemDto,
  AdminCategoryType,
} from "@/modules/admin/service-core";

type CategoryAdminFormsProps = {
  categoriesByType: Record<AdminCategoryType, AdminCategoryListItemDto[]>;
  limitPerType: number;
};

const CATEGORY_TYPES = ["ESTABLISHMENT", "PRODUCT"] as const satisfies readonly AdminCategoryType[];
const CATEGORY_TYPE_COPY: Record<AdminCategoryType, { label: string; hint: string }> = {
  ESTABLISHMENT: {
    label: "Estabelecimentos",
    hint: "Usadas para classificar lojas cadastradas por comerciantes.",
  },
  PRODUCT: {
    label: "Produtos",
    hint: "Usadas para organizar itens de catálogo dentro das lojas.",
  },
};

export function CategoryAdminForms({
  categoriesByType,
  limitPerType,
}: CategoryAdminFormsProps) {
  return (
    <div className="space-y-5">
      <section className="rounded-[1.75rem] border border-orange-100 bg-orange-950 p-6 text-white shadow-xl shadow-orange-950/15">
        <p className="text-xs font-black uppercase tracking-[0.28em] text-orange-200">
          Categorias administrativas
        </p>
        <div className="mt-3 grid gap-4 lg:grid-cols-[1fr_0.75fr] lg:items-end">
          <h2 className="text-3xl font-black tracking-[-0.055em] sm:text-5xl">
            Organize lojas e produtos sem expor controles fora do escopo.
          </h2>
          <p className="rounded-2xl border border-white/15 bg-white/10 p-4 text-sm font-semibold leading-6 text-orange-50">
            Listas ordenadas por ordem de exibição, nome e identificador. Cada
            tipo mostra até {limitPerType} categorias para manter a tela
            previsível enquanto a paginação não é necessária.
          </p>
        </div>
      </section>

      <CreateCategoryForm />

      <div className="grid gap-5 xl:grid-cols-2">
        {CATEGORY_TYPES.map((type) => (
          <CategorySection
            categories={categoriesByType[type]}
            key={type}
            type={type}
          />
        ))}
      </div>
    </div>
  );
}

function CreateCategoryForm() {
  const [state, formAction] = useActionState(
    createCategoryAction,
    ADMIN_ACTION_IDLE_STATE,
  );
  const fieldErrors = state.fieldErrors ?? {};

  return (
    <section className="rounded-[1.75rem] border border-orange-100 bg-white p-5 shadow-sm shadow-orange-950/5">
      <div className="max-w-3xl">
        <p className="text-xs font-black uppercase tracking-[0.28em] text-orange-700">
          Nova categoria
        </p>
        <h2 className="mt-2 text-2xl font-black tracking-[-0.04em] text-orange-950">
          Criar categoria
        </h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          O slug é gerado no servidor a partir do nome. Campos inválidos voltam
          destacados sem revelar detalhes de banco ou sessão.
        </p>
      </div>

      <ActionFeedback state={state} />

      <form action={formAction} className="mt-5 grid gap-4 lg:grid-cols-2">
        <TextField
          errors={fieldErrors.name}
          id="create-category-name"
          label="Nome"
          name="name"
          placeholder="Ex.: Pizzarias"
          value={state.values?.name}
        />
        <SelectField
          errors={fieldErrors.type}
          id="create-category-type"
          label="Tipo"
          name="type"
          value={(state.values?.type as AdminCategoryType | undefined) ?? "ESTABLISHMENT"}
        />
        <TextField
          errors={fieldErrors.displayOrder}
          id="create-category-display-order"
          inputMode="numeric"
          label="Ordem de exibição"
          name="displayOrder"
          placeholder="0"
          type="number"
          value={state.values?.displayOrder}
        />
        <TextareaField
          errors={fieldErrors.description}
          id="create-category-description"
          label="Descrição opcional"
          name="description"
          placeholder="Resumo interno para orientar a operação"
          value={state.values?.description}
        />
        <div className="lg:col-span-2">
          <SubmitButton label="Criar categoria" pendingLabel="Criando..." />
        </div>
      </form>
    </section>
  );
}

function CategorySection({
  categories,
  type,
}: {
  categories: AdminCategoryListItemDto[];
  type: AdminCategoryType;
}) {
  return (
    <section
      aria-labelledby={`category-section-${type}`}
      className="rounded-[1.75rem] border border-orange-100 bg-white p-5 shadow-sm shadow-orange-950/5"
    >
      <div>
        <p className="text-xs font-black uppercase tracking-[0.28em] text-orange-700">
          {CATEGORY_TYPE_COPY[type].label}
        </p>
        <h2
          className="mt-2 text-2xl font-black tracking-[-0.04em] text-orange-950"
          id={`category-section-${type}`}
        >
          {categories.length} categoria{categories.length === 1 ? "" : "s"}
        </h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          {CATEGORY_TYPE_COPY[type].hint}
        </p>
      </div>

      {categories.length === 0 ? (
        <p className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm font-semibold leading-6 text-slate-700">
          Nenhuma categoria deste tipo cadastrada ainda. Crie a primeira pelo
          formulário acima.
        </p>
      ) : (
        <div className="mt-5 grid gap-4">
          {categories.map((category) => (
            <CategoryCard category={category} key={category.id} />
          ))}
        </div>
      )}
    </section>
  );
}

function CategoryCard({ category }: { category: AdminCategoryListItemDto }) {
  const [editState, editFormAction] = useActionState(
    updateCategoryAction,
    ADMIN_ACTION_IDLE_STATE,
  );
  const toggleAction = category.isActive
    ? inactivateCategoryAction
    : activateCategoryAction;
  const [toggleState, toggleFormAction] = useActionState(
    toggleAction,
    ADMIN_ACTION_IDLE_STATE,
  );
  const editFieldErrors = editState.fieldErrors ?? {};
  const cardId = `category-${category.id}`;

  return (
    <article className="rounded-3xl border border-orange-100 bg-orange-50/50 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-black text-orange-950">
              {category.name}
            </h3>
            <StatusBadge isActive={category.isActive} />
          </div>
          <p className="mt-1 text-xs font-black uppercase tracking-[0.16em] text-orange-700">
            {CATEGORY_TYPE_COPY[category.type].label} · ordem {category.displayOrder}
          </p>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            {category.description ?? "Sem descrição cadastrada."}
          </p>
        </div>
        <form action={toggleFormAction}>
          <input name="id" type="hidden" value={category.id} />
          <ToggleButton isActive={category.isActive} />
        </form>
      </div>

      <ActionFeedback state={toggleState} />

      <form action={editFormAction} className="mt-4 grid gap-3">
        <input name="id" type="hidden" value={category.id} />
        <FieldError errors={editFieldErrors.id} id={`${cardId}-id-error`} />
        <TextField
          errors={editFieldErrors.name}
          id={`${cardId}-name`}
          label="Nome"
          name="name"
          placeholder="Nome da categoria"
          value={editState.values?.name ?? category.name}
        />
        <TextField
          errors={editFieldErrors.displayOrder}
          id={`${cardId}-display-order`}
          inputMode="numeric"
          label="Ordem de exibição"
          name="displayOrder"
          placeholder="0"
          type="number"
          value={
            editState.values?.displayOrder ?? String(category.displayOrder)
          }
        />
        <TextareaField
          errors={editFieldErrors.description}
          id={`${cardId}-description`}
          label="Descrição opcional"
          name="description"
          placeholder="Descrição da categoria"
          value={editState.values?.description ?? category.description ?? ""}
        />
        <ActionFeedback state={editState} />
        <SubmitButton label="Salvar edição" pendingLabel="Salvando..." />
      </form>
    </article>
  );
}

function TextField({
  errors,
  id,
  inputMode,
  label,
  name,
  placeholder,
  type = "text",
  value,
}: {
  errors?: string[];
  id: string;
  inputMode?: "numeric";
  label: string;
  name: string;
  placeholder: string;
  type?: "number" | "text";
  value?: string;
}) {
  const errorId = `${id}-error`;
  const hasErrors = Boolean(errors?.length);

  return (
    <label className="grid gap-2 text-sm font-bold text-slate-800" htmlFor={id}>
      {label}
      <input
        aria-describedby={hasErrors ? errorId : undefined}
        aria-invalid={hasErrors || undefined}
        className="rounded-2xl border border-orange-100 bg-white px-4 py-3 text-base text-slate-950 outline-none transition focus:border-orange-400 focus:ring-4 focus:ring-orange-100"
        defaultValue={value ?? ""}
        id={id}
        inputMode={inputMode}
        min={type === "number" ? 0 : undefined}
        name={name}
        placeholder={placeholder}
        type={type}
      />
      <FieldError errors={errors} id={errorId} />
    </label>
  );
}

function SelectField({
  errors,
  id,
  label,
  name,
  value,
}: {
  errors?: string[];
  id: string;
  label: string;
  name: string;
  value: AdminCategoryType;
}) {
  const errorId = `${id}-error`;
  const hasErrors = Boolean(errors?.length);

  return (
    <label className="grid gap-2 text-sm font-bold text-slate-800" htmlFor={id}>
      {label}
      <select
        aria-describedby={hasErrors ? errorId : undefined}
        aria-invalid={hasErrors || undefined}
        className="rounded-2xl border border-orange-100 bg-white px-4 py-3 text-base text-slate-950 outline-none transition focus:border-orange-400 focus:ring-4 focus:ring-orange-100"
        defaultValue={value}
        id={id}
        name={name}
      >
        {CATEGORY_TYPES.map((type) => (
          <option key={type} value={type}>
            {CATEGORY_TYPE_COPY[type].label}
          </option>
        ))}
      </select>
      <FieldError errors={errors} id={errorId} />
    </label>
  );
}

function TextareaField({
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
  name: string;
  placeholder: string;
  value?: string;
}) {
  const errorId = `${id}-error`;
  const hasErrors = Boolean(errors?.length);

  return (
    <label className="grid gap-2 text-sm font-bold text-slate-800" htmlFor={id}>
      {label}
      <textarea
        aria-describedby={hasErrors ? errorId : undefined}
        aria-invalid={hasErrors || undefined}
        className="min-h-28 rounded-2xl border border-orange-100 bg-white px-4 py-3 text-base text-slate-950 outline-none transition focus:border-orange-400 focus:ring-4 focus:ring-orange-100"
        defaultValue={value ?? ""}
        id={id}
        maxLength={500}
        name={name}
        placeholder={placeholder}
      />
      <FieldError errors={errors} id={errorId} />
    </label>
  );
}

function FieldError({ errors, id }: { errors?: string[]; id: string }) {
  if (!errors?.length) {
    return null;
  }

  return (
    <span className="text-xs font-bold text-rose-700" id={id}>
      {errors[0]}
    </span>
  );
}

function ActionFeedback({ state }: { state: AdminActionState }) {
  if (state.status === "idle") {
    return null;
  }

  const isError = state.status === "error";

  return (
    <div
      aria-live={isError ? "assertive" : "polite"}
      className={[
        "mt-4 rounded-2xl border px-4 py-3 text-sm font-semibold",
        isError
          ? "border-rose-200 bg-rose-50 text-rose-950"
          : "border-lime-200 bg-lime-50 text-lime-950",
      ].join(" ")}
      role={isError ? "alert" : "status"}
    >
      {state.message ??
        (isError
          ? "Não foi possível concluir a operação."
          : "Operação concluída com sucesso.")}
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

function SubmitButton({
  label,
  pendingLabel,
}: {
  label: string;
  pendingLabel: string;
}) {
  const { pending } = useFormStatus();

  return (
    <button
      className="rounded-2xl bg-orange-600 px-5 py-3 text-sm font-black uppercase tracking-[0.18em] text-white shadow-xl shadow-orange-600/20 transition hover:bg-orange-700 focus:outline-none focus:ring-4 focus:ring-orange-100 disabled:cursor-not-allowed disabled:opacity-65"
      disabled={pending}
      type="submit"
    >
      {pending ? pendingLabel : label}
    </button>
  );
}

function ToggleButton({ isActive }: { isActive: boolean }) {
  const { pending } = useFormStatus();

  return (
    <button
      className="rounded-full border border-orange-200 bg-white px-4 py-2 text-xs font-black uppercase tracking-[0.16em] text-orange-950 transition hover:border-orange-400 hover:bg-orange-50 focus:outline-none focus:ring-4 focus:ring-orange-100 disabled:cursor-not-allowed disabled:opacity-65"
      disabled={pending}
      type="submit"
    >
      {pending ? "Alterando..." : isActive ? "Inativar" : "Reativar"}
    </button>
  );
}

function StatusBadge({ isActive }: { isActive: boolean }) {
  return (
    <span
      className={[
        "inline-flex rounded-full border px-3 py-1 text-xs font-black uppercase tracking-[0.14em]",
        isActive
          ? "border-lime-200 bg-lime-100 text-lime-950"
          : "border-slate-200 bg-slate-100 text-slate-700",
      ].join(" ")}
    >
      {isActive ? "Ativa" : "Inativa"}
    </span>
  );
}
