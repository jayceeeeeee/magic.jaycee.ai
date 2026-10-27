for (const name of ["game-config.js", "manna.js"]) {
  const source = new URL(`../src/js/config/${name}`, import.meta.url);
  const generated = new URL(`../supabase/functions/game-mcp/${name}`, import.meta.url);
  await Deno.writeTextFile(generated, await Deno.readTextFile(source));
  console.log(`Generated MCP ${name} from src/js/config/${name}`);
}
