import { createFileRoute } from "@tanstack/react-router";
import { insert, remove, update, useOrg, useRows } from "../db";
import { formatMoney } from "../schedule";

export const Route = createFileRoute("/$org/channels")({ component: Channels });

const CENTS_PER_UNIT = 100;

function Channels() {
  const { org: handle } = Route.useParams();
  const org = useOrg(handle)!;

  const channels = useRows("channels", org.id);
  const products = useRows("products", org.id);
  const prices = useRows("prices", org.id);

  // One editable cell per product/channel pair; a missing price row means "not sold here".
  const priceFor = (productId: string, channelId: string) =>
    prices.find((price) => price.productId === productId && price.channelId === channelId);

  const setPrice = (productId: string, channelId: string, amountCents: number) => {
    const existing = priceFor(productId, channelId);

    if (existing) {
      update("prices", existing.id, { amountCents });
      return;
    }

    insert("prices", { organizationId: org.id, productId, channelId, amountCents });
  };

  return (
    <div className="space-y-6">
      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          insert("channels", { organizationId: org.id, name: String(form.get("name")) });
          event.currentTarget.reset();
        }}
      >
        <input name="name" placeholder="Channel name" required className="border px-2 py-1" />
        <button className="border bg-gray-900 px-3 py-1 text-white">Add channel</button>
      </form>

      <table className="w-full text-sm">
        <thead>
          <tr>
            <th className="text-left">Product</th>
            {channels.map((channel) => (
              <th key={channel.id} className="text-left">
                {channel.name}
                <button
                  onClick={() => remove("channels", channel.id)}
                  className="ml-2 font-normal text-red-600"
                >
                  ×
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {products.map((product) => (
            <tr key={product.id} className="border-t border-gray-200">
              <td className="py-1">{product.name}</td>
              {channels.map((channel) => (
                <td key={channel.id} className="py-1">
                  <input
                    type="number"
                    step="0.01"
                    min={0}
                    className="w-24 border px-1"
                    placeholder="—"
                    defaultValue={
                      priceFor(product.id, channel.id)?.amountCents
                        ? String(priceFor(product.id, channel.id)!.amountCents / CENTS_PER_UNIT)
                        : ""
                    }
                    onBlur={(event) => {
                      const value = event.currentTarget.value;
                      if (value === "") {
                        return;
                      }
                      setPrice(product.id, channel.id, Math.round(Number(value) * CENTS_PER_UNIT));
                    }}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      <p className="text-sm text-gray-500">
        Total listed: {formatMoney(prices.reduce((sum, price) => sum + price.amountCents, 0))}
      </p>
    </div>
  );
}
