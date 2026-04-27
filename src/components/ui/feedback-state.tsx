import type { ReactNode } from "react";

type FeedbackTone = "loading" | "error" | "empty";

type FeedbackStateProps = {
  tone: FeedbackTone;
  title: string;
  description: string;
  action?: ReactNode;
};

const toneCopy: Record<FeedbackTone, { eyebrow: string; classes: string }> = {
  loading: {
    eyebrow: "Carregando",
    classes: "border-amber-200/80 bg-amber-50/85 text-amber-950",
  },
  error: {
    eyebrow: "Atenção",
    classes: "border-rose-200/80 bg-rose-50/85 text-rose-950",
  },
  empty: {
    eyebrow: "Sem registros",
    classes: "border-slate-200/80 bg-white/85 text-slate-950",
  },
};

export function FeedbackState({
  tone,
  title,
  description,
  action,
}: FeedbackStateProps) {
  const toneSettings = toneCopy[tone];

  return (
    <section
      aria-live={tone === "loading" ? "polite" : undefined}
      className={[
        "rounded-3xl border p-5 shadow-sm shadow-slate-950/5 backdrop-blur",
        toneSettings.classes,
      ].join(" ")}
    >
      <p className="text-xs font-black uppercase tracking-[0.28em] opacity-70">
        {toneSettings.eyebrow}
      </p>
      <h3 className="mt-3 text-lg font-black tracking-tight">{title}</h3>
      <p className="mt-2 text-sm leading-6 opacity-75">{description}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </section>
  );
}
