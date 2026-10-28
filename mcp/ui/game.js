import { initJayceePage } from "../../src/js/jaycee/profile-runtime.js";
import "../../src/js/ui-sounds.js";
import { callTool, connect, gameEvent, request } from "./bridge.js";

let snapshot = null, mounted = false;
let mounting = null;
const previews = new Map();
const status = document.getElementById("game-status");
const retry = document.getElementById("game-retry");
const showError = (error) => {
  document.querySelector("[data-profile-shell]").hidden = false;
  status.hidden = false;
  status.textContent = error.message || "The game could not be loaded.";
  retry.hidden = false;
};
const refresh = async () => {
  snapshot = await callTool("get_game_state");
  return snapshot;
};
const profileFor = (id) =>
  [snapshot.profile, snapshot.master, snapshot.lineage, ...snapshot.masters]
    .find((p) => p?.id === id) || null;
const preview = async (profile) => {
  if (profile?.id === snapshot.master?.id) {
    return {
      lore: snapshot.master.lore,
      game: snapshot.master_game,
      skills: snapshot.skills,
    };
  }
  if (!previews.has(profile.id)) {
    previews.set(
      profile.id,
      await callTool("get_master_details", { master_id: profile.id }),
    );
  }
  return previews.get(profile.id);
};
const updateProgress = (response) => {
  if (response.player) {
    snapshot.players = snapshot.players.map((p) =>
      p.id === response.player.id ? response.player : p
    );
  }
  if (Number.isFinite(response.years_burned)) {
    snapshot.profile.years_burned = response.years_burned;
  }
  if (Number.isFinite(response.completed_passive_seconds)) {
    snapshot.completed_passive_seconds = response.completed_passive_seconds;
  }
  return response;
};
const api = {
  // A lineage badge is intentionally a partial profile. Cards need full details.
  fetchMasterDetails: async (_c, master) => preview(master),
  fetchProfileByUserId: async (_c, id) => {
    if (id === snapshot.user.id) return snapshot.profile;
    const known = profileFor(id);
    if (known?.lore !== undefined || id === snapshot.lineage?.id) return known;
    if (known) {
      const details = await preview(known);
      return { ...known, lore: details.lore };
    }
    return null;
  },
  fetchProfileByUsername: async () => null,
  fetchPlayersForUser: async () => snapshot.players,
  fetchPlayerForGame: async (_c, _p, m) =>
    snapshot.players.find((p) => p.master === m.id) || null,
  fetchUserGameSettings: async (_c, p) => (await preview(p)).game,
  fetchSkillsByIds: async (_c, ids) =>
    [
      ...snapshot.skills,
      ...[...previews.values()].flatMap((p) => p.skills || []),
    ].filter((s) => ids?.includes(s.id)),
  fetchPublicProfiles: async () => snapshot.masters,
  fetchAdminProfile: async () =>
    snapshot.masters.find((p) => p.role === "admin") || null,
  getAvatarImageUrl: async (_c, p) =>
    p?.avatarUrl || profileFor(p?.id)?.avatarUrl || "",
  createPlayerForGame: async () => {
    throw new Error("Choose a Master first.");
  },
  switchMaster: async (_c, id) => {
    const r = await callTool(
      snapshot.profile.master ? "change_master" : "select_master",
      { master_id: id },
    );
    await refresh();
    return r.player;
  },
  acceptQuest: async (_c, id, level) =>
    updateProgress(await callTool("accept_quest", { player_id: id, level })),
  syncSkillProgress: async (_c, id) =>
    updateProgress(await callTool("sync_game_progress", { player_id: id })),
  recordSkillPractice: async (_c, _p, session) => {
    if (session.practiceValue === undefined) {
      const player = snapshot.players.find((p) => p.id === session.playerId);
      if (!player) throw new Error("Participation not found. Reload the game.");
      session.practiceValue =
        (Number(player[`skill_${session.skillNumber}_practice`]) || 0) +
        session.totalSeconds;
    }
    return updateProgress(
      await callTool("save_practice", {
        player_id: session.playerId,
        skill_number: session.skillNumber,
        practice_seconds: session.practiceValue,
        started_at: session.questStart,
      }),
    );
  },
};
const notificationFactory = ({ onChange }) => {
  const receipts = new Map();
  const outbox = new Map();
  let inFlight = null;
  let first = true;
  const store = {
    definitions: [],
    error: "",
    storageKey: "mcp-notifications",
    mergeLocal() {},
    receipt(id, occurrence = "once") {
      return receipts.get(JSON.stringify([id, occurrence]));
    },
    async load() {
      try {
        await store.flush();
        if (!first) await refresh();
        first = false;
        store.definitions = snapshot.notifications;
        const previous = new Map(receipts);
        receipts.clear();
        for (const r of snapshot.receipts) {
          const key = JSON.stringify([r.notification_id, r.occurrence]);
          receipts.set(key, { ...r });
        }
        for (const event of outbox.values()) {
          const key = JSON.stringify([event.notification_id, event.occurrence]);
          const field = {
            read: "read_at",
            dismissed: "dismissed_at",
            clicked: "clicked_at",
            completed: "completed_at",
          }[event.action];
          receipts.set(key, {
            ...receipts.get(key),
            [field]: previous.get(key)?.[field] || new Date().toISOString(),
          });
        }
        store.error = "";
        await store.flush();
      } catch (e) {
        store.error = e.message;
      }
      onChange();
    },
    record(id, action, occurrence = "once") {
      const key = JSON.stringify([id, occurrence]),
        old = receipts.get(key) || {};
      const fields = {
        read: "read_at",
        dismissed: "dismissed_at",
        clicked: "clicked_at",
        completed: "completed_at",
      };
      if (old[fields[action]]) return;
      receipts.set(key, { ...old, [fields[action]]: new Date().toISOString() });
      outbox.set(JSON.stringify([id, occurrence, action]), {
        notification_id: id,
        occurrence,
        action,
      });
      void store.flush();
    },
    flush() {
      if (inFlight) return inFlight;
      inFlight = (async () => {
        while (outbox.size) {
          const batch = [...outbox].slice(0, 100);
          await callTool("record_game_notifications", {
            events: batch.map(([, event]) => event),
          });
          for (const [key] of batch) outbox.delete(key);
        }
        store.error = "";
      })().catch((e) => {
        store.error = e.message;
      }).finally(() => {
        inFlight = null;
        onChange();
      });
      return inFlight;
    },
  };
  return store;
};
async function receive(data) {
  if (data?.kind !== "game_state") return;
  if (snapshot && snapshot.user.id !== data.user.id) {
    showError(new Error("The connected account changed. Reopen the game."));
    return;
  }
  if (mounted || mounting) return;
  snapshot = data;
  // Tool output can be replayed from the conversation after a page reload.
  // Never render its old receipts or practice counters before revalidation.
  mounting = refresh();
  try {
    const current = await mounting;
    if (current.user.id !== data.user.id) {
      throw new Error("The connected account changed. Reopen the game.");
    }
  } finally {
    mounting = null;
  }
  mounted = true;
  window.JayceeConfig = { masterAccountIds: snapshot.master_account_ids || {} };
  status.textContent = "";
  status.hidden = true;
  retry.hidden = true;
  await initJayceePage({
    data: api,
    auth: {
      getSupabaseClient: async () => ({ auth: { onAuthStateChange() {} } }),
      getSession: async () => ({ data: { session: { user: snapshot.user } } }),
      checkAccountAccess: async () => {
        const p = snapshot.players.find((p) =>
          p.master === snapshot.profile.master
        );
        try {
          if (p) await api.syncSkillProgress(null, p.id);
        } catch (e) {
          window.dispatchEvent(new Event("pagehide"));
          showError(e);
          throw e;
        }
      },
    },
    notificationFactory,
    practiceCheckpointMs: 10000,
    onGameEvent: (e) => {
      if (e.type.startsWith("practice_")) {
        void request("ui/update-model-context", { structuredContent: e }).catch(
          () => {},
        );
      } else void gameEvent(e);
    },
    onError: (error) => {
      mounted = false;
      showError(error);
    },
  });
}
retry.addEventListener("click", async () => {
  retry.disabled = true;
  try {
    await receive(await refresh());
    window.dispatchEvent(new CustomEvent("jaycee:account-updated"));
    status.textContent = "";
    status.hidden = true;
    retry.hidden = true;
  } catch (e) {
    showError(e);
  } finally {
    retry.disabled = false;
  }
});
connect({
  name: "magic-game",
  onResult: (data) => {
    void receive(data).catch(showError);
  },
  onError: showError,
});
