import { handleMcpRequest } from "@/lib/mcp/handler";

/** MCP endpoint for clients that send the token as `Authorization: Bearer`. */

// Tool calls (inbox search, roster import) can take a while.
export const maxDuration = 60;

const handle = (request: Request) => handleMcpRequest(request);

export const GET = handle;
export const POST = handle;
export const DELETE = handle;
