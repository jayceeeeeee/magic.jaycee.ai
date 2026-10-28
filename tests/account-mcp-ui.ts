import { ACCOUNT_HTML } from "../supabase/functions/game-mcp/resource-account.generated.ts";
const fixture = {
  kind: "account_state", profile: { id: "owner", username: "Player", full_name: "Current name", master: "master", lore: "My story", manna_target: 100, manna_unit: "EUR", manna_cycle: "year", visibility: false },
  master: { id: "master", username: "Master" }, players: [{ id: "p", user_id: "owner", level: 4 }],
  game: { id: "game", user_id: "owner", ...Object.fromEntries([0, 1, 2, 3, 4].map((n) => [`skill_${n}`, `s${n}`])) },
  skills: [0, 1, 2, 3, 4].map((n) => ({ id: `s${n}`, label: `Skill ${n}`, description: `Description ${n}` })),
  referral_url: "http://localhost:3000/?ref=Player",
};
const html = ACCOUNT_HTML.replace(/<link href="https:\/\/fonts.googleapis.com[^>]+>/g, "").replace("<head>", `<head><script>window.Audio=class extends EventTarget{play(){queueMicrotask(()=>this.dispatchEvent(new Event('ended')));return Promise.resolve();}};window.fetch=async (url,options)=>{window.__upload={url,method:options.method,file:options.body.get('')?.name};return {ok:true};};<\/script>`);
const bridge = `
const state=${JSON.stringify(fixture)},calls=[],contexts=[];
const frame=document.querySelector('iframe');
let reads=0,failSave=true;
window.addEventListener('message',event=>{
  if(event.source!==frame.contentWindow)return;
  const m=event.data,reply=result=>frame.contentWindow.postMessage({jsonrpc:'2.0',id:m.id,result},'*');
  if(m.method==='ui/initialize')reply({protocolVersion:'2026-01-26',hostCapabilities:{},hostInfo:{name:'test',version:'1'}});
  if(m.method==='ui/notifications/initialized')frame.contentWindow.postMessage({jsonrpc:'2.0',method:'ui/notifications/tool-result',params:{structuredContent:{...state,profile:{...state.profile,full_name:'Stale name'}}}},'*');
  if(m.method==='ui/update-model-context'){contexts.push(m.params);reply({});}
  if(m.method==='tools/call'){
    const {name,arguments:args}=m.params;calls.push({name,args});
    if(name==='get_account_state'){reads++;reply({structuredContent:state});}
    if(name==='update_account_profile'){
      if(failSave){failSave=false;reply({isError:true,content:[{type:'text',text:'Could not save. Retry.'}]});return;}
      Object.assign(state.profile,args.updates);state.referral_url='http://localhost:3000/?ref='+encodeURIComponent(state.profile.username);reply({structuredContent:state});
    }
    if(name==='save_account_skills'){state.skills=args.skills.map((s,i)=>({...s,id:'s'+i}));reply({structuredContent:state});}
    if(name==='prepare_account_avatar_upload')reply({structuredContent:{avatar_path:'avatar-00000000-0000-4000-8000-000000000000.png',upload_url:'https://upload.test/signed'}});
  }
});
frame.srcdoc=${JSON.stringify(html).replaceAll("</script", "<\\/script")};`;
const checks = `
const assert=(v,m)=>{if(!v)throw new Error(m);};
const wait=async fn=>{for(let i=0;i<250;i++){if(fn())return;await new Promise(r=>setTimeout(r,20));}throw new Error('Account UI timed out');};
(async()=>{try{
await wait(()=>frame.contentDocument?.querySelector('[name="skill_0_label"]')?.value==='Skill 0');
const doc=frame.contentDocument,field=name=>doc.querySelector('[name="'+name+'"]');
assert(reads===1&&field('full_name').value==='Current name','Cached account data was rendered');
assert(!doc.querySelector('.account-side-panel').inert,'Account panel is not open');
assert(frame.contentWindow.getComputedStyle(doc.body).fontFamily.includes('Rajdhani'),'Shared font missing');
assert(frame.contentWindow.getComputedStyle(doc.querySelector('[data-account-save]')).fontFamily.includes('Rajdhani'),'Save font differs from website');
assert(doc.documentElement.scrollWidth<=frame.clientWidth,'Account overflows mobile width');
assert(doc.querySelector('[data-account-logout]').hidden,'OAuth view must not log out unrelated browser sessions');
assert(!doc.querySelector('.is-maps').hidden&&!doc.querySelector('.is-skills').hidden&&!field('skill_4_label').disabled,'Level 4 unlocks missing');
assert(field('lore').value==='My story'&&field('manna_target').value==='100','Saved account fields missing');
field('username').value='Renamed User';field('full_name').value='Updated name';field('manna_target').value='250';
field('skill_0_label').value='New passive';field('visibility').checked=true;
doc.querySelector('[data-account-save]').click();
await wait(()=>doc.querySelector('[data-account-save-status]').textContent==='Could not save. Retry.');
assert(!doc.querySelector('[data-account-save]').disabled,'Save failed without retry');
assert(calls.findIndex(c=>c.name==='save_account_skills')<calls.findIndex(c=>c.name==='update_account_profile'),'Named skills must save before publication');
doc.querySelector('[data-account-save]').click();
await wait(()=>doc.querySelector('[data-account-save-status]').textContent==='Saved.');
assert(state.profile.full_name==='Updated name'&&state.profile.manna_target===250&&state.profile.visibility,'Account form did not persist');
assert(new URL(doc.querySelector('[data-referral-link]').value).searchParams.get('ref')==='Renamed User','Referral link did not refresh');
await wait(()=>contexts.length>0);
assert(!JSON.stringify(contexts).includes('Updated name'),'Automatic context contains private profile fields');
const transfer=new frame.contentWindow.DataTransfer();transfer.items.add(new frame.contentWindow.File([new Uint8Array([137,80,78,71])],'photo.png',{type:'image/png'}));
field('avatar').files=transfer.files;field('avatar').dispatchEvent(new frame.contentWindow.Event('change'));
doc.querySelector('[data-account-save]').click();
await wait(()=>calls.some(c=>c.name==='update_account_profile'&&c.args.updates.avatar_path));
assert(frame.contentWindow.__upload.method==='PUT'&&frame.contentWindow.__upload.file==='photo.png','Selected file did not upload directly');
await wait(()=>doc.querySelector('[data-account-save-status]').textContent==='Saved.');
// Reopen with a lower-level account and verify the shared panel's gates.
state.players[0].level=1;await new Promise(resolve=>{frame.addEventListener('load',resolve,{once:true});frame.srcdoc=${JSON.stringify(html).replaceAll("</script", "<\\/script")};});
await wait(()=>frame.contentDocument?.querySelector('[data-account-actions]')?.hidden===false);
assert(frame.contentDocument.querySelector('.is-maps').hidden&&frame.contentDocument.querySelector('.is-skills').hidden,'Locked sections are visible at Level 1');
document.body.textContent='PASS: shared Account panel, fonts, fresh data, level unlocks, save failure/retry, skill-before-publication ordering, referral link, photo upload and GPT context.';
}catch(e){document.body.textContent='FAIL: '+e.stack;}})();`;
await Deno.writeTextFile(".tools/account-mcp-browser.html", `<!doctype html><body style="margin:0;background:#05070a"><iframe title="Account" style="width:390px;height:1200px;border:0"></iframe><script>${bridge}${checks}</script></body>`);
await Deno.writeTextFile(".tools/account-mcp-preview.html", `<!doctype html><body style="margin:0;background:#05070a"><iframe title="Account" style="width:430px;height:1700px;border:0"></iframe><script>${bridge}</script></body>`);
