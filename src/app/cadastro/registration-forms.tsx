"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import {
  registerCustomerAction,
  registerMerchantAction,
  type AuthFormState,
} from "@/modules/auth/actions";

const initialState: AuthFormState = { status: "idle" };

export function RegistrationForms() {
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <CustomerRegistrationForm />
      <MerchantRegistrationForm />
    </div>
  );
}

function CustomerRegistrationForm() {
  const [state, formAction] = useActionState(
    registerCustomerAction,
    initialState,
  );
  const fieldErrors = state.fieldErrors ?? {};

  return (
    <AuthCard
      eyebrow="Consumidor"
      description="Crie uma conta para acompanhar pedidos e acessar sua área pessoal."
      state={state}
      title="Quero pedir pelo Sextou"
    >
      <form action={formAction} className="mt-6 grid gap-4">
        <TextField
          autoComplete="name"
          errors={fieldErrors.name}
          label="Nome"
          name="name"
          placeholder="Maria Cliente"
          value={state.values?.name}
        />
        <TextField
          autoComplete="email"
          errors={fieldErrors.email}
          label="E-mail"
          name="email"
          placeholder="cliente@exemplo.com"
          type="email"
          value={state.values?.email}
        />
        <TextField
          autoComplete="tel"
          errors={fieldErrors.phone}
          label="Telefone (opcional)"
          name="phone"
          placeholder="(11) 99999-9999"
          value={state.values?.phone}
        />
        <TextField
          autoComplete="new-password"
          errors={fieldErrors.password}
          label="Senha"
          name="password"
          placeholder="Mínimo de 8 caracteres"
          type="password"
        />
        <SubmitButton label="Criar conta de consumidor" pendingLabel="Criando conta..." />
      </form>
    </AuthCard>
  );
}

function MerchantRegistrationForm() {
  const [state, formAction] = useActionState(
    registerMerchantAction,
    initialState,
  );
  const fieldErrors = state.fieldErrors ?? {};

  return (
    <AuthCard
      eyebrow="Estabelecimento"
      description="Cadastre o responsável e crie uma loja pendente de aprovação."
      state={state}
      title="Quero vender no Sextou"
    >
      <form action={formAction} className="mt-6 grid gap-4">
        <TextField
          autoComplete="name"
          errors={fieldErrors.name}
          label="Nome do responsável"
          name="name"
          placeholder="João Comerciante"
          value={state.values?.name}
        />
        <TextField
          autoComplete="email"
          errors={fieldErrors.email}
          label="E-mail"
          name="email"
          placeholder="loja@exemplo.com"
          type="email"
          value={state.values?.email}
        />
        <TextField
          autoComplete="tel"
          errors={fieldErrors.phone}
          label="Telefone do responsável (opcional)"
          name="phone"
          placeholder="(11) 98888-7777"
          value={state.values?.phone}
        />
        <TextField
          errors={fieldErrors.establishmentName}
          label="Nome do estabelecimento"
          name="establishmentName"
          placeholder="Sextou Bar"
          value={state.values?.establishmentName}
        />
        <TextField
          autoComplete="tel"
          errors={fieldErrors.establishmentPhone}
          label="Telefone da loja (opcional)"
          name="establishmentPhone"
          placeholder="(11) 3333-4444"
          value={state.values?.establishmentPhone}
        />
        <TextField
          autoComplete="new-password"
          errors={fieldErrors.password}
          label="Senha"
          name="password"
          placeholder="Mínimo de 8 caracteres"
          type="password"
        />
        <SubmitButton label="Cadastrar estabelecimento" pendingLabel="Cadastrando..." />
      </form>
    </AuthCard>
  );
}

function AuthCard({
  children,
  description,
  eyebrow,
  state,
  title,
}: {
  children: React.ReactNode;
  description: string;
  eyebrow: string;
  state: AuthFormState;
  title: string;
}) {
  return (
    <section className="rounded-[2rem] border border-orange-200/75 bg-white/90 p-5 shadow-2xl shadow-orange-950/10 backdrop-blur sm:p-7">
      <p className="text-xs font-black uppercase tracking-[0.28em] text-orange-700">
        {eyebrow}
      </p>
      <h2 className="mt-2 text-2xl font-black tracking-[-0.04em] text-orange-950 sm:text-3xl">
        {title}
      </h2>
      <p className="mt-3 text-sm leading-6 text-slate-600">{description}</p>

      {state.status === "error" ? (
        <div
          className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-950"
          role="alert"
        >
          {state.message ?? "Não foi possível concluir o cadastro."}
        </div>
      ) : null}

      {children}
    </section>
  );
}

function TextField({
  autoComplete,
  errors,
  label,
  name,
  placeholder,
  type = "text",
  value,
}: {
  autoComplete?: string;
  errors?: string[];
  label: string;
  name: string;
  placeholder: string;
  type?: "email" | "password" | "text";
  value?: string;
}) {
  return (
    <label className="grid gap-2 text-sm font-bold text-slate-800">
      {label}
      <input
        autoComplete={autoComplete}
        className="rounded-2xl border border-orange-100 bg-orange-50/60 px-4 py-3 text-base text-slate-950 outline-none transition focus:border-orange-400 focus:bg-white focus:ring-4 focus:ring-orange-100"
        defaultValue={type === "password" ? undefined : value ?? ""}
        name={name}
        placeholder={placeholder}
        type={type}
      />
      <FieldError errors={errors} />
    </label>
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
      className="rounded-2xl bg-orange-600 px-5 py-3 text-sm font-black uppercase tracking-[0.18em] text-white shadow-xl shadow-orange-600/25 transition hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-65"
      disabled={pending}
      type="submit"
    >
      {pending ? pendingLabel : label}
    </button>
  );
}

function FieldError({ errors }: { errors?: string[] }) {
  if (!errors?.length) {
    return null;
  }

  return <span className="text-xs font-bold text-rose-700">{errors[0]}</span>;
}

export function RegistrationFooter() {
  return (
    <p className="text-center text-sm text-slate-600">
      Já tem conta?{" "}
      <Link className="font-black text-orange-700 underline-offset-4 hover:underline" href="/login">
        Entrar no Sextou
      </Link>
    </p>
  );
}
