const source = new URL("../src/js/config/game-config.js", import.meta.url);
const generated = new URL(
  "../supabase/functions/game-mcp/game-config.js",
  import.meta.url,
);

const contents = await Deno.readTextFile(source);
await Deno.writeTextFile(generated, contents);
console.log("Generated the MCP game config from src/js/config/game-config.js");
