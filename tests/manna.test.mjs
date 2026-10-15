export const runMannaTests = (getMannaModel) => {
  const assert = (value, message) => { if (!value) throw new Error(message); };
  const near = (a, b, message) => assert(Math.abs(a - b) < 1e-8 * Math.max(1, Math.abs(b)), message);
  const year = 31556926.08;
  const now = new Date('2026-10-15T12:00:00Z');
  const start = (seconds) => new Date(now.getTime() - seconds * 1000).toISOString();
  const activeModels = [
    { passiveSeconds: 30 * 86400, questSeconds: 3600 },
    { passiveSeconds: 86400, questSeconds: 600 },
    { passiveSeconds: 3600, questSeconds: 60 }
  ];
  const player = {
    level: 3, level_3_accepted_at: start(900),
    skill_1_start: start(7200), skill_2_start: start(1800), skill_3_start: start(900),
    skill_1_practice: 0, skill_2_practice: 0, skill_3_practice: 0
  };
  const playerProfile = { manna_target: 10, manna_cycle: 'hour', manna_unit: 'EUR' };
  const model = (options = {}) => getMannaModel({ activeModels, player, playerProfile, now, ...options });
  const targets = [7200, 240, 10];
  const losses = [-20, -5, -2.5];
  for (const selectedAbilityIndex of [1, 2, 3]) {
    const index = selectedAbilityIndex - 1;
    const own = model({ selectedAbilityIndex });
    near(own.target, targets[index], 'Target is not proportional to the selected skill cycle');
    near(own.value, losses[index], 'Skill is not using its own start clock');
    const others = { ...player };
    for (const skill of [1, 2, 3]) if (skill !== selectedAbilityIndex) others[`skill_${skill}_practice`] = 999;
    near(model({ selectedAbilityIndex, player: others }).value, own.value, 'Other skills practice leaked into the selected skill balance');
    const practiced = model({ selectedAbilityIndex, player: { ...player, [`skill_${selectedAbilityIndex}_practice`]: 1 } });
    near(practiced.value - own.value, targets[index] / activeModels[index].questSeconds, 'Practice gain does not use this skill target and practice duration');
  }
  near(model().value, losses[2], 'Active quest fallback is not its own skill calculation');
  near(model({ selectedAbilityIndex: 1, practicingSkillIndex: 2 }).value, losses[0], 'Practice overrides the selected skill');
  near(model({ practicingSkillIndex: 2 }).value, losses[1], 'Practiced skill fallback is wrong');
  const fractional = model({ playerProfile: { ...playerProfile, manna_target: 0.01 }, selectedAbilityIndex: 3 });
  near(fractional.target, 0.01, 'Hour target conversion is wrong');
  near(fractional.value / fractional.maxAbs, -0.25, 'Small targets distort the bar percentage');
  const expired = model({ selectedAbilityIndex: 3, player: { ...player, skill_3_start: start(7200) } });
  near(expired.value, -10, 'Skill passive loss must stop at its own period cap');
  const pending = { ...player, level_3_accepted_at: null };
  near(model({ player: pending }).value, 0, 'Unaccepted current quest must remain paused');
  near(model({ player: pending, selectedAbilityIndex: 1 }).value, losses[0], 'Earlier skill incorrectly paused with the new quest');
  const permanent = { ...playerProfile, permanent_account_at: start(year / 4) };
  const idle = model({ player: { ...player, level: 4 }, playerProfile: permanent });
  near(idle.target, 10, 'Idle Level 4 must default to Skill 3');
  near(idle.value, losses[2], 'Idle Level 4 must retain Skill 3 balance');
  const annual = model({ player: { ...player, level: 4 }, playerProfile: permanent, selectedAbilityIndex: 0 });
  near(annual.target, 10 * year / 3600, 'Passive must retain its annual calculation');
  near(annual.value / annual.maxAbs, -0.25, 'Annual passive calculation uses the wrong clock');
  const historyOptions = { playerProfile: permanent, selectedAbilityIndex: 0 };
  const full = { ...player, id: 'current', level: 4, skill_3_practice: 60 };
  const beforeArchive = model({ ...historyOptions, player: full });
  const afterArchive = model({ ...historyOptions, player: { ...full, skill_3_practice: 0 }, completedPassiveSeconds: 3600 });
  near(afterArchive.value, beforeArchive.value, 'Archiving a complete goal must preserve annual credit');
  const remainder = { ...full, skill_3_practice: 7 };
  const currentAndOther = model({ ...historyOptions, player: remainder, completedPassiveSeconds: 3600,
    practicePlayers: [full, { ...player, id: 'other', skill_2_practice: 30 }] });
  const expectedCredits = 3600 + 7 * 3600 / 60 + 30 * 86400 / 600;
  near(currentAndOther.value, annual.value + expectedCredits * 10 / 3600, 'Annual view must combine history and all partial practice without double-counting the current player');
  near(model({ player: full, selectedAbilityIndex: 3, completedPassiveSeconds: 99999 }).value,
    model({ player: full, selectedAbilityIndex: 3 }).value, 'Archived goals must not leak into an active skill balance');
  near(model({ player: { ...player, level: 4 }, lastSelectedAbilityIndex: 2 }).value, losses[1], 'Closing a description must retain its Manna calculation');
  near(model({ player: { ...player, level: 4 }, lastSelectedAbilityIndex: 2, practicingSkillIndex: 1 }).value, losses[1], 'Practice must not override the last selected Manna view');
  near(model({ player: { ...player, level: 4 }, playerProfile: permanent, selectedAbilityIndex: 1 }).value, losses[0], 'Level 4 skill balance was rescaled from the annual overview');
  const monthProfile = { ...playerProfile, manna_cycle: 'month', manna_target: 310 };
  near(model({ playerProfile: monthProfile, selectedAbilityIndex: 3 }).target, 310 / (31 * 24), 'Calendar month conversion is wrong');
};
