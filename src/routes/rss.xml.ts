import type { APIEvent } from "@solidjs/start/server";
import { proxy } from "~/lib/proxy";
export const GET = (event: APIEvent) => proxy(event, "/api/feed.xml");
