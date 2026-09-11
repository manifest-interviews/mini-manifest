import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { insert, useOrg, useRows } from "../db";

export const Route = createFileRoute("/$org/manage/channels/")({ component: ChannelList });

function ChannelList() {
  const { org: handle } = Route.useParams();
  const org = useOrg(handle)!;
  const navigate = useNavigate();

  const channels = useRows("channels", org.id);
  const prices = useRows("prices", org.id);

  return (
    <div className="max-w-2xl space-y-4">
      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          const channel = insert("channels", {
            organizationId: org.id,
            name: String(form.get("name")),
          });

          navigate({
            to: "/$org/manage/channels/$channelId",
            params: { org: handle, channelId: channel.id },
          });
        }}
      >
        <input
          name="name"
          required
          placeholder="Channel name"
          className="border border-gray-300 px-2 py-1 text-sm"
        />
        <button className="bg-gray-900 px-3 py-1.5 text-sm text-white">Add channel</button>
      </form>

      <ul className="divide-y divide-gray-200 border border-gray-200 bg-white">
        {channels.map((channel) => (
          <li key={channel.id}>
            <Link
              to="/$org/manage/channels/$channelId"
              params={{ org: handle, channelId: channel.id }}
              className="block px-3 py-2 hover:bg-gray-50"
            >
              <span className="font-medium">{channel.name}</span>
              <span className="ml-2 text-sm text-gray-500">
                {prices.filter((price) => price.channelId === channel.id).length} priced products
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
