/** L'API /api/employees plafonne `limit` à 100 : on enchaîne les pages pour tout récupérer. */
const PAGE_SIZE = 100;
const MAX_PAGES = 50;

export async function fetchAllEmployees<T = unknown>(filters: Record<string, string> = {}): Promise<T[]> {
  const all: T[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const params = new URLSearchParams({ ...filters, page: String(page), limit: String(PAGE_SIZE) });
    const res = await fetch(`/api/employees?${params}`);
    if (!res.ok) throw new Error(`Chargement des employés impossible (${res.status})`);
    const json = await res.json();
    const rows = (json.data ?? []) as T[];
    all.push(...rows);
    const totalPages = json.pagination?.totalPages ?? 1;
    if (page >= totalPages || rows.length === 0) break;
  }
  return all;
}
