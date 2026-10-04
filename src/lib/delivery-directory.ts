export const DIRECTORY_PAGE_SIZE = 12;

export type DeliveryArea = {
  id: string;
  name: string;
  slug: string | null;
  district: string | null;
  province: string | null;
  is_active: boolean;
};

export function directorySearch(value: string | string[] | undefined): string {
  // Keep PostgREST filter punctuation and wildcard operators out of user input.
  return (typeof value === "string" ? value : "")
    .normalize("NFC")
    .replace(/[^\p{L}\p{M}\p{N}\s-]/gu, "")
    .trim()
    .slice(0, 80);
}

export function directoryPage(value: string | string[] | undefined): number {
  if (typeof value !== "string" || !/^\d{1,4}$/.test(value)) return 1;
  return Math.max(1, Number(value));
}

export function directoryLink(query: string, page = 1): string {
  const params = new URLSearchParams();
  if (query) params.set("q", query);
  if (page > 1) params.set("page", String(page));
  return `/delivery${params.size ? `?${params}` : ""}#areas`;
}
