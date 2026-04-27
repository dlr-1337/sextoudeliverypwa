export type AdminActionStatus = "idle" | "success" | "error";

export type AdminActionFieldErrors = Record<string, string[]>;

export type AdminActionValues = Record<string, string>;

export type AdminActionState = {
  status: AdminActionStatus;
  message?: string;
  fieldErrors?: AdminActionFieldErrors;
  formErrors?: string[];
  values?: AdminActionValues;
  redirectTo?: string;
  detailId?: string;
  categoryId?: string;
  establishmentId?: string;
};

export type AdminActionHandler = (
  previousState: AdminActionState,
  formData: FormData,
) => Promise<AdminActionState>;

export const ADMIN_ACTION_IDLE_STATE = {
  status: "idle",
} as const satisfies AdminActionState;
