import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { insert, useOrg, useRows } from "../db";
import { describe } from "../schedule";

export const Route = createFileRoute("/$org/manage/products/")({ component: ProductList });

function ProductList() {
  const { org: handle } = Route.useParams();
  const org = useOrg(handle)!;
  const navigate = useNavigate();

  const products = useRows("products", org.id);
  const schedules = useRows("schedules", org.id);

  return (
    <div className="max-w-2xl space-y-4">
      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          const product = insert("products", {
            organizationId: org.id,
            name: String(form.get("name")),
          });

          navigate({
            to: "/$org/manage/products/$productId",
            params: { org: handle, productId: product.id },
          });
        }}
      >
        <input
          name="name"
          required
          placeholder="Product name"
          className="border border-gray-300 px-2 py-1 text-sm"
        />
        <button className="bg-gray-900 px-3 py-1.5 text-sm text-white">Add product</button>
      </form>

      <ul className="divide-y divide-gray-200 border border-gray-200 bg-white">
        {products.map((product) => (
          <li key={product.id}>
            <Link
              to="/$org/manage/products/$productId"
              params={{ org: handle, productId: product.id }}
              className="block px-3 py-2 hover:bg-gray-50"
            >
              <span className="font-medium">{product.name}</span>
              <span className="ml-2 text-sm text-gray-500">
                {schedules
                  .filter((schedule) => schedule.productId === product.id)
                  .map(describe)
                  .join(", ") || "no schedule"}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
