# Browser regression suite. Run from the repository root with Chrome installed.
# Uses mocks; writes only to TEMP and never connects to Supabase.
$ErrorActionPreference = 'Stop'
$checkDir = Join-Path $env:TEMP ('jaycee-browser-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $checkDir | Out-Null
function Read-BrowserSource($path) {
  return ((Get-Content -LiteralPath $path -Raw -Encoding UTF8) -replace '(?s)import\s+.*?from\s+["''][^"'']+["''];', '').Replace('export ', '')
}
$syntaxSources = ConvertTo-Json -InputObject @(Get-ChildItem -LiteralPath 'src/js' -Recurse -Filter '*.js' | Where-Object { $_.FullName -notmatch '[\\/]vendor[\\/]' } | ForEach-Object {
  @{ name = $_.Name; source = Read-BrowserSource $_.FullName }
}) -Depth 3 -Compress
$prelude = (Read-BrowserSource 'src/js/config/game-config.js') + (Read-BrowserSource 'src/js/jaycee/notifications.js')
$prelude += Read-BrowserSource 'tests/manna.test.mjs'
$prelude += Read-BrowserSource 'tests/quest-lock-auth.test.mjs'
$prelude += Read-BrowserSource 'tests/menu-sounds.test.mjs'
$prelude += Read-BrowserSource 'tests/referrals.test.mjs'
$prelude += Read-BrowserSource 'tests/invite-password.test.mjs'
$authSource = ConvertTo-Json -InputObject ([string](Get-Content 'src/js/auth/auth.js' -Raw -Encoding UTF8)) -Compress
$checks = ''
foreach ($path in @('tests/notifications.test.mjs', 'tests/level-two-quest.test.mjs', 'tests/level-three-quest.test.mjs', 'tests/level-four.test.mjs')) {
  $checks += "`nawait (async()=>{`n" + (Read-BrowserSource $path) + "`n})();`n"
}
$runtime = ConvertTo-Json -InputObject ((Read-BrowserSource 'src/js/jaycee/profile-runtime.js') + "`nreturn {createVitalsPanel,createSkillPanel,getActiveQuestInfo,getMannaModel};") -Compress
$editor = ConvertTo-Json -InputObject ((Read-BrowserSource 'src/js/jaycee/game-editor.js') + "`nreturn createSkillsSection;") -Compress
$accountSource = Read-BrowserSource 'src/js/jaycee/account.js'
$accountSource = $accountSource.Substring(0, $accountSource.LastIndexOf('if (document.readyState'))
$account = ConvertTo-Json -InputObject ($accountSource + "`nreturn initJayceeAccountPage;") -Compress
$browser = @'
const assert=(value,message)=>{if(!value)throw new Error(message)};
const syntaxSources=SYNTAX_SOURCES;
for(const file of syntaxSources){try{new Function(file.source.replace(/\bimport\.meta\b/g,'({url:"file:///syntax-check.js"})'));}catch(error){throw new Error(`${file.name}: ${error.message}`);}}
const coreSource=syntaxSources.find(file=>file.name==='profile-core.js').source;
const core=new Function(coreSource+'\nreturn {createJayceeState,drawJaycee};')();
const coreCanvas=document.createElement('canvas');coreCanvas.style.width='200px';coreCanvas.style.height='200px';document.body.append(coreCanvas);
core.drawJaycee(coreCanvas,core.createJayceeState());assert(coreCanvas.width>0,'Core canvas did not render');coreCanvas.remove();
await runQuestLockAuthTests(AUTH_SOURCE);
await runInvitePasswordTests(syntaxSources.find(file=>file.name==='invite.js').source);
await runReferralTests({referralSource:syntaxSources.find(file=>file.name==='referral.js').source,authSource:AUTH_SOURCE,dataSource:syntaxSources.find(file=>file.name==='data.js').source});
await runMenuSoundTests({indexSource:syntaxSources.find(file=>file.name==='index.js').source,loreSource:syntaxSources.find(file=>file.name==='lore.js').source,uiSource:syntaxSources.find(file=>file.name==='ui-sounds.js').source,audioSource:syntaxSources.find(file=>file.name==='sounds.js').source});
const display=value=>String(value??'').trim();
const runtime=new Function('JAYCEE_GAME_CONFIG','getDisplayValue','isQuestPending','notificationOccurrence','isNotificationVisible','interpolateNotification','renderSkillMarkdown',RUNTIME)(JAYCEE_GAME_CONFIG,display,isQuestPending,notificationOccurrence,isNotificationVisible,interpolateNotification,(element,markdown)=>{element.textContent=markdown});
runMannaTests(runtime.getMannaModel);
const models=[1,2,3].map(level=>({skillLabel:`Skill ${level}`,skill:{id:level},passiveSeconds:100,questSeconds:20}));
const definitions=[{id:'level_three_prepare.v1',stage:'linked_master',title:'Quest',tone:'quest',content:{level:3,occurrence:'level',action:'accept_quest',component:'master_choices',text:['Review {passiveSkillName} and {skillTwoName}.','In the meantime practice {skillOneName}.','Catalog switch explanation.']}},{id:'master_linked.v1',stage:'linked_master',title:'Quest',tone:'quest',content:{component:'linked_quest'}}];
let accepted=0,switched;
const masterIds={cedricjbt:'d70b5c69-daae-4a77-9955-4385439ae292',yogananda:'b7a38b31-100f-4e03-b3e8-9357c635ecf8',jesus:'7abd58ec-1289-403d-932c-dc2df233d079'};
const player={id:'player',user_id:'user',master:'old',level:3,level_3_accepted_at:null};
const options={activeModels:models,player,playerProfile:{id:'user',username:'User'},activeMasterProfile:{id:'old'},passiveSkillName:'Passive',notifications:{definitions,receipt(){},record(){}},sounds:{play(){}},publicProfiles:[{id:'user',username:'Self'},{id:'old',username:'Old'},{id:masterIds.cedricjbt,username:'Cedricjbt'}],onAcceptQuest:()=>accepted++,onAcceptMaster:master=>switched=master.id};
const originalUI=window.JayceeUI;
const guestSliderOptions={...options,player:null,playerProfile:null,activeMasterProfile:null,notifications:{...options.notifications,definitions:[{id:'masters_present.v1',stage:'guest',title:'Notification',content:{component:'masters',text:['Custom guest introduction.','Another paragraph.']}}]}};
const guestSlider=runtime.createVitalsPanel(guestSliderOptions);
assert(guestSlider.textContent.includes('Custom guest introduction.')&&guestSlider.textContent.includes('Another paragraph.')&&!guestSlider.textContent.includes("You're in luck"),'Guest slider intro did not come from the catalog');
const silentSlider=runtime.createVitalsPanel({...guestSliderOptions,notifications:{...options.notifications,definitions:[{id:'masters_present.v1',stage:'guest',content:{component:'masters'}}]}});
assert(silentSlider.querySelector('.profile-masters-carousel')&&!silentSlider.textContent.includes("You're in luck"),'Slider inserted hardcoded intro when catalog text was absent');
const previousPlayerName=window.localStorage.getItem('player_full_name');
window.localStorage.setItem('player_full_name','Cédric');
const unnamedPlayerPanel=runtime.createVitalsPanel({...options,playerProfile:{id:'user',username:'  ',full_name:null}});
assert(unnamedPlayerPanel.querySelector('.profile-player-level').textContent.startsWith('Unknown - Level'),'Unnamed account reused a previous browser name');
const fullNamePlayerPanel=runtime.createVitalsPanel({...options,playerProfile:{id:'user',username:null,full_name:'Actual Name'}});
assert(fullNamePlayerPanel.querySelector('.profile-player-level').textContent.startsWith('Actual Name - Level'),'Full name fallback was lost');
if(previousPlayerName===null)window.localStorage.removeItem('player_full_name');else window.localStorage.setItem('player_full_name',previousPlayerName);
const unnamedMasterPanel=runtime.createVitalsPanel({...options,adminProfile:{id:'admin',username:null,full_name:null},notifications:{...options.notifications,definitions:[{id:'unknown_master.v1',stage:'linked_master',content:{component:'karma_master'}}]}});
assert(unnamedMasterPanel.querySelector('.profile-notice-master-name')?.textContent==='Unknown','Unnamed Master still displays a hardcoded name');
let finishAcceptClick,signupRedirects=0;
const acceptClickDone=new Promise(resolve=>{finishAcceptClick=resolve;});
window.JayceeUI={waitForSound:()=>acceptClickDone};
const signupPanel=runtime.createVitalsPanel({...options,player:null,playerProfile:null,activeMasterProfile:null,
  notifications:{...options.notifications,definitions:[{id:'create_account.v1',stage:'guest',content:{action:'signup'}}]},
  sounds:{play(){throw new Error('Accept played a second sound over the shared click');}},onPlay:()=>signupRedirects++});
const firstAccept=signupPanel.querySelector('.profile-play-button');firstAccept.click();firstAccept.click();
await new Promise(resolve=>setTimeout(resolve,0));assert(signupRedirects===0&&firstAccept.disabled,'First Accept redirected before its sounds finished');
finishAcceptClick();await new Promise(resolve=>setTimeout(resolve,0));assert(signupRedirects===1,'First Accept did not continue once after its shared sound finished');
window.JayceeUI=originalUI;
const selectionStart=new Date().toISOString();
const selectionOptions={...options,player:null,activeMasterProfile:null,accountCreatedAt:selectionStart,notifications:{...options.notifications,definitions:[{id:'choose_master.v1',stage:'choose_master',content:{component:'master_choices'}}]}};
const selection=runtime.createVitalsPanel(selectionOptions);
assert(Number(selection.querySelector('[data-quest-deadline]').dataset.questDeadline)===Date.parse(selectionStart)+JAYCEE_GAME_CONFIG.activeAbilities[0].cycleSeconds*1000,'First selection countdown must use the Moon cycle');
const restartedStart=new Date(Date.parse(selectionStart)+60000).toISOString();
const restarted=runtime.createVitalsPanel({...selectionOptions,playerProfile:{...options.playerProfile,master_selection_started_at:restartedStart}});
assert(Number(restarted.querySelector('[data-quest-deadline]').dataset.questDeadline)===Date.parse(restartedStart)+JAYCEE_GAME_CONFIG.activeAbilities[0].cycleSeconds*1000,'Countdown must reflect administrator unlock');
const before=runtime.createVitalsPanel(options);
assert(before.querySelectorAll('[data-notification-key]').length===1,'Quest visible before acceptance');
assert(before.querySelectorAll('em').length===3,'Skill names are not italic');
const thirdSkillNotice={id:'third_skill_test',stage:'linked_master',content:{text:['Practice {skillThreeName}.']}};
const thirdSkillPanel=runtime.createVitalsPanel({...options,notifications:{...options.notifications,definitions:[thirdSkillNotice]}});
assert(thirdSkillPanel.querySelector('em')?.textContent==='Skill 3'&&!thirdSkillPanel.textContent.includes('{skillThreeName}'),'Third skill name was not interpolated in italics');
const fourthSkillNotice={id:'fourth_skill_test',stage:'linked_master',content:{text:['Discover {skillFourName}.']}};
const fourthSkillOptions={...options,ultimateModel:{skillLabel:'Master Ultimate'},notifications:{...options.notifications,definitions:[fourthSkillNotice]}};
const fourthSkillPanel=runtime.createVitalsPanel(fourthSkillOptions);
assert(fourthSkillPanel.querySelector('em')?.textContent==='Master Ultimate'&&!fourthSkillPanel.textContent.includes('{skillFourName}'),'Ultimate name was not interpolated in italics');
const unnamedUltimate=runtime.createVitalsPanel({...fourthSkillOptions,ultimateModel:{skillLabel:''}});
assert(unnamedUltimate.querySelector('em')?.textContent==='your ultimate skill','Missing Ultimate name has no fallback');
assert(before.textContent.includes('Catalog switch explanation.')&&!before.textContent.includes('Or you can choose to link yourself to another Master.'),'Slider explanation did not come from catalog text');
assert(before.querySelectorAll('.profile-master-choice').length>0,'Missing carousel');
before.querySelector('.profile-master-choice').click();assert(switched===masterIds.cedricjbt,'Wrong Master selected');
const lockedChoices=runtime.createVitalsPanel({...options,publicProfiles:[{id:masterIds.jesus,username:'Jesus'},{id:masterIds.cedricjbt,username:'Cedricjbt'},{id:masterIds.yogananda,username:'Yogananda'},{id:'other',username:'Other Master'}]});
assert(!lockedChoices.textContent.includes('Other Master'),'Slider exposed a profile outside its temporary lineup');
for(const name of ['Jesus']){
  const choices=[...lockedChoices.querySelectorAll('.profile-master-choice')].filter(choice=>choice.textContent.includes(name));
  assert(choices.length>0,`${name} missing from carousel`);
  for(const choice of choices){
    assert(choice.disabled&&choice.querySelector('.profile-master-lock-icon'),`${name} missing lock`);
    switched=null;choice.click();assert(switched===null,`${name} can still be linked`);
  }
}
lockedChoices.querySelector('.profile-master-choice:not(:disabled)').click();assert(switched===masterIds.cedricjbt,'Available Master cannot be linked');
const renamed=runtime.createVitalsPanel({...options,publicProfiles:[{id:masterIds.jesus,username:'Renamed Jesus'},{id:masterIds.cedricjbt,username:'Renamed Cedric'},{id:masterIds.yogananda,username:'Renamed Yogananda'},{id:'impostor',username:'Jesus'}]});
const primaryChoices=[...renamed.querySelectorAll('.profile-master-choice:not([aria-hidden="true"])')];
assert(primaryChoices.length===3,'UUID lineup changed after a username change or accepted a matching username');
assert(primaryChoices[0].disabled&&!primaryChoices[1].disabled&&!primaryChoices[2].disabled,'UUID locks changed after a username change');
primaryChoices[1].click();assert(switched===masterIds.cedricjbt,'Renamed Master cannot be linked by UUID');
const withReferral={...options,playerProfile:{...options.playerProfile,referrer_id:'inviter'},publicProfiles:[...options.publicProfiles,{id:'inviter',username:'Inviting Master',visibility:true},{id:'stranger',username:'Stranger',visibility:true}]};
const referredPanel=runtime.createVitalsPanel(withReferral);
assert(referredPanel.textContent.includes('Inviting Master')&&!referredPanel.textContent.includes('Stranger'),'Referral slider did not add only the saved public referrer');
const hiddenReferrer=runtime.createVitalsPanel({...withReferral,publicProfiles:options.publicProfiles});
assert(!hiddenReferrer.textContent.includes('Inviting Master'),'Slider exposed a referrer excluded by public discovery');
before.querySelector('.profile-play-button').click();assert(accepted===1,'Accept is broken');
const active={...player,level_3_accepted_at:'2026-10-15T00:00:00Z',skill_3_start:'2026-10-15T00:00:00Z'};
const after=runtime.createVitalsPanel({...options,player:active});assert(!after.textContent.includes('Catalog switch explanation.'),'Switching remains after Accept');
assert([...after.querySelectorAll('.profile-notice-copy em')].some(element=>element.textContent==='Skill 3'),'Active quest skill name is not italicized');
assert(runtime.getActiveQuestInfo({activeModels:models,player}).deadline===null,'Pending Level 3 clock runs');
assert(runtime.getActiveQuestInfo({activeModels:models,player:active}).deadline!==null,'Accepted Level 3 clock missing');
for(const row of [player,active]){const skills=runtime.createSkillPanel({activeModels:models,currentLevel:3,passiveModel:{skill:null},player:row,selectedIndex:3});assert(skills.querySelector('[data-practice-toggle]').disabled===isQuestPending(row),'Wrong practice availability');}
let savePayload;
let saveOrder=[];
const createSkillsSection=new Function('fetchUserGameSettings','fetchSkillsByIds','saveOwnGame','JAYCEE_GAME_SKILL_COLUMNS',EDITOR)(async()=>({skill_4:'ultimate'}),async()=>[{id:'ultimate',label:'Existing ultimate',description:'Keep these resources'}],async(...args)=>{savePayload={skills:args[1],argumentCount:args.length};saveOrder.push('skills')},JAYCEE_GAME_SKILL_COLUMNS);
const profile={id:'user',master:'old',username:'User'};
window.JayceeReferral={createLink:username=>username?`https://example.test/?ref=${encodeURIComponent(username)}`:'',getUsername:()=>''};
const editor=createSkillsSection({client:{},profile,createSection:()=>{const section=document.createElement('section'),content=document.createElement('div');section.append(content);return{section,content}}});
assert(editor.section.hidden,'Skills visible before unlock');editor.setUnlocked(true);document.body.append(editor.section);await new Promise(resolve=>setTimeout(resolve,10));
assert(!editor.section.querySelector('input[type=checkbox]'),'User can change visibility');
assert(!editor.section.querySelector('button[type=submit]'),'Separate game Save button still present');
const selector=editor.section.querySelector('select');
assert(selector.options.length===5&&selector.options[4].disabled&&selector.options[4].textContent.includes('Locked'),'Ultimate is not locked in the selector');
assert(editor.section.querySelector('[name=skill_4_label]').disabled,'Ultimate has editable controls below Level 4');
assert([...editor.section.querySelectorAll('.profile-game-skill')].filter(group=>!group.hidden).length===1,'More than one skill visible');
editor.section.querySelector('[name=skill_1_description]').value='Resources without a skill name';assert(editor.getUpdates().error,'Description without a name accepted');
editor.section.querySelector('[name=skill_0_label]').value='My passive';editor.section.querySelector('[name=skill_1_label]').value='My first skill';editor.section.querySelector('[name=skill_1_description]').value='[Resources](https://example.com)';
selector.value='0';selector.dispatchEvent(new Event('change'));selector.value='1';selector.dispatchEvent(new Event('change'));
assert(editor.section.querySelector('[name=skill_1_label]').value==='My first skill','Selection change lost draft edits');
const description=editor.section.querySelector('[name=skill_1_description]');
assert(description.rows===1&&description.placeholder==='Put your skill description in markdown format.','Description field is not compact');
description.value='Long description\n'.repeat(30);description.dispatchEvent(new Event('input'));
assert(parseFloat(description.style.height)<=200&&parseFloat(description.style.height)>36,'Description did not grow within its cap');
description.value='[Resources](https://example.com)';description.dispatchEvent(new Event('input'));
await editor.save(editor.getUpdates().skills);assert(savePayload?.skills.length===5&&savePayload.argumentCount===2,'Game save must not submit visibility');
assert(savePayload.skills[4].label==='Existing ultimate'&&savePayload.skills[4].description==='Keep these resources','Saving changed the locked Ultimate');
assert(editor.getUpdates().skills===null,'Unchanged skills would be saved again');
assert(!Object.hasOwn(profile,'visibility'),'Game save modified profile visibility');
assert(savePayload.skills[1].description.includes('Resources'),'Resource text lost');
editor.setUnlocked(true,4);assert(!selector.options[4].disabled,'Ultimate editor did not unlock at Level 4');
selector.value='4';selector.dispatchEvent(new Event('change'));assert(!editor.section.querySelector('[name=skill_4_label]').disabled,'Ultimate inputs remain disabled at Level 4');
editor.section.querySelector('[name=skill_4_label]').value='My ultimate';await editor.save(editor.getUpdates().skills);assert(savePayload.skills[4].label==='My ultimate','Ultimate edits not saved');
const levelFour={...active,level:4};
const permanentNotice=runtime.createVitalsPanel({...options,player:levelFour,activeMasterProfile:{id:'old',username:'My Master',avatarUrl:'https://example.com/avatar.png'},notifications:{...options.notifications,definitions:[{id:'level_four_permanent.v1',stage:'linked_master',content:{level:4,text:'Permanently linked to {masterName}.'}}]}});
assert(permanentNotice.querySelector('.profile-notice-master-card')?.textContent==='My Master'&&permanentNotice.querySelector('.profile-notice-master-avatar img')?.getAttribute('src')==='https://example.com/avatar.png'&&!permanentNotice.textContent.includes('{masterName}'),'Permanent account notice must render Master name and picture as a profile card');
const ultimate=runtime.createSkillPanel({activeModels:models,currentLevel:4,passiveModel:{skill:null},ultimateModel:{skillLabel:'Ultimate',skillDescription:'Permanent ultimate description'},player:levelFour,selectedIndex:4});
assert(ultimate.textContent.includes('Permanent ultimate description')&&!ultimate.querySelector('[data-practice-toggle]')&&!ultimate.querySelector('[data-quest-deadline]'),'Ultimate is not description-only');
assert(!ultimate.querySelector('[data-skill-index="4"]').disabled,'Ultimate remains locked at Level 4');
assert(ultimate.querySelector('.profile-ultimate-master')?.textContent==='Linked to:God','Ultimate without lineage must display God');
const lineageUltimate=runtime.createSkillPanel({activeModels:models,currentLevel:4,ultimateModel:{skillLabel:'Ultimate',skillDescription:'Description'},selectedIndex:3,hasLineageMaster:true,masterLineage:{username:'Lineage Master',avatarUrl:'https://example.com/master.png'}});
assert(lineageUltimate.querySelector('.profile-ultimate-master')?.textContent==='Linked to:Lineage Master'&&lineageUltimate.querySelector('.account-master-avatar img')?.getAttribute('src')==='https://example.com/master.png','Ultimate must show its owners Master picture and name');
assert(runtime.getActiveQuestInfo({activeModels:models,player:levelFour}).deadline!==null,'Level 4 active skill timer is missing');
const levelFourActive=runtime.createSkillPanel({activeModels:models,currentLevel:4,passiveModel:{skill:null},player:levelFour,selectedIndex:3});
assert(levelFourActive.querySelector('[data-skill-practice-details]')&&levelFourActive.querySelector('[data-quest-deadline]'),'Level 4 active descriptions lost their countdown/practice details');
assert(!isNotificationVisible(definitions[1],null,{hasAccount:true,hasMaster:true,player:levelFour}),'Timed quest still visible at Level 4');
let savedProfile;
let copiedReferral,sharedReferral;
const referralNavigator={language:'en',clipboard:{writeText:async(value)=>{copiedReferral=value;}},share:async(value)=>{sharedReferral=value.url;}};
const client={from(){return{update(values){savedProfile=values;saveOrder.push('profile');return{eq:async()=>({error:null})}}}}};
window.JayceeAuth={getSupabaseClient:async()=>client,getSession:async()=>({data:{session:{user:{id:'user'}}}})};
const init=new Function('PROFILE_TABLE','USER_IMAGES_BUCKET','fetchProfileByUserId','fetchPlayersForUser','getAvatarImageUrl','getDisplayValue','createSkillsSection','navigator',ACCOUNT)('profiles','users',async(_client,id)=>id==='old'?{id:'old',username:'Linked Master'}:profile,async()=>[{...player,level:2}],async()=>'',display,createSkillsSection,referralNavigator);
await init();assert(document.querySelector('.is-skills').hidden,'Account Skills shown at Level 2');
assert(document.querySelector('.is-master [data-referral-link]').value==='https://example.test/?ref=User','Master referral link was not rendered from the saved username');
assert(document.querySelector('.is-master').hidden,'Account Master section shown at Level 2');
assert(document.querySelector('.is-master').textContent.includes('Linked Master'),'Linked Master not displayed in its section');
window.dispatchEvent(new CustomEvent('jaycee:player-updated',{detail:{player}}));await new Promise(resolve=>setTimeout(resolve,10));assert(!document.querySelector('.is-skills').hidden,'Account Skills did not unlock at Level 3');
assert(document.querySelector('.is-master').hidden,'Account Master section shown at Level 3');
window.dispatchEvent(new CustomEvent('jaycee:player-updated',{detail:{player:{...player,id:'another-game',level:1}}}));assert(!document.querySelector('.is-skills').hidden,'Another game removed earned account features');
const accountSkills=document.querySelector('.is-skills');
const mannaCycle=document.querySelector('[name=manna_cycle]');assert([...mannaCycle.options].some(option=>option.value==='hour'),'Hour cycle missing from account selector');mannaCycle.value='hour';
accountSkills.querySelector('[name=skill_0_label]').value='Saved via main account button';
document.querySelector('[data-account-toggle]').click();
document.querySelector('[data-account-save]').click();await new Promise(resolve=>setTimeout(resolve,20));
assert(savePayload.skills[0].label==='Saved via main account button','Main account Save did not save skills');
assert(document.querySelector('[data-account-save-status]').textContent==='Saved.','Account Save did not complete');
assert(savedProfile.manna_cycle==='hour','Account Save did not persist Hour cycle');
const visibility=document.querySelector('[name=visibility]');assert(visibility.closest('label').hidden,'Visibility control available below Level 4');
window.dispatchEvent(new CustomEvent('jaycee:player-updated',{detail:{player:levelFour}}));await new Promise(resolve=>setTimeout(resolve,10));
assert(!document.querySelector('.is-master').hidden,'Account Master section did not unlock at Level 4');
const referralButtons=document.querySelectorAll('.profile-referral-actions button');
referralButtons[0].click();await new Promise(resolve=>setTimeout(resolve,0));assert(copiedReferral==='https://example.test/?ref=User','Copy link did not copy the saved referral URL');
referralButtons[1].click();await new Promise(resolve=>setTimeout(resolve,0));assert(sharedReferral===copiedReferral,'Share did not send the referral URL');
assert(!visibility.closest('label').hidden,'Visibility control did not unlock at Level 4');
assert(visibility.closest('.is-master'),'Visibility control is not in the Master section above the referral link');
assert(visibility.disabled&&document.querySelector('#account-visibility-hint').textContent.includes('Skill 1'),'Missing skill names did not disable publication or show a message');
visibility.checked=true;document.querySelector('[data-account-save]').click();await new Promise(resolve=>setTimeout(resolve,20));assert(savedProfile.visibility!==true,'Main Save published incomplete skills');
visibility.checked=false;
for(const index of [1,2,3]){const input=accountSkills.querySelector(`[name=skill_${index}_label]`);input.value=`Named ${index}`;input.dispatchEvent(new Event('input'));}
assert(!visibility.disabled&&document.querySelector('#account-visibility-hint').hidden,'Naming all skills did not enable publication');
saveOrder=[];visibility.checked=true;document.querySelector('[data-account-save]').click();await new Promise(resolve=>setTimeout(resolve,20));assert(savedProfile.visibility===true,'Main Save did not persist account visibility');
assert(saveOrder.join(',')==='skills,profile','Account made public before skill names were saved');
document.querySelector('.is-character [name=username]').value='Renamed User';
document.querySelector('[data-account-save]').click();await new Promise(resolve=>setTimeout(resolve,20));
assert(new URL(document.querySelector('[data-referral-link]').value).searchParams.get('ref')==='Renamed User','Referral link did not refresh after saving a new username');
'@
$browser = $browser.Replace('AUTH_SOURCE', $authSource).Replace('RUNTIME', $runtime).Replace('EDITOR', $editor).Replace('ACCOUNT', $account).Replace('SYNTAX_SOURCES', $syntaxSources)
$html = '<!doctype html><body>RUNNING<script>(async()=>{try{' + $prelude + $checks + $browser + "document.body.textContent='PASS: JavaScript syntax, canvas, notifications, Level 2/3 acceptance, clocks, practice gating, skill names, Master carousel, game validation/save and live Skills unlock.';}catch(error){document.body.textContent='FAIL: '+error.stack;}})();</script>"
Set-Content -LiteralPath (Join-Path $checkDir 'check.html') -Value $html -Encoding UTF8
$process = Start-Process 'C:/Program Files/Google/Chrome/Application/chrome.exe' -ArgumentList @('--headless','--disable-gpu','--disable-software-rasterizer','--in-process-gpu','--no-sandbox','--no-first-run','--virtual-time-budget=5000','--dump-dom',('--user-data-dir='+(Join-Path $checkDir 'profile')),('file:///'+(Join-Path $checkDir 'check.html').Replace('\','/'))) -RedirectStandardOutput (Join-Path $checkDir 'stdout.txt') -RedirectStandardError (Join-Path $checkDir 'stderr.txt') -WindowStyle Hidden -PassThru
if (-not $process.WaitForExit(20000)) {
  Stop-Process -Id $process.Id -ErrorAction SilentlyContinue
  throw "Browser check timed out. Diagnostics: $checkDir"
}
$output = Get-Content -LiteralPath (Join-Path $checkDir 'stdout.txt') -Raw
if ($output -notmatch '<body[^>]*>PASS:') { throw $output }
Write-Output ($output -replace '<[^>]+>', '').Trim()
# Delete only this run's generated profile/harness, after verifying its location.
$resolvedCheckDir = [System.IO.Path]::GetFullPath($checkDir)
$resolvedTempDir = [System.IO.Path]::GetFullPath($env:TEMP).TrimEnd('\') + '\'
if (-not $resolvedCheckDir.StartsWith($resolvedTempDir, [System.StringComparison]::OrdinalIgnoreCase) -or
    [System.IO.Path]::GetFileName($resolvedCheckDir) -notlike 'jaycee-browser-*') {
  throw "Unexpected test artifact directory: $resolvedCheckDir"
}
Remove-Item -LiteralPath $resolvedCheckDir -Recurse -Force
