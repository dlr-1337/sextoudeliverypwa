export const PRODUCT_FORM_FIELD_NAMES = [
  "name",
  "description",
  "categoryId",
  "price",
] as const;

export type ProductFormFieldName = (typeof PRODUCT_FORM_FIELD_NAMES)[number];
export type ProductActionStatus = "idle" | "success" | "error";
export type ProductActionFieldErrors = Partial<
  Record<ProductFormFieldName | "productId" | string, string[]>
>;
export type ProductActionValues = Partial<
  Record<ProductFormFieldName | "productId", string>
>;

export type ProductActionState = {
  status: ProductActionStatus;
  message?: string;
  fieldErrors?: ProductActionFieldErrors;
  formErrors?: string[];
  values?: ProductActionValues;
  merchantId?: string;
  productId?: string;
  establishmentSlug?: string;
};

export type ProductActionHandler = (
  previousState: ProductActionState,
  formData: FormData,
) => Promise<ProductActionState>;

export const PRODUCT_ACTION_IDLE_STATE = {
  status: "idle",
} as const satisfies ProductActionState;
