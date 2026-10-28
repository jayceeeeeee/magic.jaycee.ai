import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { GAME_RULES } from "./game-rules.ts";
import { MASTER_PICKER_RESOURCE } from "./master-tools.ts";
import { MASTER_PICKER_HTML } from "./resource-master-picker.generated.ts";
import {
  PROFILE_IMAGE_MIME,
  PROFILE_IMAGE_RESOURCE,
  profileImageWidget,
} from "./resource-profile-image.ts";

export const GAME_RULES_URI = "magicdev://game/rules";

// Resources expose content to read. Tool handlers live in mcp-tools.ts.
export function registerResources(server: McpServer, projectUrl: string) {
  server.registerResource("master-picker", MASTER_PICKER_RESOURCE, {
    mimeType: "text/html;profile=mcp-app",
  }, async () => ({ contents: [{
    uri: MASTER_PICKER_RESOURCE,
    mimeType: "text/html;profile=mcp-app",
    text: MASTER_PICKER_HTML,
    _meta: { ui: { prefersBorder: true, csp: { resourceDomains: [projectUrl, "data:"], connectDomains: [] } } },
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

  server.registerResource("profile-image", PROFILE_IMAGE_RESOURCE, {
    mimeType: PROFILE_IMAGE_MIME,
  }, async () => ({
    contents: [{
      uri: PROFILE_IMAGE_RESOURCE,
      mimeType: PROFILE_IMAGE_MIME,
      text: profileImageWidget(projectUrl),
      _meta: {
        ui: {
          prefersBorder: true,
          csp: { resourceDomains: [projectUrl], connectDomains: [] },
        },
      },
    }],
  }));
}
