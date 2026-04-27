"use client";

import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";
import { useRouter } from "next/navigation";

import type { ProductStatusValue } from "@/modules/products/service-core";

import {
  canUploadProductPhotoForStatus,
  getProductActionLabel,
} from "./product-copy";

type ProductPhotoUploadFormProps = {
  disabled?: boolean;
  product: {
    id: string;
    imageUrl: string | null;
    name: string;
    status: ProductStatusValue;
  };
};

type ProductPhotoUploadFeedback = {
  message: string;
  tone: "error" | "success";
};

type ProductPhotoUploadResponse = {
  ok?: boolean;
  code?: string;
  message?: string;
  data?: {
    imageUrl?: string;
  };
};

const MALFORMED_UPLOAD_RESPONSE_MESSAGE =
  "Não foi possível confirmar o envio da foto. Tente novamente.";

export function ProductPhotoUploadForm({
  disabled = false,
  product,
}: ProductPhotoUploadFormProps) {
  const router = useRouter();
  const [feedback, setFeedback] = useState<ProductPhotoUploadFeedback | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [previewUrl, setPreviewUrl] = useState(product.imageUrl);
  const objectUrlRef = useRef<string | null>(null);
  const canSubmit =
    !disabled && canUploadProductPhotoForStatus(product.status);

  useEffect(() => {
    if (!objectUrlRef.current) {
      setPreviewUrl(product.imageUrl);
    }
  }, [product.imageUrl]);

  useEffect(() => {
    return () => revokeObjectPreview(objectUrlRef);
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canSubmit || isPending) {
      return;
    }

    const form = event.currentTarget;

    setFeedback(null);
    setIsPending(true);

    try {
      const response = await fetch(
        `/api/estabelecimento/produtos/${encodeURIComponent(product.id)}/foto`,
        {
          body: new FormData(form),
          method: "POST",
        },
      );
      const payload = await readProductPhotoUploadResponse(response);

      if (!response.ok || payload?.ok !== true) {
        setFeedback({
          message:
            payload?.message ??
            MALFORMED_UPLOAD_RESPONSE_MESSAGE,
          tone: "error",
        });
        return;
      }

      form.reset();
      revokeObjectPreview(objectUrlRef);
      setPreviewUrl(payload.data?.imageUrl ?? product.imageUrl);
      setFeedback({
        message: payload.message ?? "Foto do produto atualizada com sucesso.",
        tone: "success",
      });
      router.refresh();
    } catch {
      setFeedback({
        message:
          "Não foi possível enviar a foto. Verifique sua conexão e tente novamente.",
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
      setPreviewUrl(product.imageUrl);
      return;
    }

    try {
      const objectUrl = URL.createObjectURL(file);
      objectUrlRef.current = objectUrl;
      setPreviewUrl(objectUrl);
      setFeedback(null);
    } catch {
      setPreviewUrl(product.imageUrl);
      setFeedback({
        message:
          "Não foi possível gerar a prévia da foto. Escolha outro arquivo e tente novamente.",
        tone: "error",
      });
    }
  }

  function handlePreviewError() {
    revokeObjectPreview(objectUrlRef);
    setPreviewUrl(null);
    setFeedback({
      message:
        "Não foi possível carregar a prévia da foto. Escolha outro arquivo e tente novamente.",
      tone: "error",
    });
  }

  return (
    <section className="rounded-3xl border border-slate-200/80 bg-white/90 p-4 shadow-sm shadow-slate-950/5">
      <div className="grid gap-4 sm:grid-cols-[0.8fr_1fr] sm:items-start">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.24em] text-slate-500">
            Foto
          </p>
          <h3 className="mt-1 text-lg font-black text-orange-950">
            Foto do produto
          </h3>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            Envie PNG, JPG ou WebP. A rota usa o produto da URL e a sessão
            merchant para validar a loja antes de salvar.
          </p>
        </div>

        <ProductPhotoPreview
          name={product.name}
          onError={handlePreviewError}
          previewUrl={previewUrl}
        />
      </div>

      <ProductPhotoUploadFeedback feedback={feedback} />

      {!canSubmit ? (
        <p
          className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold leading-6 text-amber-950"
          role="status"
        >
          A foto só pode ser alterada quando a loja e o produto estão ativos.
        </p>
      ) : null}

      <form className="mt-4 grid gap-4" onSubmit={handleSubmit}>
        <label className="grid gap-2 text-sm font-bold text-slate-800" htmlFor={`product-photo-${toDomId(product.id)}`}>
          Arquivo da foto
          <input
            accept="image/png,image/jpeg,image/webp"
            className="rounded-2xl border border-orange-100 bg-white px-4 py-3 text-base text-slate-950 file:mr-4 file:rounded-xl file:border-0 file:bg-orange-100 file:px-4 file:py-2 file:text-sm file:font-black file:text-orange-900 focus:outline-none focus:ring-4 focus:ring-orange-100 disabled:cursor-not-allowed disabled:opacity-65"
            disabled={!canSubmit || isPending}
            id={`product-photo-${toDomId(product.id)}`}
            name="photo"
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
          {getProductActionLabel("photo", isPending)}
        </button>
      </form>
    </section>
  );
}

function ProductPhotoPreview({
  name,
  onError,
  previewUrl,
}: {
  name: string;
  onError: () => void;
  previewUrl: string | null;
}) {
  return (
    <div className="rounded-3xl border border-orange-100 bg-orange-50/70 p-4">
      <p className="text-xs font-black uppercase tracking-[0.2em] text-orange-700">
        Prévia
      </p>
      <div className="mt-3 grid h-36 place-items-center overflow-hidden rounded-2xl border border-white/80 bg-white shadow-inner shadow-orange-950/5">
        {previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- Upload previews may be blob URLs and are constrained with object-cover.
          <img
            alt={`Foto de ${name}`}
            className="h-full w-full object-cover"
            onError={onError}
            src={previewUrl}
          />
        ) : (
          <div className="grid size-20 place-items-center rounded-3xl bg-orange-100 text-2xl font-black text-orange-900">
            {name.slice(0, 1).toUpperCase() || "P"}
          </div>
        )}
      </div>
    </div>
  );
}

function ProductPhotoUploadFeedback({
  feedback,
}: {
  feedback: ProductPhotoUploadFeedback | null;
}) {
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

async function readProductPhotoUploadResponse(response: Response) {
  try {
    const payload: unknown = await response.json();

    return isProductPhotoUploadResponse(payload) ? payload : null;
  } catch {
    return null;
  }
}

function isProductPhotoUploadResponse(
  value: unknown,
): value is ProductPhotoUploadResponse {
  return typeof value === "object" && value !== null;
}

function revokeObjectPreview(ref: { current: string | null }) {
  if (ref.current) {
    URL.revokeObjectURL(ref.current);
    ref.current = null;
  }
}

function toDomId(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]/g, "-") || "product";
}
