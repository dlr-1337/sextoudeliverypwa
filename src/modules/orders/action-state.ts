import type { CheckoutValidationErrors } from "./schemas";

export const CHECKOUT_ACTION_FIELD_NAMES = [
  "establishmentId",
  "customerName",
  "customerPhone",
  "deliveryStreet",
  "deliveryNumber",
  "deliveryComplement",
  "deliveryNeighborhood",
  "deliveryCity",
  "deliveryState",
  "deliveryPostalCode",
  "deliveryReference",
  "generalObservation",
  "paymentMethod",
] as const;

export const CHECKOUT_ACTION_ITEM_FIELD_NAMES = [
  "productId",
  "quantity",
] as const;

export type CheckoutActionFormFieldName =
  (typeof CHECKOUT_ACTION_FIELD_NAMES)[number];
export type CheckoutActionItemFieldName =
  (typeof CHECKOUT_ACTION_ITEM_FIELD_NAMES)[number];
export type CheckoutActionFieldErrors = CheckoutValidationErrors["fieldErrors"];
export type CheckoutActionItemValues = Partial<
  Record<CheckoutActionItemFieldName, string>
>;
export type CheckoutActionValues = Partial<
  Record<CheckoutActionFormFieldName, string>
> & {
  items?: CheckoutActionItemValues[];
};

export type CheckoutIdleActionState = {
  status: "idle";
};

export type CheckoutErrorActionState = {
  status: "error";
  message?: string;
  fieldErrors?: CheckoutActionFieldErrors;
  formErrors?: string[];
  values?: CheckoutActionValues;
};

export type CheckoutCreatedActionState = {
  status: "created";
  message: string;
  publicCode: string;
  redirectPath: string;
};

export type CheckoutActionState =
  | CheckoutIdleActionState
  | CheckoutErrorActionState
  | CheckoutCreatedActionState;

export type CheckoutActionHandler = (
  previousState: CheckoutActionState,
  formData: FormData,
) => Promise<CheckoutActionState>;

export const CHECKOUT_ACTION_IDLE_STATE = {
  status: "idle",
} as const satisfies CheckoutActionState;
