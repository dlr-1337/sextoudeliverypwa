"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { updateMerchantProfileAction } from "@/modules/merchant/actions";
import { MERCHANT_ACTION_IDLE_STATE } from "@/modules/merchant/action-state";
import type { MerchantActionState } from "@/modules/merchant/action-state";
import type {
  MerchantCategoryDto,
  MerchantEstablishmentDto,
} from "@/modules/merchant/service-core";

type ProfileFormProps = {
  categories?: MerchantCategoryDto[];
  disabled?: boolean;
  establishment: MerchantEstablishmentDto;
};

export function ProfileForm({
  categories = [],
  disabled = false,
  establishment,
}: ProfileFormProps) {
  const [state, formAction] = useActionState(
    updateMerchantProfileAction,
    MERCHANT_ACTION_IDLE_STATE,
  );
  const fieldErrors = state.fieldErrors ?? {};
  const canSubmit = !disabled && establishment.status === "ACTIVE";

  return (
    <section className="rounded-[1.75rem] border border-orange-100 bg-white p-5 shadow-sm shadow-orange-950/5">
      <div className="grid gap-4 lg:grid-cols-[1fr_0.75fr] lg:items-start">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.28em] text-orange-700">
            Perfil operacional
          </p>
          <h2 className="mt-2 text-2xl font-black tracking-[-0.04em] text-orange-950">
            Dados básicos da loja
          </h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Edite apenas dados operacionais. Identificador, dono, status, slug e
            logo continuam definidos no servidor pela sessão autenticada.
          </p>
        </div>

        <div className="rounded-3xl border border-orange-100 bg-orange-50/70 p-4 text-sm font-semibold leading-6 text-orange-950">
          <p>
            <span className="font-black">Slug:</span> {establishment.slug}
          </p>
          <p>
            <span className="font-black">Status:</span> {statusLabel(establishment.status)}
          </p>
        </div>
      </div>

      <ActionFeedback state={state} />

      {!canSubmit ? (
        <p
          className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold leading-6 text-amber-950"
          role="status"
        >
          Este perfil só pode ser editado quando o estabelecimento está ativo.
        </p>
      ) : null}

      <form action={formAction} className="mt-5 grid gap-4 lg:grid-cols-2">
        <TextField
          errors={fieldErrors.name}
          id="merchant-profile-name"
          label="Nome da loja"
          name="name"
          placeholder="Ex.: Sextou Bar"
          required
          value={state.values?.name ?? establishment.name}
        />
        <CategoryField
          categories={categories}
          errors={fieldErrors.categoryId}
          id="merchant-profile-category"
          value={state.values?.categoryId ?? establishment.categoryId ?? ""}
        />
        <TextField
          errors={fieldErrors.phone}
          id="merchant-profile-phone"
          inputMode="tel"
          label="Telefone"
          name="phone"
          placeholder="1133334444"
          value={state.values?.phone ?? establishment.phone ?? ""}
        />
        <TextField
          errors={fieldErrors.whatsapp}
          id="merchant-profile-whatsapp"
          inputMode="tel"
          label="WhatsApp"
          name="whatsapp"
          placeholder="11999999999"
          value={state.values?.whatsapp ?? establishment.whatsapp ?? ""}
        />
        <TextField
          errors={fieldErrors.addressLine1}
          id="merchant-profile-address-line-1"
          label="Endereço"
          name="addressLine1"
          placeholder="Rua, número e bairro"
          value={state.values?.addressLine1 ?? establishment.addressLine1 ?? ""}
        />
        <TextField
          errors={fieldErrors.addressLine2}
          id="merchant-profile-address-line-2"
          label="Complemento"
          name="addressLine2"
          placeholder="Sala, referência ou complemento"
          value={state.values?.addressLine2 ?? establishment.addressLine2 ?? ""}
        />
        <TextField
          errors={fieldErrors.city}
          id="merchant-profile-city"
          label="Cidade"
          name="city"
          placeholder="São Paulo"
          value={state.values?.city ?? establishment.city ?? ""}
        />
        <TextField
          errors={fieldErrors.state}
          id="merchant-profile-state"
          label="Estado"
          name="state"
          placeholder="SP"
          value={state.values?.state ?? establishment.state ?? ""}
        />
        <TextField
          errors={fieldErrors.postalCode}
          id="merchant-profile-postal-code"
          inputMode="numeric"
          label="CEP"
          name="postalCode"
          placeholder="01000-000"
          value={state.values?.postalCode ?? establishment.postalCode ?? ""}
        />
        <TextField
          errors={fieldErrors.deliveryFee}
          id="merchant-profile-delivery-fee"
          inputMode="decimal"
          label="Taxa de entrega"
          name="deliveryFee"
          placeholder="7,50"
          value={state.values?.deliveryFee ?? establishment.deliveryFee}
        />
        <TextField
          errors={fieldErrors.minimumOrder}
          id="merchant-profile-minimum-order"
          inputMode="decimal"
          label="Pedido mínimo"
          name="minimumOrder"
          placeholder="20,00"
          value={state.values?.minimumOrder ?? establishment.minimumOrder}
        />
        <TextareaField
          errors={fieldErrors.description}
          id="merchant-profile-description"
          label="Descrição"
          name="description"
          placeholder="Conte aos clientes o que sua loja oferece."
          value={state.values?.description ?? establishment.description ?? ""}
        />
        <div className="lg:col-span-2">
          <SubmitButton disabled={!canSubmit} />
        </div>
      </form>
    </section>
  );
}

function TextField({
  errors,
  id,
  inputMode,
  label,
  name,
  placeholder,
  required = false,
  value,
}: {
  errors?: string[];
  id: string;
  inputMode?: "decimal" | "numeric" | "tel";
  label: string;
  name: string;
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
        className="rounded-2xl border border-orange-100 bg-white px-4 py-3 text-base text-slate-950 outline-none transition focus:border-orange-400 focus:ring-4 focus:ring-orange-100"
        defaultValue={value}
        id={id}
        inputMode={inputMode}
        name={name}
        placeholder={placeholder}
        required={required}
        type="text"
      />
      <FieldError errors={errors} id={errorId} />
    </label>
  );
}

function CategoryField({
  categories,
  errors,
  id,
  value,
}: {
  categories: MerchantCategoryDto[];
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
        className="rounded-2xl border border-orange-100 bg-white px-4 py-3 text-base text-slate-950 outline-none transition focus:border-orange-400 focus:ring-4 focus:ring-orange-100"
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
        className="min-h-28 rounded-2xl border border-orange-100 bg-white px-4 py-3 text-base text-slate-950 outline-none transition focus:border-orange-400 focus:ring-4 focus:ring-orange-100"
        defaultValue={value}
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

function ActionFeedback({ state }: { state: MerchantActionState }) {
  if (state.status === "idle") {
    return null;
  }

  const isError = state.status === "error";

  return (
    <div
      aria-live={isError ? "assertive" : "polite"}
      className={[
        "mt-4 rounded-2xl border px-4 py-3 text-sm font-semibold leading-6",
        isError
          ? "border-rose-200 bg-rose-50 text-rose-950"
          : "border-lime-200 bg-lime-50 text-lime-950",
      ].join(" ")}
      role={isError ? "alert" : "status"}
    >
      {state.message ??
        (isError
          ? "Não foi possível salvar o perfil."
          : "Perfil salvo com sucesso.")}
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

function SubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();

  return (
    <button
      className="rounded-2xl bg-orange-600 px-5 py-3 text-sm font-black uppercase tracking-[0.18em] text-white shadow-xl shadow-orange-600/20 transition hover:bg-orange-700 focus:outline-none focus:ring-4 focus:ring-orange-100 disabled:cursor-not-allowed disabled:opacity-65"
      disabled={disabled || pending}
      type="submit"
    >
      {pending ? "Salvando..." : "Salvar perfil"}
    </button>
  );
}

function statusLabel(status: MerchantEstablishmentDto["status"]) {
  switch (status) {
    case "ACTIVE":
      return "Ativo";
    case "PENDING":
      return "Pendente";
    case "BLOCKED":
      return "Bloqueado";
    case "INACTIVE":
      return "Inativo";
    default:
      return status;
  }
}
