export const MERCHANT_PROFILE_FIELD_NAMES = [
  "name",
  "categoryId",
  "description",
  "phone",
  "whatsapp",
  "addressLine1",
  "addressLine2",
  "city",
  "state",
  "postalCode",
  "deliveryFee",
  "minimumOrder",
] as const;

export type MerchantProfileFieldName =
  (typeof MERCHANT_PROFILE_FIELD_NAMES)[number];

export type MerchantActionStatus = "idle" | "success" | "error";

export type MerchantActionFieldErrors = Partial<
  Record<MerchantProfileFieldName | string, string[]>
>;

export type MerchantActionValues = Partial<
  Record<MerchantProfileFieldName, string>
>;

export type MerchantActionState = {
  status: MerchantActionStatus;
  message?: string;
  fieldErrors?: MerchantActionFieldErrors;
  formErrors?: string[];
  values?: MerchantActionValues;
  merchantId?: string;
  establishmentId?: string;
};

export type MerchantActionHandler = (
  previousState: MerchantActionState,
  formData: FormData,
) => Promise<MerchantActionState>;

export const MERCHANT_ACTION_IDLE_STATE = {
  status: "idle",
} as const satisfies MerchantActionState;
