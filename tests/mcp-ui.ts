import { MASTER_PICKER_HTML } from "../supabase/functions/game-mcp/resource-master-picker.generated.ts";
const master = {
  id: "89cf977d-ecc0-4dbb-8f4f-fe6b9d7067c5",
  username: "Cedric",
  full_name: "Cedric",
  linkLocked: false,
};
const data = {
  requires_master_selection: true,
  masters: [master],
  selection_deadline: new Date(Date.now() + 1000000).toISOString(),
};
const bridge = `const frame=document.querySelector('iframe');
const master=${JSON.stringify(master)};
const data=${JSON.stringify(data)};
let selections=0;
window.addEventListener('message',event=>{
 if(event.source!==frame.contentWindow)return;
 const m=event.data;
 const reply=result=>frame.contentWindow.postMessage({jsonrpc:'2.0',id:m.id,result},'*');
 if(m.method==='ui/initialize')reply({protocolVersion:'2026-01-26',hostCapabilities:{},hostInfo:{name:'test',version:'1'}});
 if(m.method==='ui/update-model-context'||m.method==='ui/message')reply({});
 if(m.method==='ui/notifications/initialized')frame.contentWindow.postMessage({jsonrpc:'2.0',method:'ui/notifications/tool-result',params:{structuredContent:data}},'*');
 if(m.method==='tools/call'){
  if(m.params.name==='get_master_details')reply({structuredContent:{lore:'A shared **Master** story.',game:{skill_0:'s0',skill_1:'s1'},skills:[{id:'s0',label:'Passive',description:'A shared ability.'},{id:'s1',label:'Prayer'}]}});
  if(m.params.name==='select_master'){
   selections++;
   if(selections===1)reply({isError:true,content:[{type:'text',text:'Temporary save failure'}]});
   else reply({structuredContent:{requires_master_selection:false,master_id:master.id,master_name:master.username,player:{id:'player',level:1}}});
  }
  if(m.params.name==='show_master_picker')reply({structuredContent:data});
 }
});
frame.srcdoc=${
  JSON.stringify(MASTER_PICKER_HTML.replace(/<link href="https:\/\/fonts.googleapis.com[^>]+>/g, "")).replaceAll("</script", "<\\/script")
};`;
const checks =
  `const assert=(value,message)=>{if(!value)throw new Error(message)};
const waitFor=async predicate=>{for(let i=0;i<100;i++){if(predicate())return;await new Promise(r=>setTimeout(r,20));}throw new Error('UI timed out');};
(async()=>{try{
 await waitFor(()=>frame.contentDocument?.querySelector('.profile-master-choice'));
 const doc=frame.contentDocument;
 assert(doc.querySelectorAll('.profile-master-choice.is-locked').length>0,'Locked previews missing');
 assert(doc.querySelector('.profile-master-choice.is-locked').disabled,'Locked previews are clickable');
 assert(doc.documentElement.scrollWidth<=frame.clientWidth,'Picker overflows on mobile');
 doc.querySelector('.profile-master-choice:not(:disabled)').click();
 await waitFor(()=>doc.querySelector('.profile-ability-button'));
 assert(doc.querySelector('.profile-master-dialog[open]'),'Shared dialog did not open');
 assert(doc.querySelector('.profile-master-dialog-lore strong')?.textContent==='Master','Markdown did not render safely');
 doc.querySelector('[data-skill-index="0"]').click();
 assert(doc.querySelector('.profile-master-dialog-details').textContent.includes('A shared ability.'),'Shared passive details missing');
 doc.querySelector('.profile-master-dialog-action').click();
 await waitFor(()=>doc.getElementById('status').textContent==='Temporary save failure');
 assert(!doc.querySelector('.profile-master-choice:not(.is-locked)').disabled,'Failed save left picker disabled');
 doc.querySelector('.profile-master-choice:not(:disabled)').click();
 await waitFor(()=>doc.querySelector('.profile-ability-button'));
 doc.querySelector('.profile-master-dialog-action').click();
 await waitFor(()=>doc.getElementById('status').textContent.includes('Level 1 quest has started'));
 assert(selections===2&&!doc.querySelector('.profile-master-choice'),'Successful selection must replace the picker');
 document.body.textContent='PASS: MCP bridge, shared cards/dialog/Markdown/skills, mobile width, failed save recovery and Level 1 selection.';
}catch(error){document.body.textContent='FAIL: '+error.stack;}})();`;
for (
  const [name, test] of [["master-picker-browser.html", true], [
    "master-picker-preview.html",
    false,
  ]] as const
) {
  await Deno.writeTextFile(
    `.tools/${name}`,
    `<!doctype html><body style="margin:0;background:#05070a"><iframe style="width:390px;height:760px;border:0" title="Master picker"></iframe><script>${bridge}${
      test ? checks : ""
    }</script></body>`,
  );
}
