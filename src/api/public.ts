import { Temporal } from "temporal-polyfill";
import type { Organization, Price } from "../db";
import { insert, snapshot } from "../db";
import { now, sessionsBetween, timeZone } from "../schedule";

/**
 * The guest-facing booking API.
 *
 * In the real product, an operator embeds a booking widget on their own website
 * and it talks to the platform over the network. This module is that boundary,
 * modelled without a server: the functions are async and return plain,
 * JSON-serialisable data (ISO strings, integer cents) exactly as a real HTTP API
 * would, but under the hood they read and write the same local store the staff
 * app uses.
 *
 * The surface is deliberately narrow — only what a customer can see and do:
 *   - browse the products an operator sells online, and their open sessions;
 *   - book a session and (optionally) pay for it.
 * None of the staff-side tables, channels or internal ids leak through it.
 *
 * A website widget sells on one channel: the "Website" channel. That channel and
 * its prices already exist in the seed data, so a guest booking is just a booking
 * taken on the Website channel at the Website price.
 */

// The channel a website/embed widget sells on. Products without a price on this
// channel are simply not offered online.
const GUEST_CHANNEL = "Website";

// How far ahead `listSessions` looks when no window is given.
const DEFAULT_WINDOW_DAYS = 60;

// ---------------------------------------------------------------------------
// Public data shapes (what "comes back over the wire")
// ---------------------------------------------------------------------------

export type PublicOrg = {
  handle: string;
  name: string;
};

export type PublicProduct = {
  id: string;
  name: string;
  imageUrl: string;
};

export type PublicSession = {
  /** Opaque token identifying this session; pass it back to `createBooking`. */
  id: string;
  productId: string;
  productName: string;
  start: string; // ISO 8601 instant, e.g. "2026-09-20T16:00:00Z"
  end: string; // ISO 8601 instant
  priceCents: number;
};

export type BookingRequest = {
  /** A `PublicSession.id` from `listSessions`. */
  sessionId: string;
  customer: { name: string };
  /**
   * Amount to pay now, in cents. Defaults to the full price (guests usually pay
   * online in full); pass a smaller amount for a deposit, or 0 to reserve and
   * pay later.
   */
  amountCents?: number;
};

export type BookingConfirmation = {
  bookingId: string;
  productId: string;
  productName: string;
  start: string; // ISO 8601 instant
  end: string; // ISO 8601 instant
  priceCents: number;
  amountPaidCents: number;
  balanceCents: number;
  customerName: string;
};

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export type ApiErrorCode = "not_found" | "validation" | "not_sold";

/**
 * Mimics a JSON API error so a guest UI can branch on `code` the way it would on
 * an HTTP status. Throwable from any of the calls below.
 */
export class ApiError extends Error {
  code: ApiErrorCode;

  constructor(code: ApiErrorCode, message: string) {
    super(message);
    this.name = "ApiError";
    this.code = code;
  }
}

// ---------------------------------------------------------------------------
// The API
// ---------------------------------------------------------------------------

/** The operator behind a handle, e.g. "acme-tours". */
export async function getOrg(handle: string): Promise<PublicOrg> {
  const org = requireOrg(handle);
  return { handle: org.handle, name: org.name };
}

/** The products this operator sells online, in no particular order. */
export async function listProducts(handle: string): Promise<PublicProduct[]> {
  const org = requireOrg(handle);
  return snapshot()
    .products.filter(
      (product) => product.organizationId === org.id && websitePrice(org.id, product.id),
    )
    .map((product) => ({ id: product.id, name: product.name, imageUrl: product.imageUrl }));
}

/**
 * Open sessions for one product, chronologically. Looks from `from` (default:
 * now) for `days` (default: 60). Returns `[]` if the product is not sold online.
 */
export async function listSessions(
  handle: string,
  productId: string,
  options: { from?: string; days?: number } = {},
): Promise<PublicSession[]> {
  const org = requireOrg(handle);
  const price = websitePrice(org.id, productId);
  if (!price) {
    return []; // not sold online — nothing to show
  }

  const product = snapshot().products.find(
    (row) => row.id === productId && row.organizationId === org.id,
  );
  if (!product) {
    return [];
  }

  const schedules = snapshot().schedules.filter(
    (schedule) => schedule.organizationId === org.id && schedule.productId === productId,
  );

  const from = options.from
    ? Temporal.Instant.from(options.from).toZonedDateTimeISO(timeZone())
    : now();
  const until = from.add({ days: options.days ?? DEFAULT_WINDOW_DAYS });

  return sessionsBetween(schedules, from, until).map((session) => {
    const start = session.start.toInstant();
    return {
      id: encodeSessionId(productId, start),
      productId,
      productName: product.name,
      start: start.toString(),
      end: session.end.toInstant().toString(),
      priceCents: price.amountCents,
    };
  });
}

/**
 * Book a session. Finds or creates the customer by name, records the booking on
 * the Website channel, and takes payment (full price unless `amountCents` says
 * otherwise). Throws `ApiError` if the operator, product or session is unknown,
 * the product is not sold online, or the request is malformed.
 */
export async function createBooking(
  handle: string,
  request: BookingRequest,
): Promise<BookingConfirmation> {
  const org = requireOrg(handle);

  const name = request.customer?.name?.trim() ?? "";
  if (!name) {
    throw new ApiError("validation", "A customer name is required.");
  }

  const { productId, start } = decodeSessionId(request.sessionId);

  const price = websitePrice(org.id, productId);
  if (!price) {
    throw new ApiError("not_sold", "This product is not available for online booking.");
  }

  const product = snapshot().products.find(
    (row) => row.id === productId && row.organizationId === org.id,
  );
  if (!product) {
    throw new ApiError("not_found", "Unknown product.");
  }

  // The session must be a real occurrence of the product's schedule, not an
  // arbitrary instant a caller made up.
  const session = findSession(org.id, productId, start);
  if (!session) {
    throw new ApiError("validation", "That session is not available.");
  }

  const amountPaidCents = request.amountCents ?? price.amountCents;
  if (!Number.isInteger(amountPaidCents) || amountPaidCents < 0) {
    throw new ApiError(
      "validation",
      "Payment amount must be a whole number of cents, zero or more.",
    );
  }

  // Reuse an existing customer of this operator with the same name, else create
  // one — the same rule the staff booking form uses.
  const customer =
    snapshot().customers.find(
      (row) => row.organizationId === org.id && row.name.toLowerCase() === name.toLowerCase(),
    ) ?? insert("customers", { organizationId: org.id, name, isMember: false });

  const booking = insert("bookings", {
    organizationId: org.id,
    productId,
    channelId: price.channelId,
    priceCents: price.amountCents,
    start: session.start.toInstant(),
    end: session.end.toInstant(),
    customerId: customer.id,
  });

  if (amountPaidCents > 0) {
    insert("payments", {
      organizationId: org.id,
      bookingId: booking.id,
      amountCents: amountPaidCents,
    });
  }

  return {
    bookingId: booking.id,
    productId: product.id,
    productName: product.name,
    start: booking.start.toString(),
    end: booking.end.toString(),
    priceCents: booking.priceCents,
    amountPaidCents,
    balanceCents: booking.priceCents - amountPaidCents,
    customerName: customer.name,
  };
}

/** All calls under one import, for a widget that prefers `api.listSessions(...)`. */
export const publicApi = { getOrg, listProducts, listSessions, createBooking };

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

function requireOrg(handle: string): Organization {
  const org = snapshot().organizations.find((row) => row.handle === handle);
  if (!org) {
    throw new ApiError("not_found", `No operator with the handle “${handle}”.`);
  }
  return org;
}

/** The Website-channel price for a product, or null if it is not sold online. */
function websitePrice(organizationId: string, productId: string): Price | null {
  const channel = snapshot().channels.find(
    (row) => row.organizationId === organizationId && row.name === GUEST_CHANNEL,
  );
  if (!channel) {
    return null;
  }

  return (
    snapshot().prices.find(
      (row) =>
        row.organizationId === organizationId &&
        row.productId === productId &&
        row.channelId === channel.id,
    ) ?? null
  );
}

/** The occurrence starting exactly at `start`, if the schedule really runs then. */
function findSession(organizationId: string, productId: string, start: Temporal.Instant) {
  const schedules = snapshot().schedules.filter(
    (schedule) => schedule.organizationId === organizationId && schedule.productId === productId,
  );

  // An occurrence at `start` falls on `start`'s local day, so one day's worth of
  // sessions is enough to confirm it.
  const day = start.toZonedDateTimeISO(timeZone()).startOfDay();
  const sessions = sessionsBetween(schedules, day, day.add({ days: 1 }));
  return sessions.find((session) => session.start.toInstant().equals(start)) ?? null;
}

// A session has no stored row (occurrences are computed), so its id is just the
// product and the start instant, encoded together. Product ids are UUIDs and ISO
// instants contain no "@", so the first "@" always splits the two cleanly.
function encodeSessionId(productId: string, start: Temporal.Instant): string {
  return `${productId}@${start.toString()}`;
}

function decodeSessionId(sessionId: string): { productId: string; start: Temporal.Instant } {
  const at = sessionId.indexOf("@");
  if (at === -1) {
    throw new ApiError("validation", "Malformed session id.");
  }

  const productId = sessionId.slice(0, at);
  try {
    return { productId, start: Temporal.Instant.from(sessionId.slice(at + 1)) };
  } catch {
    throw new ApiError("validation", "Malformed session id.");
  }
}
