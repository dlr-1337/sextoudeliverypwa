"use client";

import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import type { MerchantEstablishmentDto } from "@/modules/merchant/service-core";

type LogoUploadFormProps = {
  disabled?: boolean;
  establishment: Pick<
    MerchantEstablishmentDto,
    "id" | "logoUrl" | "name" | "status"
  >;
};

type LogoUploadFeedback = {
  message: string;
  tone: "error" | "success";
};

type LogoUploadResponse = {
  ok?: boolean;
  code?: string;
  message?: string;
  data?: {
    logoUrl?: string;
  };
};

export function LogoUploadForm({
  disabled = false,
  establishment,
}: LogoUploadFormProps) {
  const router = useRouter();
  const [feedback, setFeedback] = useState<LogoUploadFeedback | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [previewUrl, setPreviewUrl] = useState(establishment.logoUrl);
  const objectUrlRef = useRef<string | null>(null);
  const canSubmit = !disabled && establishment.status === "ACTIVE";

  useEffect(() => {
    if (!objectUrlRef.current) {
      setPreviewUrl(establishment.logoUrl);
    }
  }, [establishment.logoUrl]);

  useEffect(() => {
    return () => revokeObjectPreview(objectUrlRef);
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canSubmit || isPending) {
      return;
    }

    setFeedback(null);
    setIsPending(true);

    try {
      const response = await fetch("/api/estabelecimento/logo", {
        body: new FormData(event.currentTarget),
        method: "POST",
      });
      const payload = await readLogoUploadResponse(response);

      if (!response.ok || payload?.ok !== true) {
        setFeedback({
          message:
            payload?.message ??
            "Não foi possível enviar o logo. Tente novamente.",
          tone: "error",
        });
        return;
      }

      event.currentTarget.reset();
      revokeObjectPreview(objectUrlRef);
      setPreviewUrl(payload.data?.logoUrl ?? establishment.logoUrl);
      setFeedback({
        message: payload.message ?? "Logo atualizado com sucesso.",
        tone: "success",
      });
      router.refresh();
    } catch {
      setFeedback({
        message: "Não foi possível enviar o logo. Verifique sua conexão e tente novamente.",
        tone: "error",
      });
    } finally {
      setIsPending(false);
    }
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];

    revokeObjectPreview(objectUrlRef);

    if (!file) {
      setPreviewUrl(establishment.logoUrl);
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    objectUrlRef.current = objectUrl;
    setPreviewUrl(objectUrl);
    setFeedback(null);
  }

  return (
    <section className="rounded-[1.75rem] border border-orange-100 bg-white p-5 shadow-sm shadow-orange-950/5">
      <div className="grid gap-5 lg:grid-cols-[0.78fr_1fr] lg:items-start">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.28em] text-orange-700">
            Identidade visual
          </p>
          <h2 className="mt-2 text-2xl font-black tracking-[-0.04em] text-orange-950">
            Logo do estabelecimento
          </h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Envie uma imagem PNG, JPG ou WebP. O servidor valida o conteúdo do
            arquivo e salva o logo apenas para a loja da sessão atual.
          </p>
        </div>

        <LogoPreview name={establishment.name} previewUrl={previewUrl} />
      </div>

      <UploadFeedback feedback={feedback} />

      {!canSubmit ? (
        <p
          className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold leading-6 text-amber-950"
          role="status"
        >
          O logo só pode ser alterado quando o estabelecimento está ativo.
        </p>
      ) : null}

      <form className="mt-5 grid gap-4" onSubmit={handleSubmit}>
        <label className="grid gap-2 text-sm font-bold text-slate-800" htmlFor="merchant-logo-file">
          Arquivo do logo
          <input
            accept="image/png,image/jpeg,image/webp"
            className="rounded-2xl border border-orange-100 bg-white px-4 py-3 text-base text-slate-950 file:mr-4 file:rounded-xl file:border-0 file:bg-orange-100 file:px-4 file:py-2 file:text-sm file:font-black file:text-orange-900 focus:outline-none focus:ring-4 focus:ring-orange-100 disabled:cursor-not-allowed disabled:opacity-65"
            disabled={!canSubmit || isPending}
            id="merchant-logo-file"
            name="logo"
            onChange={handleFileChange}
            required
            type="file"
          />
        </label>

        <button
          className="w-fit rounded-2xl bg-orange-600 px-5 py-3 text-sm font-black uppercase tracking-[0.18em] text-white shadow-xl shadow-orange-600/20 transition hover:bg-orange-700 focus:outline-none focus:ring-4 focus:ring-orange-100 disabled:cursor-not-allowed disabled:opacity-65"
          disabled={!canSubmit || isPending}
          type="submit"
        >
          {isPending ? "Enviando..." : "Enviar logo"}
        </button>
      </form>
    </section>
  );
}

function LogoPreview({ name, previewUrl }: { name: string; previewUrl: string | null }) {
  return (
    <div className="rounded-3xl border border-orange-100 bg-orange-50/70 p-4">
      <p className="text-xs font-black uppercase tracking-[0.2em] text-orange-700">
        Prévia
      </p>
      <div className="mt-3 grid h-40 place-items-center overflow-hidden rounded-2xl border border-white/80 bg-white shadow-inner shadow-orange-950/5">
        {previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- Upload previews may be blob URLs and are constrained with object-contain.
          <img
            alt={`Logo de ${name}`}
            className="h-full w-full object-contain p-3"
            src={previewUrl}
          />
        ) : (
          <div className="grid size-24 place-items-center rounded-full bg-orange-100 text-3xl font-black text-orange-900">
            {name.slice(0, 1).toUpperCase() || "S"}
          </div>
        )}
      </div>
    </div>
  );
}

function UploadFeedback({ feedback }: { feedback: LogoUploadFeedback | null }) {
  if (!feedback) {
    return null;
  }

  const isError = feedback.tone === "error";

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
      {feedback.message}
    </div>
  );
}

async function readLogoUploadResponse(response: Response) {
  try {
    const payload: unknown = await response.json();

    return isLogoUploadResponse(payload) ? payload : null;
  } catch {
    return null;
  }
}

function isLogoUploadResponse(value: unknown): value is LogoUploadResponse {
  return typeof value === "object" && value !== null;
}

function revokeObjectPreview(ref: { current: string | null }) {
  if (ref.current) {
    URL.revokeObjectURL(ref.current);
    ref.current = null;
  }
}
