import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { GAME_RULES } from "./game-rules.ts";
import { WORLD_RESOURCES } from "./game-master.ts";
import { MASTER_PICKER_RESOURCE } from "./master-tools.ts";
import { MASTER_PICKER_HTML } from "./resource-master-picker.generated.ts";
import { GAME_HTML } from "./resource-game.generated.ts";
import { GAME_RESOURCE } from "./game-tools.ts";
import { ACCOUNT_RESOURCE } from "./account-tools.ts";
import { ACCOUNT_HTML } from "./resource-account.generated.ts";

export const GAME_RULES_URI = "magicdev://game/rules";

// Resources expose content to read. Tool handlers live in mcp-tools.ts.
export function registerResources(server: McpServer, projectUrl: string) {
  for (const resource of WORLD_RESOURCES) {
    server.registerResource(resource.name, resource.uri, {
      title: resource.title,
      description: resource.description,
      mimeType: "text/markdown",
      annotations: { audience: ["assistant"], priority: 0.8 },
    }, () => ({ contents: [{ uri: resource.uri, mimeType: "text/markdown", text: resource.text }] }));
  }
  server.registerResource("account", ACCOUNT_RESOURCE, { mimeType: "text/html;profile=mcp-app" }, async () => ({ contents: [{
    uri: ACCOUNT_RESOURCE, mimeType: "text/html;profile=mcp-app", text: ACCOUNT_HTML,
    _meta: { ui: { prefersBorder: true, csp: { resourceDomains: [projectUrl, "data:", "blob:", "https://fonts.googleapis.com", "https://fonts.gstatic.com"], connectDomains: [projectUrl] } } },
  }] }));
  server.registerResource("game", GAME_RESOURCE, { mimeType: "text/html;profile=mcp-app" }, async () => ({contents:[{
    uri:GAME_RESOURCE,mimeType:"text/html;profile=mcp-app",text:GAME_HTML,
    _meta:{ui:{prefersBorder:true,csp:{resourceDomains:[projectUrl,"data:","https://fonts.googleapis.com","https://fonts.gstatic.com"],connectDomains:[]}}},
  }]}));
  server.registerResource("master-picker", MASTER_PICKER_RESOURCE, {
    mimeType: "text/html;profile=mcp-app",
  }, async () => ({ contents: [{
    uri: MASTER_PICKER_RESOURCE,
    mimeType: "text/html;profile=mcp-app",
    text: MASTER_PICKER_HTML,
    _meta: { ui: { prefersBorder: true, csp: { resourceDomains: [projectUrl, "data:", "https://fonts.googleapis.com", "https://fonts.gstatic.com"], connectDomains: [] } } },
  }] }));
  server.registerResource("game-rules", GAME_RULES_URI, {
    title: "Official Magic Dev game rules",
    description:
      "Complete immutable rules, fixed Skill cycles, practice goals, zones and documented Manna equations. No player data or personal calculations.",
    mimeType: "application/json",
    annotations: { audience: ["assistant"], priority: 0.8 },
  }, () => ({
    contents: [{
      uri: GAME_RULES_URI,
      mimeType: "application/json",
      text: JSON.stringify(GAME_RULES, null, 2),
    }],
  }));

}
