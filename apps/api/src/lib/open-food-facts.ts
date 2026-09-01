/**
 * Open Food Facts — the external food data source (FR-NUT-05, FR-NUT-06).
 *
 * FR-NUT-06 puts this behind our API rather than in the client, for three
 * reasons: the client would otherwise leak every food a user searches for to a
 * third party along with their IP, we could not cache results, and Open Food
 * Facts asks for an identifying User-Agent that a browser cannot set.
 *
 * The data is crowd-edited and uneven (R15). Everything here is therefore
 * defensive: a product with no usable nutrition panel is dropped rather than
 * imported with zeros, because a food logged as 0 kJ is worse than a food that
 * could not be found.
 *
 * Open Food Facts is a *source*, not a dependency. Every failure path returns
 * empty or null, and the caller degrades to "not found" — custom foods
 * (FR-NUT-08) still work with the network down.
 */
import type { NutritionPer100g } from '@fi/shared';

/**
 * Their terms of use ask for a User-Agent naming the app and a contact.
 *
 * Sending a generic agent gets rate-limited and is discourteous to a volunteer
 * project whose data we are using for free.
 */
const USER_AGENT = 'FitnessIntellisense/0.2 (https://github.com/abddoeservthingmba/FitnelliSense)';

const SEARCH_URL = 'https://world.openfoodfacts.org/cgi/search.pl';
const PRODUCT_URL = 'https://world.openfoodfacts.org/api/v2/product';

/** Only the fields we store, so their servers send less and we parse less. */
const FIELDS = [
  'code',
  'product_name',
  'brands',
  'nutriments',
  'serving_quantity',
  'serving_size',
].join(',');

export interface ExternalFood {
  readonly barcode: string | null;
  readonly name: string;
  readonly brand: string | null;
  readonly per100g: NutritionPer100g;
  readonly servingG: string | null;
  readonly servingLabel: string | null;
}

export interface FoodLookup {
  search(term: string, limit: number): Promise<ExternalFood[]>;
  byBarcode(barcode: string): Promise<ExternalFood | null>;
}

/** Used in tests and when the source is deliberately disabled. */
export const nullFoodLookup: FoodLookup = {
  search: async () => [],
  byBarcode: async () => null,
};

// ---------------------------------------------------------------- parsing --

/** Their numbers arrive as numbers, strings, or absent. */
function numberOrNull(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/** Two decimal places, clamped into the range the schema and CHECK allow. */
function grams(value: unknown): string | null {
  const parsed = numberOrNull(value);
  if (parsed === null || parsed < 0) return null;
  // Above 100 g per 100 g is not a food, it is a bad row.
  if (parsed > 100) return null;
  return parsed.toFixed(2);
}

/**
 * Energy per 100 g, in kJ.
 *
 * They may give kJ, kcal, or a bare `energy_100g` whose unit is stated
 * elsewhere. kJ is preferred; kcal is converted; a bare value is not guessed at,
 * because guessing the unit is how a 2000 kcal food becomes 2000 kJ.
 */
function energyKj(nutriments: Record<string, unknown>): number | null {
  const kj = numberOrNull(nutriments['energy-kj_100g']);
  if (kj !== null && kj >= 0) return Math.round(kj);

  const kcal = numberOrNull(nutriments['energy-kcal_100g']);
  if (kcal !== null && kcal >= 0) return Math.round(kcal * 4.184);

  return null;
}

/**
 * One product, or null if it is not usable.
 *
 * Null is a normal outcome: a large share of Open Food Facts entries are a
 * barcode and a photo with no nutrition panel yet.
 */
function toFood(raw: unknown): ExternalFood | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const product = raw as Record<string, unknown>;

  const name = typeof product.product_name === 'string' ? product.product_name.trim() : '';
  if (name === '' || name.length > 120) return null;

  const nutriments =
    typeof product.nutriments === 'object' && product.nutriments !== null
      ? (product.nutriments as Record<string, unknown>)
      : {};

  const energy = energyKj(nutriments);
  const proteinG = grams(nutriments.proteins_100g);
  const carbsG = grams(nutriments.carbohydrates_100g);
  const fatG = grams(nutriments.fat_100g);

  // All four or nothing. A partial panel would log as zeros and quietly
  // understate the day, which is worse than the food not being found.
  if (energy === null || proteinG === null || carbsG === null || fatG === null) return null;
  if (energy > 4000) return null; // beyond pure fat; the row is wrong

  const brandField = typeof product.brands === 'string' ? product.brands.split(',')[0] : undefined;
  const brand = brandField?.trim();

  const servingQuantity = numberOrNull(product.serving_quantity);
  const servingLabel =
    typeof product.serving_size === 'string' && product.serving_size.trim() !== ''
      ? product.serving_size.trim().slice(0, 120)
      : null;

  const barcode =
    typeof product.code === 'string' && /^\d{8,14}$/.test(product.code) ? product.code : null;

  return {
    barcode,
    name: name.slice(0, 120),
    brand: brand && brand !== '' ? brand.slice(0, 120) : null,
    per100g: { energyKj: energy, proteinG, carbsG, fatG },
    servingG:
      servingQuantity !== null && servingQuantity > 0 && servingQuantity <= 99_999
        ? servingQuantity.toFixed(2)
        : null,
    servingLabel,
  };
}

// ----------------------------------------------------------------- client --

export interface FoodLookupConfig {
  readonly timeoutMs: number;
}

export function createFoodLookup(config: FoodLookupConfig): FoodLookup {
  const fetchJson = async (url: string): Promise<unknown | null> => {
    try {
      const response = await fetch(url, {
        headers: { 'user-agent': USER_AGENT, accept: 'application/json' },
        signal: AbortSignal.timeout(config.timeoutMs),
      });
      if (!response.ok) return null;
      return (await response.json()) as unknown;
    } catch {
      // Timeout, DNS, malformed JSON — all the same to the caller, which
      // degrades to "not found" rather than failing the request.
      return null;
    }
  };

  return {
    async search(term, limit) {
      const url = `${SEARCH_URL}?${new URLSearchParams({
        search_terms: term,
        json: '1',
        page_size: String(Math.min(50, limit * 2)),
        fields: FIELDS,
        // Their search returns a lot of skeleton entries; asking for products
        // that have a nutrition panel cuts most of them out server-side.
        action: 'process',
      }).toString()}`;

      const body = await fetchJson(url);
      if (typeof body !== 'object' || body === null) return [];
      const products = (body as { products?: unknown }).products;
      if (!Array.isArray(products)) return [];

      const foods: ExternalFood[] = [];
      for (const raw of products) {
        const food = toFood(raw);
        if (food) foods.push(food);
        if (foods.length >= limit) break;
      }
      return foods;
    },

    async byBarcode(barcode) {
      const url = `${PRODUCT_URL}/${encodeURIComponent(barcode)}.json?fields=${FIELDS}`;
      const body = await fetchJson(url);
      if (typeof body !== 'object' || body === null) return null;

      const envelope = body as { status?: unknown; product?: unknown };
      // status 0 is their "product not found".
      if (envelope.status === 0) return null;

      const food = toFood(envelope.product);
      // Trust the barcode we asked for over the one echoed back.
      return food ? { ...food, barcode } : null;
    },
  };
}
