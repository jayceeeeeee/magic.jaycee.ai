import { GAME_HTML } from "../supabase/functions/game-mcp/resource-game.generated.ts";
import { UI_ASSETS } from "../supabase/functions/game-mcp/resource-ui-assets.generated.ts";
import { DEV_MASTER_ACCOUNT_IDS } from "../supabase/functions/game-mcp/master-catalog.js";
const checkpointClock = Deno.args.includes("--checkpoint-clock");
const owner = "11111111-1111-4111-8111-111111111111",
  master = "89cf977d-ecc0-4dbb-8f4f-fe6b9d7067c5",
  playerId = "22222222-2222-4222-8222-222222222222";
const fixture = {
  kind: "game_state",
  master_account_ids: DEV_MASTER_ACCOUNT_IDS,
  user: { id: owner, created_at: new Date().toISOString() },
  profile: {
    id: owner,
    username: "Player",
    master,
    manna_target: 100,
    manna_unit: "EUR",
    manna_cycle: "year",
    years_burned: 0,
  },
  master: {
    id: master,
    username: "Master",
    lore: "Master story",
    master: "0ad611ab-73ad-4ece-a11c-09b13bf5db5d",
  },
  lineage: {
    id: "0ad611ab-73ad-4ece-a11c-09b13bf5db5d",
    username: "Yogananda",
  },
  players: [{
    id: playerId,
    user_id: owner,
    master,
    level: 1,
    skill_1_practice: 0,
    skill_2_practice: 0,
    skill_3_practice: 0,
    skill_1_start: new Date().toISOString(),
    level_2_accepted_at: null,
  }],
  master_game: {
    id: "game",
    user_id: master,
    ...Object.fromEntries([0, 1, 2, 3, 4].map((n) => [`skill_${n}`, `s${n}`])),
  },
  skills: [0, 1, 2, 3, 4].map((n) => ({
    id: `s${n}`,
    label: n === 1 ? "Prayer" : `Ability ${n}`,
    description: `Shared **ability ${n}** description.`,
  })),
  masters: [{ id: master, username: "Master" }, {
    id: "0ad611ab-73ad-4ece-a11c-09b13bf5db5d",
    username: "Yogananda",
  }],
  receipts: [],
  completed_passive_seconds: 0,
  notifications: [
    {
      id: "welcome.v1",
      stage: "account",
      title: "Welcome",
      tone: "notification",
      dismissible: true,
      content: { text: "Already read welcome" },
    },
    {
      id: "choose_master.v1",
      stage: "choose_master",
      title: "Quest",
      tone: "quest",
      content: {
        component: "master_choices",
        text: "Choose your Master. You have {firstActivePassiveTime}.",
      },
    },
    {
      id: "master_linked.v1",
      stage: "linked_master",
      title: "Quest",
      tone: "quest",
      content: { component: "linked_quest" },
    },
    {
      id: "prepare.v1",
      stage: "linked_master",
      title: "Quest",
      tone: "quest",
      content: {
        level: 2,
        action: "accept_quest",
        component: "master_choices",
        text: "Prepare for your next quest.",
      },
    },
  ],
};
const bridge = `const frame=document.querySelector('iframe');let state=${
  JSON.stringify(fixture)
};
let saved=[],messages=[],contexts=[],accepted=0,failSave=${!checkpointClock},gameReads=0,staleFlashes=0;
const cached=structuredClone(state);
state.receipts=[{notification_id:'welcome.v1',occurrence:'once',read_at:new Date().toISOString()}];
window.addEventListener('message',event=>{if(event.source!==frame.contentWindow)return;const m=event.data;
const reply=result=>frame.contentWindow.postMessage({jsonrpc:'2.0',id:m.id,result},'*');
if(m.method==='ui/initialize')reply({protocolVersion:'2026-01-26',hostCapabilities:{},hostInfo:{name:'test',version:'1'}});
if(m.method==='ui/notifications/initialized'){
new MutationObserver(()=>{if(frame.contentDocument.body.textContent.includes('Already read welcome'))staleFlashes++;}).observe(frame.contentDocument.body,{subtree:true,childList:true});
frame.contentWindow.postMessage({jsonrpc:'2.0',method:'ui/notifications/tool-result',params:{structuredContent:cached}},'*');}
if(m.method==='ui/update-model-context'){contexts.push(m.params);reply({});}
if(m.method==='ui/message'){messages.push(m.params);reply({});}
if(m.method==='tools/call'){
const {name,arguments:args}=m.params;
if(name==='get_game_state'||name==='show_game'){gameReads++;setTimeout(()=>reply({structuredContent:state}),75);}
if(name==='sync_game_progress')reply({structuredContent:{player:state.players[0],years_burned:0,completed_passive_seconds:0}});
if(name==='record_game_notifications')reply({structuredContent:{saved:true}});
if(name==='get_master_details')reply({structuredContent:{master_id:args.master_id,lore:'Yogananda **public lore**.',game:Object.fromEntries([0,1,2,3,4].map(n=>['skill_'+n,'y'+n])),skills:[0,1,2,3,4].map(n=>({id:'y'+n,label:'Yogananda ability '+n,description:'Yogananda description '+n}))}});
if(name==='save_practice'){
saved.push(args);
if(failSave){failSave=false;reply({isError:true,content:[{type:'text',text:'Practice could not be saved. Keep the game open and retry.'}]});}
else {state.players[0]={...state.players[0],skill_1_practice:args.practice_seconds,level:${checkpointClock ? 1 : 2}};reply({structuredContent:{player:state.players[0],years_burned:0,completed_passive_seconds:0,completed_occurrence:${checkpointClock ? "null" : "'test'"},completed_skills:${checkpointClock ? "[]" : "[1]"}}});}
}
if(name==='accept_quest'){accepted++;state.players[0]={...state.players[0],level_2_accepted_at:new Date().toISOString(),skill_2_start:new Date().toISOString()};reply({structuredContent:{player:state.players[0],years_burned:0}});}
}});
frame.srcdoc=${
  JSON.stringify(
    GAME_HTML.replace(/<link href="https:\/\/fonts.googleapis.com[^>]+>/g, "")
      .replace(
        "<head>",
        '<head><script>window.__played=[];window.Audio=class extends EventTarget{constructor(src){super();this.src=src;}play(){window.__played.push(this.src);queueMicrotask(()=>this.dispatchEvent(new Event("ended")));return Promise.resolve();}};<\/script>',
      ),
  ).replaceAll("</script", "<\\/script")
};`;
const checks = `const assert=(v,m)=>{if(!v)throw new Error(m)};
const wait=async fn=>{for(let i=0;i<600;i++){if(fn())return;await new Promise(r=>setTimeout(r,30));}throw new Error('Game UI timed out');};
(async()=>{try{
await wait(()=>frame.contentDocument?.querySelector('[data-skill-index="1"]'));
const doc=frame.contentDocument;
assert(gameReads>=1&&staleFlashes===0&&!doc.body.textContent.includes('Already read welcome'),'Cached notification flashed before fresh receipts loaded');
assert(!doc.querySelector('[data-profile-shell]').hidden,'Game is hidden');
assert(doc.querySelector('.profile-player-level').textContent==='Player - Level 1','Shared profile missing');
assert(doc.querySelector('.profile-notice-panel').textContent.includes('Prayer'),'Shared current quest missing');
assert(frame.contentWindow.getComputedStyle(doc.body).fontFamily.includes('Rajdhani'),'Game font was replaced');
assert(doc.documentElement.scrollWidth<=frame.clientWidth,'Game overflows mobile viewport');
doc.querySelector('[data-skill-index="1"]').click();
assert(frame.contentWindow.__played.at(-1)===${
  JSON.stringify(UI_ASSETS["/src/assets/sounds/first_click_skill.mp3"])
},'Skill button click sound missing');
assert(doc.querySelector('.profile-skill-description strong')?.textContent==='ability 1','Shared Markdown missing');
await doc.fonts.ready;
assert(frame.contentWindow.getComputedStyle(doc.querySelector('[data-practice-toggle="1"]')).fontFamily.includes('Rajdhani'),'Start/Stop font must match the shared app font');
doc.querySelector('[data-practice-toggle="1"]').click();
assert(frame.contentWindow.__played.at(-1)===${
  JSON.stringify(UI_ASSETS["/src/assets/sounds/start_skill.mp3"])
},'Start sound missing');
await new Promise(r=>setTimeout(r,200));
assert(doc.querySelector('[data-practice-toggle="1"]').textContent==='Stop','Start did not start the timer');
if (${checkpointClock}) {
  await new Promise(r=>setTimeout(r,11000));
  const using=doc.querySelector('[data-skill-index="1"]').dataset.state;
  assert(/^Using · 11s$/.test(using),'Using reset at the ten-second checkpoint: '+using);
  assert(saved.length===1&&saved[0].practice_seconds>=9&&saved[0].practice_seconds<11,'Checkpoint did not save its measured slice');
  doc.querySelector('[data-practice-toggle="1"]').click();
  await wait(()=>saved.length===2);
  assert(saved[1].practice_seconds>=11&&saved[1].practice_seconds<13,'Stop lost or double-counted checkpointed practice');
  document.body.textContent='PASS: Using clock continues past the MCP checkpoint and saved practice remains exact.';
  return;
}
doc.querySelector('[data-practice-toggle="1"]').click();
assert(frame.contentWindow.__played.at(-1)===${
  JSON.stringify(UI_ASSETS["/src/assets/sounds/first_click_skill.mp3"])
},'Stop must use the normal click sound');
await wait(()=>doc.querySelector('.profile-practice-status')?.textContent.includes('could not be saved'));
assert(saved.length===1&&saved[0].practice_seconds>0&&saved[0].practice_seconds<3,'Timer fabricated practice time');
// The regular ten-second checkpoint retries the exact pending counter.
await wait(()=>doc.querySelector('.profile-player-level')?.textContent==='Player - Level 2');
assert(saved.length===2&&saved[0].practice_seconds===saved[1].practice_seconds,'Failed save retry double-counted practice');
await wait(()=>messages.some(m=>m.content[0].text.includes('level_changed')));
const yogananda=[...doc.querySelectorAll('.profile-master-choice')].find(b=>!b.disabled&&b.getAttribute('aria-label').includes('Yogananda'));
assert(yogananda,'Level 2 Master preview missing');yogananda.click();
await wait(()=>doc.querySelector('.profile-master-dialog-lore')?.textContent.includes('public lore'));
assert(doc.querySelector('.profile-master-dialog-lore strong')?.textContent==='public lore','Lineage profile replaced the full Master lore');
assert(doc.querySelector('.profile-master-dialog [data-skill-index="0"]').dataset.skillLabel==='Yogananda ability 0','Master preview mixed ability data');
doc.querySelector('.profile-master-dialog-close').click();
const accept=[...doc.querySelectorAll('.profile-play-button')].find(b=>b.textContent==='Accept');
assert(accept,'Next quest acceptance missing');accept.click();
await wait(()=>accepted===1&&messages.some(m=>m.content[0].text.includes('quest_accepted')));
assert(contexts.length>=2,'Important actions did not update GPT context');
assert(doc.querySelector('.profile-notice-panel').textContent.includes('Ability 2'),'Accepted quest did not update in place');
document.body.textContent='PASS: complete shared game, fonts, quest/profile, Start/Stop, failed save retry, level progression, quest acceptance and GPT follow-up.';
}catch(e){document.body.textContent='FAIL: '+e.stack;}})();`;
await Deno.writeTextFile(
  ".tools/game-mcp-browser.html",
  `<!doctype html><meta charset="utf-8"><body style="margin:0;background:#05070a"><iframe title="Game" style="width:390px;height:1000px;border:0"></iframe><script>${bridge}${checks}</script></body>`,
);
await Deno.writeTextFile(
  ".tools/game-mcp-preview.html",
  `<!doctype html><meta charset="utf-8"><body style="margin:0;background:#05070a"><iframe title="Game" style="width:390px;height:1000px;border:0"></iframe><script>${bridge}</script></body>`,
);
