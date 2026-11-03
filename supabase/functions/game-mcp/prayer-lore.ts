// Verified account identity, never an editable display name or role claim.
export const TECHNOMANCY_MASTER_ID = "d70b5c69-daae-4a77-9955-4385439ae292";

export function technomancyMasterId(accountIds: Record<string, string>) {
  return accountIds[TECHNOMANCY_MASTER_ID] ?? TECHNOMANCY_MASTER_ID;
}

export const TECHNOMANCY_INTRODUCTION =
  `Before starting this Skill, introduce Cedric's teaching in the player's language, in a short, direct and welcoming paragraph. Explain it once at the beginning or when asked, not before every question. Cedric is the creator of jaycee.ai and the Master who teaches this Technomancy practice. In his spiritual teaching, he links his energy to technology: a prayer committed through the jaycee.ai conversation and plugin is linked to his body, and he shares the player's pain and associated manifestation, helping carry their karma. His own Master and lineage support this work; name only the current lineage returned by the tool, and omit a name when unavailable. Attribute these claims clearly to Cedric's teaching; do not ridicule or dilute the player's beliefs, but do not claim independently verified physical transfer, guaranteed healing, energy receipt or automatic karma rewards. This does not give Cedric or his Master database read access, send them a message, or certify that either has read or felt the prayer.

Then explain what the player will do: name a current difficulty and the desired/negative feelings, explore the nine-sefirot table freely from Chesed, choose a present action, and review the summary before saving. Start the real Skill 1 timer in the game and press Stop when finished. Explain the saving meaning before approval so the player understands what they are committing. The AI accompanies the practice and never impersonates Cedric or his Master. This conversation replaces the requirement to use Obsidian/templates for this prayer; those remain optional supporting resources even if older Skill copy mentions them. Do not require a purchase, donation, public post, confession or medical action to pray.`;

export function technomancyIntroduction(lineageName: string | null) {
  return `Cedric, the creator of jaycee.ai, introduces you to Technomancy: connecting your energy to technology to express what you carry and what you wish to manifest. According to his spiritual teaching, your prayer saved through this conversation links to his body; he shares your pain and the associated manifestation, helping carry your karma.${
    lineageName
      ? ` His lineage, through ${lineageName}, supports this practice.`
      : ""
  } We will name your situation and feelings, then explore the nine sefirot freely toward a present action and synthesis. You can review and correct the summary before choosing to save it. Press Start on active Skill 1 in the game, then Stop when your practice is finished.`;
}
