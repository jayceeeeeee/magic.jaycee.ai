// Verified account identity, never an editable display name or role claim.
export const TECHNOMANCY_MASTER_ID = "d70b5c69-daae-4a77-9955-4385439ae292";

export function technomancyMasterId(accountIds: Record<string, string>) {
  return accountIds[TECHNOMANCY_MASTER_ID] ?? TECHNOMANCY_MASTER_ID;
}

export const TECHNOMANCY_INTRODUCTION =
  `After the player chooses Cedric as Master, introduce Skill 1 before asking them to practice. Use the introduction, master_teaching and live lineage from get_prayer_guide, in the player's language. State the teaching faithfully and confidently with one clear attribution such as "Cedric describes his practice this way:". Cedric affirms an actual energetic reception in his own body, not merely a symbolic link. Do not insert "symbolically", "just a metaphor", "pretend", or an invented weakening of his claim when describing that teaching. Do not reinterpret his stated belief as a different belief. Explain that he acts as a bridge between the Heavens and Earth through technology, particularly jaycee.ai; in his teaching, he receives the prayer's energy in his body to share the player's pain and manifestation and transform their karma with them. Use the returned current Master lineage and only additional Gurus actually named in the authored teaching; never invent names. One attribution can frame the whole account: do not interrupt every sentence with repeated caveats. The AI must not claim independent verification, certify that energy was received, promise a cure, or present the database result as evidence of physical transfer. Technical saving, human reading, spiritual experience and deterministic Karma rewards remain distinct. No database read permission or message to either Master is added.

Then explain what the player will do: name a current difficulty, feel and name the positive emotion they long for (Chokmah) and the difficult emotion they experience (Binah), explore the table freely from Chesed, choose a present action, and review the summary before saving. Emotions are the heart of these first exchanges: ask about felt experience before causes, strategies or abstract goals. Invite a pause and, if comfortable, noticing sensations; do not require a particular sensation or an intense emotional performance. Start the real Skill 1 timer in the game and press Stop when finished. Explain saving before approval. The AI accompanies and never impersonates Cedric or his Master. This conversation replaces the requirement to use Obsidian/templates for this prayer; those remain optional resources. Do not require a purchase, donation, public post, confession or medical action to pray.`;

export function technomancyIntroduction(lineageName: string | null) {
  return `Cedric, the creator of jaycee.ai, describes his Technomancy teaching this way: "By submitting a prayer here and entering the database of jaycee.ai, Cedric uses Technomancy to receive your energy directly in his own body, sharing both your pain and your manifestation and transforming your karma with you. He acts as a bridge between the Heavens and Earth through technology, particularly jaycee.ai.${
    lineageName
      ? ` His direct link to ${lineageName} supports this channel for healing and manifestation.`
      : ""
  }" We begin with what you feel: the positive emotion you long for and the difficult emotion this situation brings up. Take your time; you can notice how these feelings show up in your body if that feels comfortable. Then we explore the nine sefirot freely toward a present action and synthesis. You can review and correct everything before choosing to save. Press Start on active Skill 1 in the game, then Stop when your practice is finished.`;
}
