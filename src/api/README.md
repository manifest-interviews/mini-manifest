# Guest booking API

`public.ts` is the **customer-facing** side of mini-manifest — the boundary a
website booking widget would talk to.

The rest of the app is staff-side: you sign in as an operator and take bookings
from the inside. Real booking platforms also let operators embed a widget on
their _own_ website so their customers can book without ever seeing the staff
app. That widget talks to the platform over the network, against a small public
API. This module is that API.

There is no server here — mini-manifest is a client-only app whose "database" is
a JSON blob in `localStorage`. So the API is modelled, not hosted: every call is
`async` and returns plain JSON-serialisable data (ISO date strings, integer
cents) exactly like a real HTTP endpoint would, but it reads and writes the same
local store the staff app uses. A booking you make through this API shows up in
the staff app immediately, and vice versa.

## Your task

Build a **customer-facing booking screen** on top of this API — the kind of
thing an operator would embed on their site. Build it however you like (Claude
Design is a good starting point). You should not need to touch the staff app or
the store; work through the functions below.

## The surface

Every function takes the operator's `handle` (e.g. `"acme-tours"`,
`"harbor-cruises"` — the two seeded operators) as its first argument.

```ts
import { publicApi, ApiError } from "../api/public";
// or: import { getOrg, listProducts, listSessions, createBooking } from "../api/public";

const org = await publicApi.getOrg("acme-tours");
// { handle: "acme-tours", name: "Acme Tours" }

const products = await publicApi.listProducts("acme-tours");
// [{ id, name, imageUrl }, ...] — only products sold online

const sessions = await publicApi.listSessions("acme-tours", products[0].id);
// [{ id, productId, productName, start, end, priceCents }, ...]
// `start`/`end` are ISO instants; `id` is an opaque token you pass back to book.
// Optional 3rd arg: { from?: ISOstring, days?: number } (defaults: now, 60 days)

const confirmation = await publicApi.createBooking("acme-tours", {
  sessionId: sessions[0].id,
  customer: { name: "Jamie Rivera" },
  // amountCents is optional — defaults to full price. Pass 0 to reserve and pay
  // later, or a smaller amount for a deposit.
});
// { bookingId, productName, start, end, priceCents, amountPaidCents, balanceCents, customerName }
```

### Errors

Anything that goes wrong throws an `ApiError` with a `code` you can branch on,
like an HTTP status:

- `not_found` — unknown operator, product, or session
- `not_sold` — the product is not available for online booking
- `validation` — bad input (missing name, malformed session id, bad amount)

```ts
try {
  await publicApi.createBooking(handle, request);
} catch (err) {
  if (err instanceof ApiError && err.code === "validation") {
    // show the message to the customer
  }
}
```

## Good to know

- **Money is integer cents.** `8000` means `$80.00`. Divide by 100 to display.
- **Times are ISO instants** (UTC, e.g. `"2026-09-20T16:00:00Z"`). Format them
  however you like — `new Date(iso)` and `Intl.DateTimeFormat` work, and so does
  `Temporal.Instant.from(iso)` if you want to match the rest of the app.
- **Online = the "Website" channel.** A product only appears in `listProducts` /
  `listSessions` if the operator has priced it on their Website channel. In the
  seed data most products are; some deliberately are not.
- **No capacity model.** Sessions never sell out — every session is always
  bookable. (Adding "3 spots left" / "Sold out" would be a natural extension.)
- **Customers are matched by name.** Booking with a name that already exists for
  that operator reuses the customer; otherwise a new one is created.
