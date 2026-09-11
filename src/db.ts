import { useMemo, useSyncExternalStore } from "react";
import { Temporal } from "temporal-polyfill";
import { sessionsBetween } from "./schedule";
import { z } from "zod";

// ponytail: the whole "database" is one JSON blob in localStorage, read and
// written synchronously. It's a mockup; swap for a real API when there is one.
const STORAGE_KEY = "mini-manifest/v1";

// Timestamps and booking times are Temporal.Instant everywhere in the app;
// the schema is the only place that knows they are ISO strings on disk.
// (Instant.toJSON writes them back out, so JSON.stringify round-trips.)
const instant = z.iso.datetime().transform((value) => Temporal.Instant.from(value));

const stamps = {
  id: z.uuid(),
  createdAt: instant,
  updatedAt: instant,
};

// Everything except the organization itself is scoped to one tenant.
const tenant = { ...stamps, organizationId: z.uuid() };

const organization = z.object({ ...stamps, handle: z.string().min(1), name: z.string().min(1) });
const product = z.object({ ...tenant, name: z.string().min(1) });

const schedule = z.object({
  ...tenant,
  productId: z.uuid(),
  daysOfWeek: z.array(z.int().min(1).max(7)), // ISO weekday, 1 = Monday
  time: z.string().regex(/^\d{2}:\d{2}$/),
  durationMinutes: z.int().positive(),
});

const channel = z.object({ ...tenant, name: z.string().min(1) });

const price = z.object({
  ...tenant,
  channelId: z.uuid(),
  productId: z.uuid(),
  amountCents: z.int().nonnegative(),
});

const booking = z.object({
  ...tenant,
  productId: z.uuid(),
  channelId: z.uuid(),
  priceCents: z.int().nonnegative(), // the channel's price when the booking was taken
  start: instant,
  end: instant,
  customerName: z.string().min(1),
});

const payment = z.object({ ...tenant, bookingId: z.uuid(), amountCents: z.int().nonnegative() });

const dbSchema = z.object({
  organizations: z.array(organization),
  products: z.array(product),
  schedules: z.array(schedule),
  channels: z.array(channel),
  prices: z.array(price),
  bookings: z.array(booking),
  payments: z.array(payment),
});

export type Db = z.infer<typeof dbSchema>;
export type Table = keyof Db;
export type Row<K extends Table> = Db[K][number];
export type NewRow<K extends Table> = Omit<Row<K>, keyof typeof stamps>;

export type Organization = Row<"organizations">;
export type Product = Row<"products">;
export type Schedule = Row<"schedules">;
export type Channel = Row<"channels">;
export type Price = Row<"prices">;
export type Booking = Row<"bookings">;
export type Payment = Row<"payments">;

const EMPTY: Db = {
  organizations: [],
  products: [],
  schedules: [],
  channels: [],
  prices: [],
  bookings: [],
  payments: [],
};

function timestamp(): Temporal.Instant {
  return Temporal.Now.instant();
}

/**
 * Demo data: two tenants, each with products, channels, prices and ~two dozen
 * bookings spread over the sessions around today.
 * ponytail: deterministic, no RNG — the same mockup every reset.
 */
type OrgSeed = {
  handle: string;
  name: string;
  channels: string[];
  products: {
    name: string;
    daysOfWeek: number[];
    time: string;
    durationMinutes: number;
    prices: (number | null)[]; // one entry per channel, null = not sold there
  }[];
};

const SEEDS: OrgSeed[] = [
  {
    handle: "acme-tours",
    name: "Acme Tours",
    channels: ["Direct", "Website", "OTA Partner"],
    products: [
      {
        name: "Sunset Kayak Tour",
        daysOfWeek: [1, 3, 5],
        time: "09:00",
        durationMinutes: 90,
        prices: [8000, 8500, 9500],
      },
      {
        name: "City Bike Ride",
        daysOfWeek: [6, 7],
        time: "14:00",
        durationMinutes: 120,
        prices: [3500, 4000, null],
      },
    ],
  },
  {
    handle: "harbor-cruises",
    name: "Harbor Cruises",
    channels: ["Direct", "Website", "Walk-up"],
    products: [
      {
        name: "Harbor Sunset Cruise",
        daysOfWeek: [4, 5, 6, 7],
        time: "18:00",
        durationMinutes: 120,
        prices: [6000, 6500, 7000],
      },
      {
        name: "Whale Watching",
        daysOfWeek: [6, 7],
        time: "08:00",
        durationMinutes: 240,
        prices: [11000, 12000, null],
      },
    ],
  },
];

const CUSTOMERS = [
  "Ada Lovelace",
  "Grace Hopper",
  "Alan Turing",
  "Katherine Johnson",
  "Linus Vega",
  "Mina Okafor",
  "Tom Hall",
  "Rosa Delgado",
  "Hiro Tanaka",
  "Nora Bright",
  "Sam Okada",
  "Priya Raman",
];

const SEED_BOOKINGS_PER_ORG = 24;
const SEED_PAST_DAYS = 14; // bookings start two weeks back, so past and upcoming are both filled
const SEED_WINDOW_DAYS = 56;
const UNPAID_EVERY = 5; // every 5th booking is still unpaid
const DEPOSIT_EVERY = 3; // every 3rd booking has paid half

function seed(): Db {
  const at = timestamp();
  const row = <T>(data: T) => ({ ...data, id: crypto.randomUUID(), createdAt: at, updatedAt: at });
  const db: Db = structuredClone(EMPTY);

  for (const spec of SEEDS) {
    const org = row({ handle: spec.handle, name: spec.name });
    const organizationId = org.id;

    const channels = spec.channels.map((name) => row({ organizationId, name }));

    const products = spec.products.map((productSpec) => {
      const product = row({ organizationId, name: productSpec.name });

      db.schedules.push(
        row({
          organizationId,
          productId: product.id,
          daysOfWeek: productSpec.daysOfWeek,
          time: productSpec.time,
          durationMinutes: productSpec.durationMinutes,
        }),
      );

      productSpec.prices.forEach((amountCents, index) => {
        if (amountCents === null) {
          return;
        }

        db.prices.push(
          row({
            organizationId,
            productId: product.id,
            channelId: channels[index].id,
            amountCents,
          }),
        );
      });

      return product;
    });

    db.organizations.push(org);
    db.channels.push(...channels);
    db.products.push(...products);

    seedBookings(db, organizationId, row);
  }

  return db;
}

/** Fills sessions around today with bookings, most of them paid. */
function seedBookings(
  db: Db,
  organizationId: string,
  row: <T>(data: T) => T & { id: string; createdAt: Temporal.Instant; updatedAt: Temporal.Instant },
) {
  const from = Temporal.Now.zonedDateTimeISO().subtract({ days: SEED_PAST_DAYS });
  const sessions = sessionsBetween(
    db.schedules.filter((schedule) => schedule.organizationId === organizationId),
    from,
    from.add({ days: SEED_WINDOW_DAYS }),
  ).slice(0, SEED_BOOKINGS_PER_ORG);

  sessions.forEach((session, index) => {
    // Rotate through the channels the product is actually sold on.
    const options = db.prices.filter((price) => price.productId === session.rule.productId);
    const price = options[index % options.length];

    const booking = row({
      organizationId,
      productId: session.rule.productId,
      channelId: price.channelId,
      priceCents: price.amountCents,
      start: session.start.toInstant(),
      end: session.end.toInstant(),
      customerName: CUSTOMERS[index % CUSTOMERS.length],
    });

    db.bookings.push(booking);

    if (index % UNPAID_EVERY === 0) {
      return; // awaiting payment
    }

    const amountCents =
      index % DEPOSIT_EVERY === 0 ? Math.round(booking.priceCents / 2) : booking.priceCents;

    db.payments.push(row({ organizationId, bookingId: booking.id, amountCents }));
  });
}

function read(): Db {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return seed();
  }

  // Anything we can't parse is a stale mockup shape: start over rather than crash.
  try {
    const parsed = dbSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : seed();
  } catch {
    return seed();
  }
}

let db = read();

const listeners = new Set<() => void>();

function write(next: Db) {
  db = next;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
  for (const listener of listeners) {
    listener();
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function insert<K extends Table>(table: K, data: NewRow<K>): Row<K> {
  const at = timestamp();
  const row = { ...data, id: crypto.randomUUID(), createdAt: at, updatedAt: at } as Row<K>;

  write({ ...db, [table]: [...db[table], row] });

  return row;
}

export function update<K extends Table>(table: K, id: string, patch: Partial<NewRow<K>>) {
  const rows = (db[table] as Row<K>[]).map((row) =>
    row.id === id ? { ...row, ...patch, updatedAt: timestamp() } : row,
  );

  write({ ...db, [table]: rows });
}

// ponytail: no cascade — orphaned children are harmless in a mockup.
export function remove<K extends Table>(table: K, id: string) {
  write({ ...db, [table]: (db[table] as Row<K>[]).filter((row) => row.id !== id) });
}

export function reset() {
  localStorage.removeItem(STORAGE_KEY);
  write(seed());
}

/** All rows of a table, re-rendering on every write. */
export function useTable<K extends Table>(table: K): Row<K>[] {
  const rows = useSyncExternalStore(subscribe, () => db[table]);
  return rows as Row<K>[];
}

/** Rows of a tenant-scoped table belonging to one organization. */
export function useRows<K extends Exclude<Table, "organizations">>(
  table: K,
  organizationId: string,
): Row<K>[] {
  const rows = useTable(table);
  return useMemo(
    () => rows.filter((row) => row.organizationId === organizationId),
    [rows, organizationId],
  );
}

export function useOrg(handle: string): Organization | undefined {
  const orgs = useTable("organizations");
  return orgs.find((org) => org.handle === handle);
}
