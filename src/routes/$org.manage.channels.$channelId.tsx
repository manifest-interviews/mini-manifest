import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { insert, remove, update, useOrg, useRows } from "../db";
import { formatMoney } from "../schedule";

export const Route = createFileRoute("/$org/manage/channels/$channelId")({
  component: ChannelPage,
});

const CENTS_PER_UNIT = 100;

function ChannelPage() {
  const { org: handle, channelId } = Route.useParams();
  const org = useOrg(handle)!;
  const navigate = useNavigate();

  const channel = useRows("channels", org.id).find((row) => row.id === channelId);
  const products = useRows("products", org.id);
  const prices = useRows("prices", org.id);

  if (!channel) {
    return <p>Channel not found.</p>;
  }

  const setPrice = (productId: string, amountCents: number) => {
    const existing = prices.find(
      (price) => price.productId === productId && price.channelId === channelId,
    );

    if (existing) {
      update("prices", existing.id, { amountCents });
      return;
    }

    insert("prices", { organizationId: org.id, productId, channelId, amountCents });
  };

  return (
    <div className="max-w-2xl space-y-8">
      <Link to="/$org/manage/channels" params={{ org: handle }} className="text-sm text-gray-500">
        ← Channels
      </Link>

      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          update("channels", channelId, { name: String(form.get("name")) });
        }}
      >
        <input
          name="name"
          defaultValue={channel.name}
          required
          className="flex-1 border border-gray-300 px-2 py-1"
        />
        <button className="bg-gray-900 px-3 py-1.5 text-sm text-white">Save</button>
      </form>

      <section>
        <h2 className="mb-2 font-semibold">Prices</h2>

        <ul className="divide-y divide-gray-200 border border-gray-200 bg-white text-sm">
          {products.map((product) => {
            const price = prices.find(
              (row) => row.channelId === channelId && row.productId === product.id,
            );

            return (
              <li key={product.id} className="flex items-center justify-between px-3 py-2">
                <span>{product.name}</span>
                <span className="flex items-center gap-3">
                  <span className="text-gray-500">
                    {price ? formatMoney(price.amountCents) : "not sold"}
                  </span>
                  <input
                    type="number"
                    step="0.01"
                    min={0}
                    placeholder="—"
                    defaultValue={price ? price.amountCents / CENTS_PER_UNIT : ""}
                    onBlur={(event) => {
                      const value = event.currentTarget.value;
                      if (value !== "") {
                        setPrice(product.id, Math.round(Number(value) * CENTS_PER_UNIT));
                      }
                    }}
                    className="w-24 border border-gray-300 px-1"
                  />
                </span>
              </li>
            );
          })}
          {products.length === 0 && <li className="px-3 py-2 text-gray-500">No products yet.</li>}
        </ul>
      </section>

      <button
        onClick={() => {
          remove("channels", channelId);
          navigate({ to: "/$org/manage/channels", params: { org: handle } });
        }}
        className="text-sm text-red-600"
      >
        Delete channel
      </button>
    </div>
  );
}
