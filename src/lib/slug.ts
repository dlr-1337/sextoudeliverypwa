const MULTIPLE_DASHES = /-+/g;
const NON_ALPHANUMERIC = /[^a-z0-9]+/g;
const DIACRITICS = /\p{Diacritic}/gu;

export function slugify(value: string, fallback = "sem-titulo") {
  const slug = value
    .normalize("NFD")
    .replace(DIACRITICS, "")
    .toLowerCase()
    .trim()
    .replace(/&/g, " e ")
    .replace(NON_ALPHANUMERIC, "-")
    .replace(MULTIPLE_DASHES, "-")
    .replace(/^-|-$/g, "");

  return slug || fallback;
}
