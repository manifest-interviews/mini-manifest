import { useMemo, useSyncExternalStore } from "react";
import { Temporal } from "temporal-polyfill";
import { z } from "zod";

// ponytail: the whole "database" is one JSON blob in localStorage, read and
// written synchronously. It's a mockup; swap for a real API when there is one.
const STORAGE_KEY = "mini-manifest/v1";

const stamps = {
  id: z.uuid(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
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
  start: z.iso.datetime(),
  end: z.iso.datetime(),
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

function timestamp(): string {
  return Temporal.Now.instant().toString();
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

/** Demo tenant so the app has something to show on first load. */
function seed(): Db {
  const at = timestamp();
  const row = <T>(data: T) => ({ ...data, id: crypto.randomUUID(), createdAt: at, updatedAt: at });

  const org = row({ handle: "acme-tours", name: "Acme Tours" });
  const organizationId = org.id;

  const kayak = row({ organizationId, name: "Sunset Kayak Tour" });
  const bike = row({ organizationId, name: "City Bike Ride" });

  const web = row({ organizationId, name: "Website" });
  const ota = row({ organizationId, name: "OTA Partner" });

  return {
    ...EMPTY,
    organizations: [org],
    products: [kayak, bike],
    channels: [web, ota],
    schedules: [
      row({
        organizationId,
        productId: kayak.id,
        daysOfWeek: [1, 3, 5],
        time: "09:00",
        durationMinutes: 90,
      }),
      row({
        organizationId,
        productId: bike.id,
        daysOfWeek: [6, 7],
        time: "14:00",
        durationMinutes: 120,
      }),
    ],
    prices: [
      row({ organizationId, productId: kayak.id, channelId: web.id, amountCents: 8500 }),
      row({ organizationId, productId: kayak.id, channelId: ota.id, amountCents: 9500 }),
      row({ organizationId, productId: bike.id, channelId: web.id, amountCents: 4000 }),
    ],
  };
}
