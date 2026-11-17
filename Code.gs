// DEALWORKX team app. Google services only; no billing or paid API integration.
const CONFIG = {
  sheetId: '1qxYEf_bylWqIX1mdAygGgAZOIMfrnkemX4zItUITsVU',
  domain: 'dealworkx.com',
  // Owner names match SETTINGS in the supplied workbook.
  users: {
    'ryan.l@dealworkx.com': {owner: 'Ryan', role: 'admin'},
    'evans.s@dealworkx.com': {owner: 'Evans', role: 'admin'},
    'ryanlasam@gmail.com': {owner: 'Ryan', role: 'admin'}
  },
  // Fill a slot only when a real teammate is ready. Blank slots grant no access.
  futureUsers: [
    {email: 'Admin@dealworkx.com', owner: 'Wally', role: 'member'}, // User 1
    {email: '', owner: '', role: 'member'}, // User 2
    {email: '', owner: '', role: 'member'}, // User 3
    {email: '', owner: '', role: 'member'}, // User 4
    {email: '', owner: '', role: 'member'}  // User 5
  ]
};
function doGet(){return HtmlService.createHtmlOutputFromFile('Index').setTitle('DEALWORKX Team CRM').addMetaTag('viewport','width=device-width, initial-scale=1');}
function norm_(v){return String(v==null?'':v).trim().toLowerCase();}
function users_(){const result={...CONFIG.users};for(const u of CONFIG.futureUsers){if(!u.email&&!u.owner)continue;const email=norm_(u.email);if(!email||email.split('@')[1]!==CONFIG.domain||!String(u.owner||'').trim()||u.role!=='member'||Object.prototype.hasOwnProperty.call(result,email))throw Error('A future-user slot is incomplete or duplicated. Use a unique company email and owner name with role member.');result[email]={owner:String(u.owner).trim(),role:'member'};}return result;}
function actor_(){
  const email=norm_(Session.getActiveUser().getEmail());
  if(!email)throw Error('Google did not provide your verified email. Company users: use the company app link. Gmail admin: use the separate admin link that executes as the accessing user.');
  const users=users_(),user=Object.prototype.hasOwnProperty.call(users,email)?users[email]:null;
  if(!user||!['admin','member'].includes(user.role)||!String(user.owner||'').trim())throw Error('Your account is not configured. Ask an administrator to add your email and Sequence Owner name.');
  if(email.split('@')[1]!==CONFIG.domain&&(user.role!=='admin'||norm_(Session.getEffectiveUser().getEmail())!==email))throw Error('External administrators must use the admin deployment that executes as the accessing user.');
  const aliases=Object.values(users).filter(u=>norm_(u.owner)===norm_(user.owner));
  if(aliases.length>1&&aliases.some(u=>u.role!=='admin'))throw Error('Owner-name mapping is ambiguous. Each member must have a unique owner name.');
  return {email,owner:user.owner,admin:user.role==='admin'};
}
function book_(){return SpreadsheetApp.openById(CONFIG.sheetId);}
function workbookTimeZone_(book) {
  const sheetZone = String(book.getSpreadsheetTimeZone() ?? '').trim();
  if (sheetZone) return sheetZone;
  return String(Session.getScriptTimeZone() ?? '').trim() || 'Asia/Singapore';
}
function sheet_(b,name){const s=b.getSheetByName(name);if(!s)throw Error('Required tab missing: '+name);return s;}
function lock_(fn){const l=LockService.getScriptLock();l.waitLock(30000);try{return fn();}finally{l.releaseLock();}}
function unassigned_(owner){return !norm_(owner)||norm_(owner)==='unassigned';}
function visible_(p,a){return a.admin||unassigned_(p.owner)||norm_(p.owner)===norm_(a.owner);}
function writable_(p,a){return a.admin||(!unassigned_(p.owner)&&norm_(p.owner)===norm_(a.owner));}
function leadRow_(r,row,date,timeZone){
  return {id:String(r[65]||'').trim(),row,name:[r[0],r[1]].filter(Boolean).join(' ')||'(Name missing)',company:r[3],email:r[5],owner:r[66],status:r[71],activation:r[72],assignmentDay:date instanceof Date?Utilities.formatDate(date,timeZone,'yyyy-MM-dd'):'',step:r[85],due:r[86],task:r[87],zone:r[88],country:r[34],raw:r};
}
function leads_(b){
  const s=sheet_(b,'PROSPECT LIST'),n=Math.min(5000,Math.max(0,s.getLastRow()-4));
  if(!n)return {items:[],missing:0,duplicates:0};
  const timeZone=workbookTimeZone_(b);
  const names=s.getRange(5,1,n,6).getDisplayValues(); // A:F
  const countries=s.getRange(5,35,n,1).getDisplayValues(); // AI
  const assignment=s.getRange(5,66,n,8).getDisplayValues(); // BN:BU
  const task=s.getRange(5,85,n,5).getDisplayValues(); // CG:CK
  const dates=s.getRange(5,73,n,1).getValues();
  const counts=new Map();
  for(const row of assignment){const id=String(row[0]||'').trim();if(id)counts.set(id,(counts.get(id)||0)+1);}
  const items=[];let missing=0,duplicates=0;
  assignment.forEach((row,i)=>{
    const id=String(row[0]||'').trim(),name=names[i];
    if(!id){if(name[0]||name[1]||name[3]||name[5])missing++;return;}
    if(counts.get(id)>1){duplicates++;return;}
    const r=[...name];r[34]=countries[i][0];
    row.forEach((value,j)=>{r[65+j]=value;});
    task[i].forEach((value,j)=>{r[84+j]=value;});
    items.push(leadRow_(r,i+5,dates[i][0],timeZone));
  });return {items,missing,duplicates};
}
function publicLead_(p){const {raw,...rest}=p;return rest;}
function find_(b,id,a,write){
  const unavailable='Lead unavailable or not permitted. Refresh your list.';
  const s=sheet_(b,'PROSPECT LIST'),n=Math.min(5000,Math.max(0,s.getLastRow()-4));
  if(!n||!id)throw Error(unavailable);
  const matches=s.getRange(5,66,n,2).getDisplayValues().map((r,i)=>({id:String(r[0]).trim(),owner:r[1],row:i+5})).filter(p=>p.id===String(id));
  if(matches.length!==1||!visible_(matches[0],a)||(write&&!writable_(matches[0],a)))throw Error(unavailable);
  const row=matches[0].row;
  const raw=s.getRange(row,1,1,114).getDisplayValues()[0];
  const p=leadRow_(raw,row,s.getRange(row,73,1,1).getValues()[0][0],workbookTimeZone_(b));
  if(p.id!==String(id)||!visible_(p,a)||(write&&!writable_(p,a)))throw Error(unavailable);
  return p;
}
function safeInput_(range){if(range.getFormula())throw Error('This input now contains a formula. No changes were made to it.');}
function painPoints_(book) {
  return [...new Set(sheet_(book,'STEP 1 PAIN LIBRARY').getRange('F5:F29').getDisplayValues().flat().filter(v=>v.trim()))];
}
function dailyCapacity_(book, leads, owners, today) {
  const limits=sheet_(book,'SETTINGS').getRange('B5:B6').getValues().flat();
  const [emailLimit,linkedinLimit]=limits.map(v=>v!==''&&Number.isFinite(Number(v))&&Number(v)>=0?Number(v):null);
  return owners.map(owner=>{
    const active=leads.filter(lead=>norm_(lead.owner)===norm_(owner)&&lead.assignmentDay===today&&norm_(lead.status)==='active');
    return {owner,emailUsed:active.length,emailLimit,linkedinUsed:active.filter(lead=>norm_(lead.raw[84])==='email + linkedin').length,linkedinLimit};
  });
}
function getWorkspace(){
  const a=actor_(),b=book_(),data=leads_(b),items=data.items.filter(p=>visible_(p,a)).map(publicLead_);
  const today=Utilities.formatDate(new Date(),workbookTimeZone_(b),'yyyy-MM-dd');
  const owners=a.admin?[...new Set(Object.values(users_()).map(u=>u.owner))].sort():[];
  return {user:a,items,today,owners,painPoints:a.admin?painPoints_(b):[],capacity:dailyCapacity_(b,data.items,a.admin?owners:[a.owner],today),diagnostic:a.admin?{missing:data.missing,duplicates:data.duplicates,sheetName:b.getName()}:null};
}
function assignLeads(ids,owner,painPoint){
  const a=actor_();if(!a.admin)throw Error('Only administrators can assign leads.');
  if(!Array.isArray(ids)||!ids.length||ids.length>50||new Set(ids).size!==ids.length)throw Error('Select 1–50 unique leads.');
  if(!Object.values(users_()).some(u=>u.owner===owner))throw Error('Select a configured owner.');
  return lock_(()=>{
    const b=book_(),s=sheet_(b,'PROSPECT LIST'),all=leads_(b).items;
    if(typeof painPoint!=='string'||!painPoints_(b).includes(painPoint))throw Error('Select a valid Primary Pain Point for Step 1 before assigning leads.');
    const entries=ids.map(id=>{const p=all.find(r=>r.id===id);if(!p||!unassigned_(p.owner))throw Error('A selected lead is already assigned or unavailable. Nothing was assigned. Refresh your list.');return p;});
    const zone=workbookTimeZone_(b),today=Utilities.formatDate(new Date(),zone,'yyyy-MM-dd');
    const activationDate=Utilities.parseDate(today,zone,'yyyy-MM-dd');
    const writes=entries.flatMap(p=>{
      const ownerCell=s.getRange('BO'+p.row),rule=ownerCell.getDataValidation();
      if(rule){const type=rule.getCriteriaType(),args=rule.getCriteriaValues();let values=null;if(type===SpreadsheetApp.DataValidationCriteria.VALUE_IN_LIST)values=args[0];if(type===SpreadsheetApp.DataValidationCriteria.VALUE_IN_RANGE)values=args[0].getDisplayValues().flat();if(values&&!values.includes(owner))throw Error('Owner is not in the sheet dropdown: '+owner);}
      return [['BO',owner],['BQ',literal_(painPoint)],['BT','Active'],['BU',activationDate],['CG','Email + LinkedIn']].map(([col,value])=>{
        const cell=s.getRange(col+p.row);safeInput_(cell);return {cell,value,previous:cell.getValue()};
      });
    });
    const changed=[];
    try{
      for(const write of writes){changed.push(write);write.cell.setValue(write.value);}
      SpreadsheetApp.flush();
      for(const lead of entries){
        if(norm_(s.getRange('CH'+lead.row).getDisplayValue())!=='step 1')throw Error(lead.id+' did not calculate Step 1. Check its completion history and Current Step formula.');
      }
    }catch(error){
      let failed=false;
      for(const write of changed.reverse()){try{write.cell.setValue(write.previous);}catch(_){failed=true;}}
      SpreadsheetApp.flush();
      throw Error(failed?'Assignment failed and recovery was incomplete. Inspect the selected rows.':'Assignment failed. Prior values restored. '+error.message);
    }
    return {assigned:entries.length};
  });
}
function currentOutreach_(lead, rows, dueDates, completion, now){
  const messages=[], completed=[];
  rows.forEach((row,index)=>{
    const [step,channel,subject,body,characters,gate,eligible,send]=row;
    if(!step||!channel)return;
    if(norm_(completion[index])==='done'){completed.push({index,step,channel});return;}
    if(norm_(step)!==norm_(lead.step)||!/^step \d+$/i.test(String(step).trim()))return;
    if(norm_(step)==='step 1'&&norm_(lead.raw[84])==='email only'&&/linked\s*in/i.test(channel))return;
    const due=dueDates[index][0];
    const scheduledLater=due instanceof Date&&due.getTime()>now.getTime();
    const allowed=!scheduledLater&&norm_(gate)==='ready'&&norm_(send)==='ready to send';
    const ready=allowed&&Boolean(String(body||'').trim());
    const reason=scheduledLater?'Scheduled for later':allowed&&!ready?'Message template is empty':send||gate||'Not ready';
    messages.push({index,step,channel,eligible,ready,reason,subject:ready?subject:'',body:ready?body:'',characters:ready?characters:''});
  });
  return {messages,completed};
}
function getProspect(id,mode,asOf){
  let stage='checking access';
  try{const a=actor_();return lock_(()=>{
    const b=book_(),p=find_(b,id,a,false),source=sheet_(b,'CONSOLE');let scratch;
    try{
      // A separate calculation sheet prevents one user's B3 replacing another's.
      stage='copying the Console';
      scratch=source.copyTo(b);scratch.setName('_APP_'+Utilities.getUuid().replace(/-/g,'').slice(0,20));scratch.hideSheet();
      stage='clearing the temporary Prospect ID rule';
      const prospectCell=scratch.getRange('B3');
      prospectCell.clearDataValidations();
      SpreadsheetApp.flush();
      if(prospectCell.getDataValidation())throw Error('The temporary dropdown rule was not cleared.');
      stage='setting the Prospect ID';
      prospectCell.setValue(p.id);
      SpreadsheetApp.flush();
      stage='preparing Console formulas';
      const top=scratch.getRange(1,1,Math.min(74,scratch.getMaxRows()),scratch.getLastColumn()),formulas=top.getFormulas();
      formulas.forEach((row,i)=>row.forEach((f,j)=>{if(f&&/CONSOLE'?\!/i.test(f))scratch.getRange(i+1,j+1).setFormula(f.replace(/'CONSOLE'!|\bCONSOLE!/gi,"'"+scratch.getName()+"'!"));}));
      SpreadsheetApp.flush();
      stage='calculating the preview';
      if(mode!==undefined){if(!['GENERAL','JOB-TITLE ALIGNED'].includes(mode))throw Error('Invalid messaging mode.');scratch.getRange('E3').setValue(mode);}
      if(asOf){if(!/^\d{4}-\d{2}-\d{2}$/.test(asOf))throw Error('Invalid preview date.');const d=Utilities.parseDate(asOf,workbookTimeZone_(b),'yyyy-MM-dd');if(Utilities.formatDate(d,workbookTimeZone_(b),'yyyy-MM-dd')!==asOf)throw Error('Invalid preview date.');scratch.getRange('H6').setValue(d);}else scratch.getRange('H6').setValue(new Date());
      SpreadsheetApp.flush();
      const v=scratch.getRange('A19:H26').getDisplayValues();
      if(v.some(r=>norm_(r[0])===norm_(p.step)&&r.some(x=>/^#(REF!|ERROR!|VALUE!|N\/A|NAME\?)/.test(x))))throw Error('Current-step messages could not calculate. Ask an administrator to check the Console formulas.');
      const topValues=scratch.getRange('A3:I17').getDisplayValues(),fields=[];
      for(let i=0;i<topValues.length;i++){const row=topValues[i];for(const [k,val] of [[0,1],[3,4],[6,7]]){if(row[k]&&!/▶|filter|messaging mode|task status|as of date/i.test(row[k])&&!/^Call Disposition$/i.test(row[k]))fields.push({label:row[k],value:row[val]});}}
      const completionRows=source.getRange('A75:I5074').getDisplayValues().filter(r=>String(r[0]).trim()===p.id);
      const completion=completionRows.length===1?completionRows[0].slice(1):[];
      const outreach=currentOutreach_(p,v,scratch.getRange('G19:G26').getValues(),completion,new Date());
      return {...publicLead_(p),canComplete:writable_(p,a),disposition:p.raw[83],channelPlan:p.raw[84],mode:scratch.getRange('E3').getDisplayValue(),fields,
        contact:{emailStatus:p.raw[6],employees:p.raw[24],state:p.raw[33]},
        profiles:{linkedin:p.raw[27],website:p.raw[28],companyLinkedin:p.raw[29]},
        phones:['Work phone','Home phone','Mobile phone','Corporate phone','Other phone','Company phone'].map((label,i)=>({label,number:p.raw[[15,16,17,18,19,39][i]]})),
        dispositions:sheet_(b,'SETTINGS').getRange('K5:K14').getDisplayValues().flat().filter(Boolean),comments:comments_(b,p.id),...outreach};
    }catch(error){
      if(scratch){try{b.deleteSheet(scratch);}catch(cleanupError){console.error('Temporary Console cleanup failed: '+cleanupError.message);}scratch=null;}
      throw error;
    }finally{if(scratch){stage='removing the temporary Console';b.deleteSheet(scratch);}}
  });}catch(error){throw Error('Console fix 5.1.2 — '+stage+': '+error.message);}
}
function getProspectFields(id){
  const a=actor_(),b=book_(),p=find_(b,id,a,false);
  const headers=sheet_(b,'PROSPECT LIST').getRange('A4:BM4').getDisplayValues()[0];
  return headers.map((label,i)=>({label:label||'Field '+(i+1),value:p.raw[i]}));
}
function comments_(b,id){const s=b.getSheetByName('WEB COMMENTS');if(!s||s.getLastRow()<2)return [];return s.getRange(2,1,s.getLastRow()-1,5).getDisplayValues().filter(r=>r[1]===id).map(r=>({date:r[0],author:r[2],text:r[4]})).reverse();}
function literal_(s){return /^[=+@\-]/.test(String(s))?"'"+s:String(s);}
function saveLeadSettings(id,data){const a=actor_();const allowed={status:['Inactive','Active','Paused','Bad'],disposition:['None','Bounced','Requested to unsubscribe','Replied','Meeting booked'],channelPlan:['Email + LinkedIn','Email only']};if(!data||Object.keys(allowed).some(k=>!allowed[k].includes(data[k])))throw Error('Select a valid status, disposition, and channel plan.');return lock_(()=>{const b=book_(),p=find_(b,id,a,true),s=sheet_(b,'PROSPECT LIST');const writes=[['BT',data.status],['CF',data.disposition],['CG',data.channelPlan]].map(([col,value])=>{const cell=s.getRange(col+p.row);safeInput_(cell);return {cell,value,old:cell.getValue()};});if(data.status==='Active'){const cell=s.getRange('BU'+p.row);safeInput_(cell);if(!cell.getValue())writes.push({cell,value:new Date(),old:''});}const applied=[];try{for(const w of writes){applied.push(w);w.cell.setValue(w.value);}SpreadsheetApp.flush();}catch(e){for(const w of applied)w.cell.setValue(w.old);throw e;}return 'Lead settings saved.';});}
function addComment(id,text){const a=actor_();text=String(text||'').trim();if(!text||text.length>4000)throw Error('Enter a comment of 1–4000 characters.');return lock_(()=>{const b=book_();find_(b,id,a,true);let s=b.getSheetByName('WEB COMMENTS');if(!s){s=b.insertSheet('WEB COMMENTS');s.appendRow(['Saved at','Prospect ID','Author email','Owner name','Comment']);s.setFrozenRows(1);}s.appendRow([new Date(),literal_(id),a.email,a.owner,literal_(text)]);return comments_(b,id);});}
function getFollowups(kind){
  if(!['interested','email requested'].includes(kind))throw Error('Invalid follow-up page.');
  const a=actor_(),b=book_(),leads=leads_(b).items.filter(p=>visible_(p,a)),allowed=new Set(leads.map(p=>p.id)),s=sheet_(b,'CALL LOG'),n=Math.max(0,s.getLastRow()-4),latest=new Map();
  if(n){const range=s.getRange(5,1,n,14),raw=range.getValues(),display=range.getDisplayValues();raw.forEach((r,i)=>{const id=String(r[1]).trim();if(!allowed.has(id)||!(r[0] instanceof Date))return;const time=r[0].getTime(),old=latest.get(id);if(!old||time>=old.time)latest.set(id,{time,call:{date:display[i][0],disposition:display[i][5],callback:display[i][6],notes:display[i][7]}});});}
  return leads.filter(p=>latest.has(p.id)&&norm_(latest.get(p.id).call.disposition)===kind).map(p=>({...publicLead_(p),call:latest.get(p.id).call}));
}
function saveCall(id,data){
  const a=actor_();if(!data||typeof data!=='object')throw Error('Missing call details.');
  return lock_(()=>{
    const b=book_(),p=find_(b,id,a,true),labels=['Work phone','Home phone','Mobile phone','Corporate phone','Other phone','Company phone'],i=labels.indexOf(data.phoneType);
    const dispositions=sheet_(b,'SETTINGS').getRange('K5:K14').getDisplayValues().flat();
    if(i<0||!p.raw[[15,16,17,18,19,39][i]]||!dispositions.includes(data.disposition)||/[|]/.test(id+data.disposition))throw Error('Choose an existing phone number and valid disposition.');
    const notes=String(data.notes||'').trim();if(notes.length>4000)throw Error('Call notes must be under 4000 characters.');
    let callback='';if(data.callback){if(!/^\d{4}-\d{2}-\d{2}$/.test(data.callback))throw Error('Invalid callback date.');callback=Utilities.parseDate(data.callback,workbookTimeZone_(b),'yyyy-MM-dd');if(Utilities.formatDate(callback,workbookTimeZone_(b),'yyyy-MM-dd')!==data.callback)throw Error('Invalid callback date.');}
    const s=sheet_(b,'CALL ENTRY'),values=s.getRange('A6:W5005').getValues();
    const index=values.findIndex(r=>!r[22]&&!r[2]&&!r[6]&&!r[7]&&!r[11]);if(index<0)throw Error('Call Entry is full. Ask an administrator to add capacity.');const row=index+6;
    const now=new Date(),tz=workbookTimeZone_(b),date=Utilities.formatDate(now,tz,'yyyyMMdd'),time=Utilities.formatDate(now,tz,'HH:mm:ss');
    const changes=[['C',a.owner],['G',callback],['H',literal_(notes)],['L',time],['W',data.phoneType+'|'+id+'|'+data.disposition+'|'+date]].map(([col,value])=>{const cell=s.getRange(col+row);safeInput_(cell);return {cell,value,old:cell.getValue()};});
    const applied=[];try{for(const c of changes){applied.push(c);c.cell.setValue(c.value);}SpreadsheetApp.flush();if(s.getRange('J'+row).getDisplayValue()!=='REPORTED')throw Error('The workbook did not accept this call. Check the Call Entry formulas.');}catch(e){for(const c of applied)c.cell.setValue(c.old);throw e;}
    return 'Call saved.';
  });
}
function markComplete(id,index,state){
  const a=actor_();state=state||'DONE';if(!Number.isInteger(index)||index<0||index>7||!['DONE','PENDING'].includes(state))throw Error('Invalid message or completion state.');
  return lock_(()=>{const b=book_(),p=find_(b,id,a,true),s=sheet_(b,'PROSPECT LIST'),c=sheet_(b,'CONSOLE');
    const ids=c.getRange('A75:A5074').getDisplayValues().flat(),matches=ids.map((v,i)=>String(v).trim()===id?i+75:0).filter(Boolean);if(matches.length!==1)throw Error('Completion register ID is missing or duplicated.');
    const cell=c.getRange(matches[0],index+2),date=s.getRange(['BX','BY','BZ','CA','CB','CC','CD','CE'][index]+p.row);safeInput_(cell);safeInput_(date);
    const old=cell.getValue(),oldDate=date.getValue();try{cell.setValue(state);if(state==='PENDING')date.clearContent();else if(!oldDate)date.setValue(new Date());SpreadsheetApp.flush();}catch(e){cell.setValue(old);date.setValue(oldDate);throw e;}
    return 'Completion saved.';
  });
}
function calls_(b,name,allowed){
  const s=sheet_(b,name),n=Math.max(0,s.getLastRow()-4);if(!n)return [];
  // Filter on the server before returning any call details to a browser.
  return s.getRange(5,1,n,14).getDisplayValues().filter(r=>allowed.has(String(r[1]).trim())).map(r=>({date:r[0],id:r[1],owner:r[2],phoneType:r[3],phone:r[4],disposition:r[5],callback:r[6],notes:r[7],name:[r[8],r[9]].filter(Boolean).join(' '),company:r[10],email:r[11],zone:r[12]}));
}
function getPipeline(){const a=actor_(),b=book_(),allowed=new Set(leads_(b).items.filter(p=>visible_(p,a)).map(p=>p.id));return calls_(b,'CALL PIPELINE',allowed);}
function getRecordedCalls(id){
  const a=actor_(),b=book_();
  const allowed=id?new Set([find_(b,id,a,false).id]):new Set(leads_(b).items.filter(p=>visible_(p,a)).map(p=>p.id));
  return calls_(b,'CALL LOG',allowed).reverse();
}
function getDashboard(){
  const a=actor_(),b=book_(),items=leads_(b).items.filter(p=>visible_(p,a)),allowed=new Set(items.map(p=>p.id));
  const zone=workbookTimeZone_(b),today=Utilities.formatDate(new Date(),zone,'yyyy-MM-dd');
  const log=sheet_(b,'CALL LOG'),n=Math.max(0,log.getLastRow()-4),raw=n?log.getRange(5,1,n,8).getValues():[];
  const dispositions={};let callsToday=0;
  raw.forEach(r=>{if(!allowed.has(String(r[1]).trim())||!(r[0] instanceof Date)||Utilities.formatDate(r[0],zone,'yyyy-MM-dd')!==today)return;callsToday++;const key=String(r[5]||'Unspecified');dispositions[key]=(dispositions[key]||0)+1;});
  const cards={visible:items.length,unassigned:items.filter(p=>unassigned_(p.owner)).length,active:items.filter(p=>norm_(p.status)==='active').length,dueToday:items.filter(p=>norm_(p.task)==='due today').length,overdue:items.filter(p=>norm_(p.task)==='overdue').length,callsToday};
  // Global workbook metrics are never sent to non-admins.
  let sheetSummary=null;if(a.admin){const d=sheet_(b,'DAILY DASHBOARD');sheetSummary=d.getRange('A4:H5').getDisplayValues();}
  return {today,zone,cards,dispositions,sheetSummary,queue:items.filter(p=>['due today','overdue'].includes(norm_(p.task))).map(publicLead_)};
}

