import type { Express, Request, Response } from "express";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { foodCompassCorrectionReports, foodCompassOffers, foodCompassPlaces, groceryShoppingItems } from "@shared/schema";
import { db } from "../db";
import { isAuthenticated } from "./middleware";

const itemId = (value: unknown) => z.coerce.number().int().positive().safeParse(value);
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const optionalText = (max: number) => z.string().trim().max(max).nullable().optional();
const optionalHttpUrl = z.string().url().max(1_000).refine((value) => /^https?:\/\//i.test(value), "Use an http(s) URL.").nullable().optional();
const placeTypes = ["farm", "market", "grocery", "restaurant", "producer", "other"] as const;
const availabilityStates = ["available", "limited", "unavailable", "unknown"] as const;
const fulfillmentModes = ["pickup", "delivery", "shipping", "in_store", "unknown"] as const;
const discoverySchema = z.object({
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
  radiusKm: z.number().finite().min(1).max(25).default(10),
}).strict();
const OVERPASS_ENDPOINT = "https://overpass-api.de/api/interpreter";
const OSM_ATTRIBUTION_URL = "https://www.openstreetmap.org/copyright";

type OverpassElement = {
  type?: "node" | "way" | "relation";
  id?: number;
  lat?: number;
  lon?: number;
  center?: { lat?: number; lon?: number };
  timestamp?: string;
  tags?: Record<string, string | undefined>;
};

function safeHttpUrl(value: string | undefined): string | null {
  return value && /^https?:\/\//i.test(value) ? value : null;
}

function dateOnly(value: string | undefined): string | null {
  return value && /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : null;
}

function overpassQuery(latitude: number, longitude: number, radiusMeters: number): string {
  const around = `${radiusMeters},${latitude.toFixed(6)},${longitude.toFixed(6)}`;
  return `[out:json][timeout:8][maxsize:1048576];\n(\n  nwr(around:${around})[amenity=marketplace];\n  nwr(around:${around})[shop=farm];\n  nwr(around:${around})[shop=greengrocer];\n  nwr(around:${around})[shop=organic];\n  nwr(around:${around})[shop=supermarket];\n);\nout center 60;`;
}

function normalizeDiscoveredPlace(element: OverpassElement) {
  const tags = element.tags || {};
  const latitude = element.lat ?? element.center?.lat;
  const longitude = element.lon ?? element.center?.lon;
  if (!element.type || !Number.isInteger(element.id) || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  const placeType = tags.amenity === "marketplace" ? "market"
    : tags.shop === "farm" ? "farm"
      : tags.shop === "supermarket" || tags.shop === "greengrocer" || tags.shop === "organic" ? "grocery" : "other";
  const address = [tags["addr:housenumber"], tags["addr:street"]].filter(Boolean).join(" ") || null;
  const sourceUrl = `https://www.openstreetmap.org/${element.type}/${element.id}`;
  return {
    providerId: `${element.type}/${element.id}`,
    name: (tags.name || "Unnamed mapped food source").slice(0, 200),
    placeType,
    address,
    city: tags["addr:city"] || null,
    region: tags["addr:state"] || tags["addr:province"] || null,
    postalCode: tags["addr:postcode"] || null,
    latitude,
    longitude,
    websiteUrl: safeHttpUrl(tags.website || tags["contact:website"]),
    sourceName: "OpenStreetMap via Overpass",
    sourceUrl,
    sourceUpdatedOn: dateOnly(element.timestamp),
    openingHours: tags.opening_hours || null,
    category: tags.amenity === "marketplace" ? "farmers market" : tags.shop || null,
  };
}

const placeInputBaseSchema = z.object({
  name: z.string().trim().min(1).max(200),
  placeType: z.enum(placeTypes),
  address: optionalText(300),
  city: optionalText(100),
  region: optionalText(100),
  postalCode: optionalText(32),
  latitude: z.number().finite().min(-90).max(90).nullable().optional(),
  longitude: z.number().finite().min(-180).max(180).nullable().optional(),
  websiteUrl: optionalHttpUrl,
  sourceName: z.string().trim().min(1).max(160),
  sourceUrl: optionalHttpUrl,
  sourceUpdatedOn: dateSchema.nullable().optional(),
  verifiedOn: dateSchema.nullable().optional(),
  notes: optionalText(2_000),
}).strict();

const placeInputSchema = placeInputBaseSchema.refine((value) => (value.latitude === null || value.latitude === undefined) === (value.longitude === null || value.longitude === undefined), {
  message: "Enter both coordinates or neither.", path: ["longitude"],
});

const placePatchSchema = placeInputBaseSchema.extend({ status: z.enum(["active", "archived"]).optional() }).partial().strict().refine((value) => {
  const latitudePresent = value.latitude !== undefined;
  const longitudePresent = value.longitude !== undefined;
  if (latitudePresent !== longitudePresent) return false;
  return !latitudePresent || (value.latitude === null) === (value.longitude === null);
}, { message: "Update coordinates together.", path: ["longitude"] });

const offerInputSchema = z.object({
  placeId: z.number().int().positive(),
  name: z.string().trim().min(1).max(200),
  category: optionalText(100),
  price: z.number().finite().min(0).max(1_000_000).nullable().optional(),
  currency: z.string().trim().regex(/^[A-Z]{3}$/).default("USD"),
  availabilityStatus: z.enum(availabilityStates).default("unknown"),
  fulfillmentMode: z.enum(fulfillmentModes).default("unknown"),
  externalActionUrl: optionalHttpUrl,
  sourceName: z.string().trim().min(1).max(160),
  sourceUrl: optionalHttpUrl,
  sourceUpdatedOn: dateSchema.nullable().optional(),
  verifiedOn: dateSchema.nullable().optional(),
  notes: optionalText(2_000),
}).strict();

const offerPatchSchema = offerInputSchema.omit({ placeId: true }).extend({ status: z.enum(["active", "archived"]).optional() }).partial().strict();
const reportSchema = z.object({
  placeId: z.number().int().positive().nullable().optional(),
  offerId: z.number().int().positive().nullable().optional(),
  reportType: z.enum(["stale", "correction", "closed", "missing"]),
  note: optionalText(2_000),
  evidenceUrl: optionalHttpUrl,
}).strict().refine((value) => Boolean(value.placeId) !== Boolean(value.offerId), { message: "Choose one saved place or one saved offer to report." });

async function ownedPlace(userId: number, id: number) {
  const [place] = await db.select().from(foodCompassPlaces).where(and(eq(foodCompassPlaces.id, id), eq(foodCompassPlaces.userId, userId))).limit(1);
  return place || null;
}

async function ownedOffer(userId: number, id: number) {
  const [offer] = await db.select().from(foodCompassOffers).where(and(eq(foodCompassOffers.id, id), eq(foodCompassOffers.userId, userId))).limit(1);
  return offer || null;
}

function placeLabel(place: { address: string | null; city: string | null; region: string | null; postalCode: string | null }) {
  return [place.address, [place.city, place.region].filter(Boolean).join(", "), place.postalCode].filter(Boolean).join(" · ") || null;
}

export function registerFoodCompassRoutes(app: Express): void {
  app.post("/api/food-compass/discover", isAuthenticated, async (req: Request, res: Response) => {
    const parsed = discoverySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Enter a latitude, longitude, and a search radius from 1 to 25 km." });
    const { latitude, longitude, radiusKm } = parsed.data;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12_000);
    try {
      const response = await fetch(`${OVERPASS_ENDPOINT}?data=${encodeURIComponent(overpassQuery(latitude, longitude, Math.round(radiusKm * 1_000)))}`, {
        headers: { "User-Agent": "LyfeOS-Food-Compass/1.0 (+https://lyfeos.net)", Accept: "application/json" },
        signal: controller.signal,
      });
      if (!response.ok) {
        const retryAfter = response.headers.get("retry-after");
        return res.status(response.status === 429 || response.status === 504 ? 503 : 502).json({ error: "The public map directory is busy. Wait a moment and try again.", retryAfter });
      }
      const payload = await response.json() as { elements?: OverpassElement[]; osm3s?: { timestamp_osm_base?: string } };
      const seen = new Set<string>();
      const places = (Array.isArray(payload.elements) ? payload.elements : [])
        .map(normalizeDiscoveredPlace)
        .filter((place): place is NonNullable<typeof place> => Boolean(place))
        .filter((place) => (seen.has(place.providerId) ? false : (seen.add(place.providerId), true)))
        .slice(0, 60);
      return res.json({
        places,
        provider: "OpenStreetMap via Overpass",
        attributionUrl: OSM_ATTRIBUTION_URL,
        retrievedOn: new Date().toISOString(),
        datasetUpdatedOn: dateOnly(payload.osm3s?.timestamp_osm_base),
        disclosure: "The coordinates you entered were sent to OpenStreetMap's public Overpass directory for this lookup. Results are not saved to your account, verified by LyfeOS, or evidence that a seller is open, carries a product, has inventory, offers delivery, or accepts orders. Save a result only after reviewing its linked source.",
      });
    } catch (error) {
      if ((error as Error).name === "AbortError") return res.status(504).json({ error: "The public map directory took too long. Try a smaller radius or try again shortly." });
      return res.status(502).json({ error: "Food Compass could not reach the public map directory. Try again shortly." });
    } finally {
      clearTimeout(timeout);
    }
  });

  app.get("/api/food-compass/overview", isAuthenticated, async (req: Request, res: Response) => {
    const userId = req.session.userId!;
    const [places, offers, reports] = await Promise.all([
      db.select().from(foodCompassPlaces).where(and(eq(foodCompassPlaces.userId, userId), eq(foodCompassPlaces.status, "active"))).orderBy(desc(foodCompassPlaces.updatedAt)).limit(250),
      db.select().from(foodCompassOffers).where(and(eq(foodCompassOffers.userId, userId), eq(foodCompassOffers.status, "active"))).orderBy(desc(foodCompassOffers.updatedAt)).limit(500),
      db.select().from(foodCompassCorrectionReports).where(and(eq(foodCompassCorrectionReports.userId, userId), eq(foodCompassCorrectionReports.status, "open"))).orderBy(desc(foodCompassCorrectionReports.createdAt)).limit(50),
    ]);
    const offersByPlace = new Map<number, typeof offers>();
    for (const offer of offers) offersByPlace.set(offer.placeId, [...(offersByPlace.get(offer.placeId) || []), offer]);
    return res.json({
      places: places.map((place) => ({ ...place, locationLabel: placeLabel(place), offers: offersByPlace.get(place.id) || [] })),
      reports,
      disclosure: "Food Compass is a private local-source workspace. A place, offer, price, hours, availability, or fulfillment entry reflects the source and verification date shown beside it; it is not a LyfeOS inventory guarantee or checkout service. Open the source or seller link before acting.",
    });
  });

  app.post("/api/food-compass/places", isAuthenticated, async (req: Request, res: Response) => {
    const parsed = placeInputSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Enter a source-backed place with valid coordinates, if provided." });
    const [place] = await db.insert(foodCompassPlaces).values({ userId: req.session.userId!, ...parsed.data }).returning();
    return res.status(201).json({ place });
  });

  app.patch("/api/food-compass/places/:id", isAuthenticated, async (req: Request, res: Response) => {
    const id = itemId(req.params.id);
    const parsed = placePatchSchema.safeParse(req.body);
    if (!id.success || !parsed.success || !Object.keys(parsed.data).length) return res.status(400).json({ error: "Enter a valid place update." });
    const [place] = await db.update(foodCompassPlaces).set({ ...parsed.data, updatedAt: new Date() }).where(and(eq(foodCompassPlaces.id, id.data), eq(foodCompassPlaces.userId, req.session.userId!))).returning();
    return place ? res.json({ place }) : res.status(404).json({ error: "Place not found." });
  });

  app.delete("/api/food-compass/places/:id", isAuthenticated, async (req: Request, res: Response) => {
    const id = itemId(req.params.id);
    if (!id.success) return res.status(400).json({ error: "Invalid place." });
    const [removed] = await db.delete(foodCompassPlaces).where(and(eq(foodCompassPlaces.id, id.data), eq(foodCompassPlaces.userId, req.session.userId!))).returning({ id: foodCompassPlaces.id });
    return removed ? res.status(204).send() : res.status(404).json({ error: "Place not found." });
  });

  app.post("/api/food-compass/offers", isAuthenticated, async (req: Request, res: Response) => {
    const parsed = offerInputSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Enter a source-backed offer with a valid price, if known." });
    if (!await ownedPlace(req.session.userId!, parsed.data.placeId)) return res.status(404).json({ error: "Place not found." });
    const [offer] = await db.insert(foodCompassOffers).values({ userId: req.session.userId!, ...parsed.data }).returning();
    return res.status(201).json({ offer });
  });

  app.patch("/api/food-compass/offers/:id", isAuthenticated, async (req: Request, res: Response) => {
    const id = itemId(req.params.id);
    const parsed = offerPatchSchema.safeParse(req.body);
    if (!id.success || !parsed.success || !Object.keys(parsed.data).length) return res.status(400).json({ error: "Enter a valid offer update." });
    const [offer] = await db.update(foodCompassOffers).set({ ...parsed.data, updatedAt: new Date() }).where(and(eq(foodCompassOffers.id, id.data), eq(foodCompassOffers.userId, req.session.userId!))).returning();
    return offer ? res.json({ offer }) : res.status(404).json({ error: "Offer not found." });
  });

  app.delete("/api/food-compass/offers/:id", isAuthenticated, async (req: Request, res: Response) => {
    const id = itemId(req.params.id);
    if (!id.success) return res.status(400).json({ error: "Invalid offer." });
    const [removed] = await db.delete(foodCompassOffers).where(and(eq(foodCompassOffers.id, id.data), eq(foodCompassOffers.userId, req.session.userId!))).returning({ id: foodCompassOffers.id });
    return removed ? res.status(204).send() : res.status(404).json({ error: "Offer not found." });
  });

  app.post("/api/food-compass/offers/:id/add-to-shopping", isAuthenticated, async (req: Request, res: Response) => {
    const id = itemId(req.params.id);
    if (!id.success) return res.status(400).json({ error: "Invalid offer." });
    const userId = req.session.userId!;
    const offer = await ownedOffer(userId, id.data);
    if (!offer) return res.status(404).json({ error: "Offer not found." });
    const note = `Food Compass offer #${offer.id}`;
    const [existing] = await db.select().from(groceryShoppingItems).where(and(eq(groceryShoppingItems.userId, userId), eq(groceryShoppingItems.note, note), eq(groceryShoppingItems.status, "pending"))).limit(1);
    if (existing) return res.json({ item: existing, created: false });
    const [item] = await db.insert(groceryShoppingItems).values({ userId, name: offer.name, quantity: 1, unit: "item", note, generatedBy: "food_compass" }).returning();
    return res.status(201).json({ item, created: true });
  });

  app.post("/api/food-compass/correction-reports", isAuthenticated, async (req: Request, res: Response) => {
    const parsed = reportSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Choose a saved place or offer and describe the correction." });
    const userId = req.session.userId!;
    if (parsed.data.placeId && !await ownedPlace(userId, parsed.data.placeId)) return res.status(404).json({ error: "Place not found." });
    if (parsed.data.offerId && !await ownedOffer(userId, parsed.data.offerId)) return res.status(404).json({ error: "Offer not found." });
    const [report] = await db.insert(foodCompassCorrectionReports).values({ userId, ...parsed.data }).returning();
    return res.status(201).json({ report, disclosure: "This report is private to your account. It does not alter the saved source automatically; update or remove the record after checking the cited source." });
  });

  app.delete("/api/food-compass/correction-reports/:id", isAuthenticated, async (req: Request, res: Response) => {
    const id = itemId(req.params.id);
    if (!id.success) return res.status(400).json({ error: "Invalid correction report." });
    const [removed] = await db.delete(foodCompassCorrectionReports).where(and(eq(foodCompassCorrectionReports.id, id.data), eq(foodCompassCorrectionReports.userId, req.session.userId!))).returning({ id: foodCompassCorrectionReports.id });
    return removed ? res.status(204).send() : res.status(404).json({ error: "Correction report not found." });
  });
}
