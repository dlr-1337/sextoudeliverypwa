"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { loginAction, type AuthFormState } from "@/modules/auth/actions";

type LoginFormProps = {
  nextPath?: string;
};

const initialState: AuthFormState = { status: "idle" };

export function LoginForm({ nextPath }: LoginFormProps) {
  const [state, formAction] = useActionState(loginAction, initialState);
  const fieldErrors = state.fieldErrors ?? {};

  return (
    <form
      action={formAction}
      className="rounded-[2rem] border border-orange-200/75 bg-white/90 p-5 shadow-2xl shadow-orange-950/10 backdrop-blur sm:p-7"
    >
      <input name="next" type="hidden" value={nextPath ?? ""} />
      <div className="space-y-2">
        <p className="text-xs font-black uppercase tracking-[0.28em] text-orange-700">
          Entrar
        </p>
        <h1 className="text-3xl font-black tracking-[-0.04em] text-orange-950 sm:text-4xl">
          Acesse sua área no Sextou.
        </h1>
        <p className="text-sm leading-6 text-slate-600">
          Use o e-mail e senha cadastrados. A rota correta será liberada no
          servidor conforme o perfil da conta.
        </p>
      </div>

      {state.status === "error" ? (
        <div
          className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-950"
          role="alert"
        >
          {state.message ?? "Não foi possível entrar. Revise os dados."}
        </div>
      ) : null}

      <div className="mt-6 grid gap-4">
        <label className="grid gap-2 text-sm font-bold text-slate-800">
          E-mail
          <input
            autoComplete="email"
            className="rounded-2xl border border-orange-100 bg-orange-50/60 px-4 py-3 text-base text-slate-950 outline-none transition focus:border-orange-400 focus:bg-white focus:ring-4 focus:ring-orange-100"
            defaultValue={state.values?.email ?? ""}
            name="email"
            placeholder="voce@exemplo.com"
            type="email"
          />
          <FieldError errors={fieldErrors.email} />
        </label>

        <label className="grid gap-2 text-sm font-bold text-slate-800">
          Senha
          <input
            autoComplete="current-password"
            className="rounded-2xl border border-orange-100 bg-orange-50/60 px-4 py-3 text-base text-slate-950 outline-none transition focus:border-orange-400 focus:bg-white focus:ring-4 focus:ring-orange-100"
            name="password"
            placeholder="Sua senha"
            type="password"
          />
          <FieldError errors={fieldErrors.password} />
        </label>
      </div>

      <SubmitButton />

      <p className="mt-5 text-center text-sm text-slate-600">
        Ainda não tem conta?{" "}
        <Link className="font-black text-orange-700 underline-offset-4 hover:underline" href="/cadastro">
          Cadastre-se
        </Link>
      </p>
    </form>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button
      className="mt-6 w-full rounded-2xl bg-orange-600 px-5 py-3 text-sm font-black uppercase tracking-[0.2em] text-white shadow-xl shadow-orange-600/25 transition hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-65"
      disabled={pending}
      type="submit"
    >
      {pending ? "Entrando..." : "Entrar com segurança"}
    </button>
  );
}

function FieldError({ errors }: { errors?: string[] }) {
  if (!errors?.length) {
    return null;
  }

  return <span className="text-xs font-bold text-rose-700">{errors[0]}</span>;
}
