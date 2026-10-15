# Run from the repository root with Chrome installed. Uses mocks; writes only to TEMP.
$ErrorActionPreference = 'Stop'
$checkDir = Join-Path $env:TEMP ('jaycee-level-three-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $checkDir | Out-Null
function Read-BrowserSource($path) {
  return ((Get-Content -LiteralPath $path -Raw -Encoding UTF8) -replace '(?s)import\s+.*?from\s+["''][^"'']+["''];', '').Replace('export ', '')
}
$prelude = (Read-BrowserSource 'src/js/config/game-config.js') + (Read-BrowserSource 'src/js/jaycee/notifications.js')
$checks = ''
foreach ($path in @('tests/notifications.test.mjs', 'tests/level-two-quest.test.mjs', 'tests/level-three-quest.test.mjs')) {
  $checks += "`nawait (async()=>{`n" + (Read-BrowserSource $path) + "`n})();`n"
}
$runtime = ConvertTo-Json -InputObject ((Read-BrowserSource 'src/js/jaycee/profile-runtime.js') + "`nreturn {createVitalsPanel,createSkillPanel,getActiveQuestInfo};") -Compress
$editor = ConvertTo-Json -InputObject ((Read-BrowserSource 'src/js/jaycee/game-editor.js') + "`nreturn createSkillsSection;") -Compress
$accountSource = Read-BrowserSource 'src/js/jaycee/account.js'
$accountSource = $accountSource.Substring(0, $accountSource.LastIndexOf('if (document.readyState'))
$account = ConvertTo-Json -InputObject ($accountSource + "`nreturn initJayceeAccountPage;") -Compress
$browser = @'
const assert=(value,message)=>{if(!value)throw new Error(message)};
const display=value=>String(value??'').trim();
const runtime=new Function('JAYCEE_GAME_CONFIG','getDisplayValue','isQuestPending','notificationOccurrence','isNotificationVisible','interpolateNotification',RUNTIME)(JAYCEE_GAME_CONFIG,display,isQuestPending,notificationOccurrence,isNotificationVisible,interpolateNotification);
const models=[1,2,3].map(level=>({skillLabel:`Skill ${level}`,skill:{id:level},passiveSeconds:100,questSeconds:20}));
const definitions=[{id:'level_three_prepare.v1',stage:'linked_master',title:'Quest',tone:'quest',content:{level:3,occurrence:'level',action:'accept_quest',text:['Review {passiveSkillName} and {skillTwoName}.','In the meantime practice {skillOneName}.']}},{id:'master_linked.v1',stage:'linked_master',title:'Quest',tone:'quest',content:{component:'linked_quest'}}];
let accepted=0,switched;
const player={id:'player',user_id:'user',master:'old',level:3,level_3_accepted_at:null};
const options={activeModels:models,player,playerProfile:{id:'user',username:'User'},activeMasterProfile:{id:'old'},passiveSkillName:'Passive',notifications:{definitions,receipt(){},record(){}},sounds:{play(){}},publicProfiles:[{id:'user',username:'Self'},{id:'old',username:'Old'},{id:'new',username:'New'}],onAcceptQuest:()=>accepted++,onAcceptMaster:master=>switched=master.id};
const before=runtime.createVitalsPanel(options);
assert(before.querySelectorAll('[data-notification-key]').length===1,'Quest visible before acceptance');
assert(before.querySelectorAll('em').length===3,'Skill names are not italic');
assert(before.textContent.includes('Or you can choose to link yourself to another Master.'),'Missing switch invitation');
assert(before.querySelectorAll('.profile-master-choice').length>0,'Missing carousel');
before.querySelector('.profile-master-choice').click();assert(switched==='new','Wrong Master selected');
before.querySelector('.profile-play-button').click();assert(accepted===1,'Accept is broken');
const active={...player,level_3_accepted_at:'2026-10-15T00:00:00Z',skill_3_start:'2026-10-15T00:00:00Z'};
const after=runtime.createVitalsPanel({...options,player:active});assert(!after.textContent.includes('Or you can choose'),'Switching remains after Accept');
assert(runtime.getActiveQuestInfo({activeModels:models,player}).deadline===null,'Pending Level 3 clock runs');
assert(runtime.getActiveQuestInfo({activeModels:models,player:active}).deadline!==null,'Accepted Level 3 clock missing');
for(const row of [player,active]){const skills=runtime.createSkillPanel({activeModels:models,currentLevel:3,passiveModel:{skill:null},player:row,selectedIndex:3});assert(skills.querySelector('[data-practice-toggle]').disabled===isQuestPending(row),'Wrong practice availability');}
let savePayload;
const createSkillsSection=new Function('fetchUserGameSettings','fetchSkillsByIds','saveOwnGame','JAYCEE_GAME_SKILL_COLUMNS',EDITOR)(async()=>null,async()=>[],async(...args)=>{savePayload={skills:args[1],argumentCount:args.length}},JAYCEE_GAME_SKILL_COLUMNS);
const profile={id:'user',master:'old',username:'User'};
const editor=createSkillsSection({client:{},profile,createSection:()=>{const section=document.createElement('section'),content=document.createElement('div');section.append(content);return{section,content}}});
assert(editor.section.hidden,'Skills visible before unlock');editor.setUnlocked(true);document.body.append(editor.section);await new Promise(resolve=>setTimeout(resolve,10));
assert(!editor.section.querySelector('input[type=checkbox]'),'User can change visibility');
const form=editor.section.querySelector('form');editor.section.querySelector('[name=skill_1_description]').value='Resources without a skill name';form.dispatchEvent(new Event('submit',{cancelable:true}));await Promise.resolve();assert(!savePayload,'Description without a name saved');
editor.section.querySelector('[name=skill_0_label]').value='My passive';editor.section.querySelector('[name=skill_1_label]').value='My first skill';editor.section.querySelector('[name=skill_1_description]').value='[Resources](https://example.com)';
form.dispatchEvent(new Event('submit',{cancelable:true}));await new Promise(resolve=>setTimeout(resolve,10));assert(savePayload?.skills.length===5&&savePayload.argumentCount===2,'Game save must not submit visibility');
assert(!Object.hasOwn(profile,'visibility'),'Game save modified profile visibility');
assert(savePayload.skills[1].description.includes('Resources'),'Resource text lost');
const client={from(){return{update(){return{eq:async()=>({error:null})}}}}};
window.JayceeAuth={getSupabaseClient:async()=>client,getSession:async()=>({data:{session:{user:{id:'user'}}}})};
const init=new Function('PROFILE_TABLE','USER_IMAGES_BUCKET','fetchProfileByUserId','fetchPlayersForUser','getAvatarImageUrl','getDisplayValue','createSkillsSection',ACCOUNT)('profiles','users',async()=>profile,async()=>[{...player,level:2}],async()=>'',display,createSkillsSection);
await init();assert(document.querySelector('.is-skills').hidden,'Account Skills shown at Level 2');
window.dispatchEvent(new CustomEvent('jaycee:player-updated',{detail:{player}}));await new Promise(resolve=>setTimeout(resolve,10));assert(!document.querySelector('.is-skills').hidden,'Account Skills did not unlock at Level 3');
window.dispatchEvent(new CustomEvent('jaycee:player-updated',{detail:{player:{...player,id:'another-game',level:1}}}));assert(!document.querySelector('.is-skills').hidden,'Another game removed earned account features');
'@
$browser = $browser.Replace('RUNTIME', $runtime).Replace('EDITOR', $editor).Replace('ACCOUNT', $account)
$html = '<!doctype html><body>RUNNING<script>(async()=>{try{' + $prelude + $checks + $browser + "document.body.textContent='PASS: notifications, Level 2/3 acceptance, clocks, practice gating, italic skill names, Master carousel, game validation/save and live Skills unlock.';}catch(error){document.body.textContent='FAIL: '+error.stack;}})();</script>"
Set-Content -LiteralPath (Join-Path $checkDir 'check.html') -Value $html -Encoding UTF8
$process = Start-Process 'C:/Program Files/Google/Chrome/Application/chrome.exe' -ArgumentList @('--headless','--disable-gpu','--disable-software-rasterizer','--in-process-gpu','--no-sandbox','--no-first-run','--virtual-time-budget=5000','--dump-dom',('--user-data-dir='+(Join-Path $checkDir 'profile')),('file:///'+(Join-Path $checkDir 'check.html').Replace('\','/'))) -RedirectStandardOutput (Join-Path $checkDir 'stdout.txt') -RedirectStandardError (Join-Path $checkDir 'stderr.txt') -WindowStyle Hidden -PassThru
$process.WaitForExit(20000) | Out-Null
$output = Get-Content -LiteralPath (Join-Path $checkDir 'stdout.txt') -Raw
if ($output -notmatch '<body[^>]*>PASS:') { throw $output }
Write-Output ($output -replace '<[^>]+>', '').Trim()
