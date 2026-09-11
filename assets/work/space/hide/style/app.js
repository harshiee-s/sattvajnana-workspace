import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import {
  getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword,
  onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import {
  getFirestore, collection, getDocs, getDoc, setDoc, deleteDoc,
  doc, query, where, onSnapshot, orderBy, serverTimestamp, Timestamp, runTransaction
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { firebaseConfig } from "/images/read/workspace/sattva/api/firebase%20config.js";

// ─── HR: REFETCH ACTIVE EMPLOYEES ──────────────────────────────
window.loadHREmployees = async function() {
  try {
    const empSnap = await getDocs(query(collection(db,'hrm_employees'),where('status','==','active')));
    window._hrEmps = empSnap.docs.map(d=>({id:d.id,...d.data()}));
    const hrSel = document.getElementById('hrSlipEmpSelect');
    if (hrSel) {
      const cur = hrSel.value;
      hrSel.innerHTML = '<option value="">— Select Employee —</option>' +
        window._hrEmps.map(e=>`<option value="${escHtml(e.uid)}">${escHtml(e.name)} (${escHtml(e.employeeId||'')})</option>`).join('');
      hrSel.value = cur;
    }
    renderHREmployeeList();
    renderHRBulkQueue();
    showToast('Employee list refreshed.');
  } catch(err) { showToast('Refresh error: '+err.message, true); }
};

// ─── HR: BULK SALARY SLIP UPLOAD ───────────────────────────────
window._hrBulkQueue = [];

function hrBulkMatch(fileName) {
  const norm = s => (s||'').toLowerCase().replace(/[^a-z0-9]/g,'');
  const fn = norm(fileName);
  const emps = window._hrEmps || [];
  for (const e of emps) {            // prefer Employee ID (more specific)
    const id = norm(e.employeeId);
    if (id && id.length >= 2 && fn.includes(id)) return e.uid;
  }
  for (const e of emps) {            // then full name
    const nm = norm(e.name);
    if (nm && nm.length >= 3 && fn.includes(nm)) return e.uid;
  }
  return '';
}

function hrBulkAddFiles(files) {
  window._hrBulkQueue = window._hrBulkQueue || [];
  let added = 0, skipped = 0;
  for (const f of files) {
    if (f.type !== 'application/pdf') { skipped++; continue; }
    if (f.size > 5*1024*1024) { showToast(`${f.name}: exceeds 5 MB.`, true); skipped++; continue; }
    window._hrBulkQueue.push({
      id: 'b_'+Date.now()+'_'+Math.random().toString(36).slice(2,7),
      file: f, fileName: f.name, empUID: hrBulkMatch(f.name), status: 'pending'
    });
    added++;
  }
  if (added)   showToast(`${added} file(s) added to queue.`);
  if (skipped) showToast(`${skipped} file(s) skipped (PDF only / under 5 MB).`, true);
  renderHRBulkQueue();
}

window.hrBulkFilesChosen = function(e){ hrBulkAddFiles(Array.from(e.target.files)); e.target.value=''; };
window.hrBulkDragOver  = function(e){ e.preventDefault(); document.getElementById('hrBulkDropZone')?.classList.add('drag-over'); };
window.hrBulkDragLeave = function(e){ document.getElementById('hrBulkDropZone')?.classList.remove('drag-over'); };
window.hrBulkDrop = function(e){
  e.preventDefault();
  document.getElementById('hrBulkDropZone')?.classList.remove('drag-over');
  hrBulkAddFiles(Array.from(e.dataTransfer?.files || []));
};
window.hrBulkSetEmp = function(id, uid){ const it=(window._hrBulkQueue||[]).find(x=>x.id===id); if(it){ it.empUID=uid; renderHRBulkQueue(); } };
window.hrBulkRemove  = function(id){ window._hrBulkQueue=(window._hrBulkQueue||[]).filter(x=>x.id!==id); renderHRBulkQueue(); };
window.hrBulkClear   = function(){ window._hrBulkQueue=[]; renderHRBulkQueue(); };

window.renderHRBulkQueue = function() {
  const wrap = document.getElementById('hrBulkQueueWrap');
  if (!wrap) return;
  const queue = window._hrBulkQueue || [];
  if (!queue.length) { wrap.innerHTML = ''; return; }
  const emps = window._hrEmps || [];
  const opts = uid => '<option value="">— Select —</option>' +
    emps.map(e=>`<option value="${escHtml(e.uid)}" ${uid===e.uid?'selected':''}>${escHtml(e.name)} (${escHtml(e.employeeId||'')})</option>`).join('');
  const matchedCount   = queue.filter(i=>i.empUID && i.status!=='done').length;
  const unmatchedCount = queue.filter(i=>!i.empUID && i.status!=='done').length;
  wrap.innerHTML = `
    <div class="table-wrap" style="margin-top:1rem;">
      <table><thead><tr><th>File</th><th>Employee</th><th>Size</th><th>Status</th><th></th></tr></thead><tbody>
      ${queue.map(item=>`<tr>
        <td style="font-size:.8rem;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${escHtml(item.fileName)}"><i class="fa-solid fa-file-pdf" style="color:var(--error);"></i> ${escHtml(item.fileName)}</td>
        <td><select class="select-filter" style="padding:.35rem .7rem;font-size:.79rem;min-width:200px;" onchange="hrBulkSetEmp('${item.id}',this.value)" ${item.status==='done'?'disabled':''}>${opts(item.empUID)}</select></td>
        <td style="font-size:.76rem;">${(item.file.size/1024).toFixed(0)} KB</td>
        <td>${
          item.status==='done'  ? '<span class="pill pill-approved">Uploaded</span>' :
          item.status==='error' ? '<span class="pill pill-rejected">Failed</span>' :
          item.empUID           ? '<span class="pill pill-active">Matched</span>' :
                                  '<span class="pill pill-pending">No match</span>'
        }</td>
        <td>${item.status==='done'?'':`<button class="mini-btn mini-btn-danger" onclick="hrBulkRemove('${item.id}')"><i class="fa-solid fa-xmark"></i></button>`}</td>
      </tr>`).join('')}
      </tbody></table>
    </div>
    <div style="display:flex;gap:.7rem;align-items:center;margin-top:.8rem;flex-wrap:wrap;">
      <button class="btn btn-gold" id="hrBulkUploadAllBtn" onclick="hrBulkUploadAll()"><i class="fa-solid fa-cloud-arrow-up"></i> Upload All Matched (${matchedCount})</button>
      <button class="btn btn-secondary" onclick="hrBulkClear()"><i class="fa-solid fa-trash"></i> Clear Queue</button>
      ${unmatchedCount?`<span style="font-size:.78rem;color:var(--warn);">${unmatchedCount} unmatched — assign manually.</span>`:''}
    </div>`;
};

window.hrBulkUploadAll = async function() {
  const payMonth = document.getElementById('hrBulkPayMonth')?.value;
  if (!payMonth) { showToast('Select a Pay Month for the bulk upload.', true); return; }
  const queue = (window._hrBulkQueue||[]).filter(i=>i.empUID && i.status!=='done');
  if (!queue.length) { showToast('No matched files to upload.', true); return; }
  const btn = document.getElementById('hrBulkUploadAllBtn');
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Uploading...'; }
  const empMap = {}; (window._hrEmps||[]).forEach(e=>empMap[e.uid]=e);
  let ok = 0, fail = 0;
  for (const item of queue) {
    try {
      const emp = empMap[item.empUID] || {};
      const base64Data = await fileToBase64(item.file);
      const slipId = 'slip_'+item.empUID+'_'+payMonth.replace('-','')+'_'+Date.now()+'_'+Math.random().toString(36).slice(2,6);
      await setDoc(doc(db,'hrm_salary_slips',slipId), {
        empUID: item.empUID, empName: emp.name||'', payMonth, note: item.fileName, base64Data,
        uploadedBy: window.hrmCurrentUser?.uid || 'hr', uploadedAt: new Date().toISOString()
      });
      item.status = 'done'; ok++;
    } catch(err) { item.status = 'error'; fail++; }
    renderHRBulkQueue();
  }
  showToast(`Bulk upload complete: ${ok} uploaded${fail?`, ${fail} failed`:''}.`);
  loadHRSlipsList();
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const secondaryApp = initializeApp(firebaseConfig, "HRMSecondary");
const secondaryAuth = getAuth(secondaryApp);

// ─── STATE ───
window.hrmEmployees = [];
window.hrmCurrentUser = null;
window.hrmCurrentRole = null;
let firestoreUnsubEmp = null;
let firestoreUnsubLeave = null;
let firestoreUnsubCrmLeads = null;
let firestoreUnsubCrmClients = null;
let clockInterval = null;

const todayISO = () => new Date().toISOString().split('T')[0];
const escHtml = s => String(s||'').replace(/[&<>"']/g, m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const formatCurrency = v => '₹'+Number(v||0).toLocaleString('en-IN');
const formatDate = v => v ? new Date(v+'T00:00:00').toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'}) : '—';
const formatDateTime = ts => {
  if (!ts) return '—';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleString('en-IN',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'});
};

// ─── LEAVE TYPES ───
// No more casual/sick/LOP categories or balances — every leave request
// is just "how much of the day" (half or full). Approved leave is now
// treated the same as an ordinary absence for pay purposes (see
// buildMonthReport) — leave requests exist purely so staff can give
// advance notice and admins can approve/reject, not to grant paid days off.
const LEAVE_TYPES = {
  half_day: {label:'Half Day', half:true},
  full_day: {label:'Full Day', half:false}
};
function leaveLabel(t){ return (LEAVE_TYPES[t] && LEAVE_TYPES[t].label) || (t||'—'); }
function leavePillClass(t){
  return (LEAVE_TYPES[t] && LEAVE_TYPES[t].half) ? 'pill-checkedin' : 'pill-active';
}

const pageConfig = {
  dashboard:       {t:'Dashboard',             s:'Overview of your team and activity.'},
  addEmployee:     {t:'Add Employee',           s:'Create a new employee record and login.'},
  employees:       {t:'Employees',              s:'All team members at a glance.'},
  attendance:      {t:'Attendance',             s:'Check-in / check-out records.'},
  leaves:          {t:'Leave Requests',         s:'Review and action leave applications.'},
  monthlyReport:   {t:'Monthly Report',         s:'Aggregate attendance & payroll report.'},
  regularization:  {t:'Regularization',         s:'Review and approve regularization requests.'},
  roles:           {t:'Roles & Assign',         s:'Manage roles, assignments, promotions.'},
  salarySlips:     {t:'Salary Slips',           s:'Upload and manage employee salary slips.'},
  hrTeam:          {t:'HR Team',                s:'Manage HR logins who can upload salary slips.'},
  editRequests:    {t:'Edit Requests',          s:'Review and approve profile change requests.'},
  adminDocs:       {t:'Employee Documents',     s:'View all documents uploaded by employees.'},
  leads:           {t:'Leads',                  s:'Enquiries received from the website, plus any added manually.'},
  clients:         {t:'Clients',                s:'Converted from leads, or added directly.'},
  crmUsers:        {t:'Users',                  s:'Employees who can be assigned to CRM clients.'}
};

// ─── TOAST ───
function showToast(msg, isError=false) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast'+(isError?' error':'')+' show';
  setTimeout(()=>t.classList.remove('show'), 3000);
}
window.showToast = showToast;
function hideBootSplash(){
  const b = document.getElementById('bootSplash');
  if (b){ b.style.opacity='0'; setTimeout(()=>{ b.style.display='none'; }, 300); }
}
// ─── AUTH ───
onAuthStateChanged(auth, async user => {
  if (user) {
    window.hrmCurrentUser = user;
    try {
      const ud = await getDoc(doc(db,'hrm_users',user.uid));

      if (!ud.exists()) {
        // Check if this is the very first user — auto-create admin
        const allUsersSnap = await getDocs(collection(db,'hrm_users'));
        if (allUsersSnap.empty) {
          const adminData = {
            role: 'admin',
            name: user.email.split('@')[0],
            email: user.email,
            status: 'active',
            createdAt: new Date().toISOString()
          };
          await setDoc(doc(db,'hrm_users',user.uid), adminData);
          window.hrmCurrentRole = 'admin';
          launchAdminApp(user, adminData.name);
          showToast('Admin account created. Welcome!');
          return;
        }
        showLoginError("No Workspace account found. Contact your admin.");
        await signOut(auth); return;
      }

      const data = ud.data();
      if (data.status === 'inactive') {
        showLoginError("Your account is inactive. Contact admin.");
        await signOut(auth); return;
      }
window.hrmCurrentRole = data.role;
if (data.role === 'admin') {
  launchAdminApp(user, data.name || user.email.split('@')[0]);
} else if (data.role === 'hr') {
  launchHRPortal(user);
} else if (data.role === 'client') {
  launchClientPortal(user, data);
} else {
  launchEmpPortal(user, data);
}
    } catch(e) {
      console.error(e);
      showLoginError("Error: " + e.message);
      await signOut(auth);
    }

 } else {
    window.hrmCurrentUser = null;
    window.hrmCurrentRole = null;
    document.getElementById('appContent').classList.remove('show-app');
    document.getElementById('empPortalScreen').classList.remove('ep-visible');
document.getElementById('clientPortalScreen').classList.remove('ep-visible');
document.getElementById('hrPortalScreen').style.display = 'none';
    hideBootSplash();
    document.getElementById('loginScreen').style.display = 'flex';
    setTimeout(()=>document.getElementById('loginScreen').style.opacity='1', 30);
  }
});

function showLoginError(msg) {
  const el = document.getElementById('loginError');
  el.textContent = msg; el.style.display='block';
}

document.getElementById('loginForm').addEventListener('submit', async e => {
  e.preventDefault();
  const email = document.getElementById('loginEmail').value;
  const pass = document.getElementById('loginPassword').value;
  const btn = document.getElementById('loginBtnEl');
  document.getElementById('loginError').style.display = 'none';
  btn.innerHTML='<i class="fa-solid fa-spinner fa-spin"></i>&ensp;Verifying...';
  try {
    await signInWithEmailAndPassword(auth, email, pass);
  } catch(e) {
    showLoginError("Incorrect email or password.");
  } finally {
    btn.innerHTML='<i class="fa-solid fa-lock"></i>&ensp;Secure Login';
  }
});

document.getElementById('logoutBtn').addEventListener('click', async()=>{await signOut(auth); window.location.reload();});
document.getElementById('epLogoutBtn').addEventListener('click', async()=>{await signOut(auth); window.location.reload();});
document.getElementById('cpLogoutBtn').addEventListener('click', async()=>{await signOut(auth); window.location.reload();});

// ─── LAUNCH ADMIN APP ───
function launchAdminApp(user, name) {hideBootSplash();
  document.getElementById('userGreeting').textContent = name;
  document.getElementById('headerRoleBadge').className = 'role-badge role-admin';
  document.getElementById('headerRoleBadge').textContent = 'Admin';
  document.getElementById('loginScreen').style.opacity='0';
  setTimeout(()=>{
    document.getElementById('loginScreen').style.display='none';
    document.getElementById('appContent').classList.add('show-app');
  },400);
  showToast('Welcome back, '+name+'!');
  startEmployeeSync();
  startLeaveSync();
  startCrmSync();
  showAdminPage('dashboard');
  setTimeout(initEditReqBadge, 1500);
  setTimeout(initRegBadge, 1800);
}

// ─── EMPLOYEE PORTAL LAUNCH ───
async function launchEmpPortal(user, data) {hideBootSplash();
  document.getElementById('loginScreen').style.opacity='0';
  setTimeout(()=>document.getElementById('loginScreen').style.display='none',400);
  const screen = document.getElementById('empPortalScreen');
  screen.classList.add('ep-visible');
  document.getElementById('epRoleBadge').innerHTML = `<i class="fa-solid fa-id-badge"></i> ${data.role === 'manager' ? 'Manager' : 'Employee'}`;
  renderEmployeePortal(user, data);
}

// ─── CLIENT / PARENT PORTAL LAUNCH ───
async function launchClientPortal(user, data) {hideBootSplash();
  document.getElementById('loginScreen').style.opacity='0';
  setTimeout(()=>document.getElementById('loginScreen').style.display='none',400);
  const screen = document.getElementById('clientPortalScreen');
  screen.classList.add('ep-visible');
  document.getElementById('cpRoleBadge').innerHTML = `<i class="fa-solid fa-id-badge"></i> Parent / Client`;
  renderClientPortal(user, data);
}

async function renderClientPortal(user, userData) {
  const main = document.getElementById('cpMainContent');
  main.innerHTML = `<div class="empty"><h3><i class="fa-solid fa-spinner fa-spin"></i>&ensp;Loading your data...</h3></div>`;

  let client = null;
  try {
    const clientId = userData.clientId;
    if (!clientId) throw new Error('No student record is linked to this login. Contact admin.');
    const cSnap = await getDoc(doc(db,'clients',clientId));
    if (!cSnap.exists()) throw new Error('Student record not found. Contact admin.');
    client = { id: cSnap.id, ...cSnap.data() };
  } catch(err) {
    main.innerHTML = `<div class="empty"><h3>${escHtml(err.message)}</h3></div>`;
    return;
  }

  main.innerHTML = `
    <div class="cp-hero">
      <div>
        <h1>Welcome back! <span class="wave">👋</span></h1>
        <p>Here's what's happening with <strong>${escHtml(client.studentName)}</strong>.</p>
      </div>
      <div class="cp-hero-illus" aria-hidden="true">
        <div class="glow"></div>
        <div class="cp-hi-item cp-hi-books"><i class="fa-solid fa-book"></i></div>
        <div class="cp-hi-item cp-hi-plant"><i class="fa-solid fa-seedling"></i></div>
        <div class="cp-hi-item cp-hi-lamp"><i class="fa-solid fa-lightbulb"></i></div>
      </div>
    </div>

    <div class="cp-stats">
      <div class="cp-stat-card"><div class="cp-stat-icon violet"><i class="fa-solid fa-user"></i></div><div class="cp-stat-body"><div class="stat-label">Student</div><div class="stat-value">${escHtml(client.studentName)}</div><div class="stat-help">${escHtml(client.grade||'')}</div></div></div>
      <div class="cp-stat-card"><div class="cp-stat-icon teal"><i class="fa-solid fa-people-roof"></i></div><div class="cp-stat-body"><div class="stat-label">Parent / Guardian</div><div class="stat-value">${escHtml(client.parentName)}</div></div></div>
      <div class="cp-stat-card"><div class="cp-stat-icon green"><i class="fa-solid fa-book-open"></i></div><div class="cp-stat-body"><div class="stat-label">Subjects</div><div class="stat-value" style="font-size:.95rem;">${escHtml(client.subjects)||'—'}</div></div></div>
      <div class="cp-stat-card"><div class="cp-stat-icon blue"><i class="fa-solid fa-file-lines"></i></div><div class="cp-stat-body"><div class="stat-label">Client #</div><div class="stat-value">${escHtml(client.clientNumber)}</div></div></div>
    </div>

    <div class="ep-tabs">
      <button class="ep-tab active" onclick="cpSwitchTab('attendance',this)"><i class="fa-solid fa-clock"></i> Attendance</button>
      <button class="ep-tab" onclick="cpSwitchTab('materials',this)"><i class="fa-solid fa-book"></i> Study Materials</button>
      <button class="ep-tab" onclick="cpSwitchTab('progress',this)"><i class="fa-solid fa-chart-line"></i> Student Progress</button>
      <button class="ep-tab" onclick="cpSwitchTab('testperf',this)"><i class="fa-solid fa-graduation-cap"></i> Test Performance</button>
      <button class="ep-tab" onclick="cpSwitchTab('schedule',this)"><i class="fa-solid fa-calendar-week"></i> Schedule &amp; Leave</button>
    </div>

    <div class="ep-tab-panel active" id="cp-tab-attendance">
      <div class="card panel">
        <div class="panel-head">
          <div class="cp-panel-head-row">
            <div class="cp-panel-icon"><i class="fa-solid fa-calendar-days"></i></div>
            <div><h2>Attendance Sheet</h2><p>Tutoring sessions logged for ${escHtml(client.studentName)}.</p></div>
          </div>
          <span class="cp-range-select"><i class="fa-regular fa-calendar"></i> All Time <i class="fa-solid fa-chevron-down" style="font-size:.65rem;"></i></span>
        </div>
        <div class="table-wrap" id="cpAttWrap"><div class="empty"><h3><i class="fa-solid fa-spinner fa-spin"></i> Loading...</h3></div></div>
      </div>
    </div>

    <div class="ep-tab-panel" id="cp-tab-materials">
      <div class="card panel">
        <div class="panel-head">
          <div class="cp-panel-head-row">
            <div class="cp-panel-icon"><i class="fa-solid fa-book-open"></i></div>
            <div><h2>Study Materials</h2><p>Worksheets, notes, and resources shared by the tutor.</p></div>
          </div>
        </div>
        <div id="cpMaterialsGrid" class="doc-grid"><div class="empty" style="grid-column:1/-1;border:none;"><h3><i class="fa-solid fa-spinner fa-spin"></i> Loading...</h3></div></div>
      </div>
    </div>

    <div class="ep-tab-panel" id="cp-tab-progress">
      <div class="card panel">
        <div class="panel-head">
          <div class="cp-panel-head-row">
            <div class="cp-panel-icon"><i class="fa-solid fa-chart-line"></i></div>
            <div><h2>Student Progress</h2><p>Updates on what's been covered and how ${escHtml(client.studentName)} is doing.</p></div>
          </div>
        </div>
        <div id="cpProgressLog"><p class="muted-note"><i class="fa-solid fa-spinner fa-spin"></i> Loading…</p></div>
      </div>
    </div>

    <div class="ep-tab-panel" id="cp-tab-testperf">
      <div class="card panel">
        <div class="panel-head">
          <div class="cp-panel-head-row">
            <div class="cp-panel-icon"><i class="fa-solid fa-graduation-cap"></i></div>
            <div><h2>Test Performance</h2><p>Marks recorded for each test, by subject and date.</p></div>
          </div>
        </div>
        <div id="cpTestPerfLog"><p class="muted-note"><i class="fa-solid fa-spinner fa-spin"></i> Loading…</p></div>
      </div>
    </div>

    <div class="ep-tab-panel" id="cp-tab-schedule">
      <div class="card panel" style="margin-bottom:1rem;">
        <div class="panel-head">
          <div class="cp-panel-head-row">
            <div class="cp-panel-icon"><i class="fa-solid fa-calendar-week"></i></div>
            <div><h2>Tuition Schedule</h2><p>The days and hours ${escHtml(client.studentName)} has sessions each week.</p></div>
          </div>
        </div>
        <div style="display:flex;gap:.5rem;flex-wrap:wrap;align-items:center;">
          ${formatClientSchedule(client.tuitionDays)}
          ${client.tuitionDays?.length ? `<span class="muted-note">(${clientWeeklyHours(client.tuitionDays)} hrs/week total)</span>` : ''}
        </div>
      </div>
      <div class="card panel">
        <div class="panel-head">
          <div class="cp-panel-head-row">
            <div class="cp-panel-icon"><i class="fa-solid fa-calendar-xmark"></i></div>
            <div><h2>Leave</h2><p>Let us know ahead of time if ${escHtml(client.studentName)} will miss a session — no make-up needed, and it won't affect the tutor's attendance.</p></div>
          </div>
          <button class="btn btn-gold" onclick="openParentLeaveModal('${client.id}')"><i class="fa-solid fa-plus"></i> Apply Leave</button>
        </div>
        <div id="cpLeaveWrap"><div class="empty"><h3><i class="fa-solid fa-spinner fa-spin"></i> Loading...</h3></div></div>
      </div>
      <div class="card panel">
        <div class="panel-head">
          <div class="cp-panel-head-row">
            <div class="cp-panel-icon"><i class="fa-solid fa-hourglass-half"></i></div>
            <div><h2>Reduce Session Hours</h2><p>Need a shorter session on a particular day rather than skipping it entirely? Set the reduced hours here — the tutor's attendance for that date is measured against the shorter time.</p></div>
          </div>
          <button class="btn btn-gold" onclick="openReduceHoursModal('${client.id}')"><i class="fa-solid fa-plus"></i> Reduce a Session</button>
        </div>
        <div id="cpReduceWrap"><div class="empty"><h3><i class="fa-solid fa-spinner fa-spin"></i> Loading...</h3></div></div>
      </div>
    </div>
  `;
  window.__cpNotifPending = 4;
  window.__cpNotifAtt = window.__cpNotifMat = window.__cpNotifProg = window.__cpNotifTp = null;
  loadClientAttendance(client.id).then(n => { window.__cpNotifAtt = n; cpTryRenderNotifs(); });
  loadClientMaterials(client.id).then(n => { window.__cpNotifMat = n; cpTryRenderNotifs(); });
  loadClientProgress(client.id).then(n => { window.__cpNotifProg = n; cpTryRenderNotifs(); });
  loadClientTestPerformance(client.id).then(n => { window.__cpNotifTp = n; cpTryRenderNotifs(); });
  loadClientLeaves(client.id);
  window._reduceHoursClientsById = window._reduceHoursClientsById || {};
  window._reduceHoursClientsById[client.id] = client;
  loadClientReductions(client.id);
}

function cpTryRenderNotifs() {
  window.__cpNotifPending = (window.__cpNotifPending || 4) - 1;
  if (window.__cpNotifPending > 0) return;
  renderCpNotifications([window.__cpNotifAtt, window.__cpNotifMat, window.__cpNotifProg, window.__cpNotifTp]);
}

window.cpSwitchTab = function(name, btn) {
  document.querySelectorAll('#clientPortalScreen .ep-tab').forEach(b=>b.classList.remove('active'));
  document.querySelectorAll('#clientPortalScreen .ep-tab-panel').forEach(p=>p.classList.remove('active'));
  btn.classList.add('active');
  const panel = document.getElementById('cp-tab-'+name);
  if (panel) panel.classList.add('active');
  // keep the sidebar in sync with whichever tab is now showing
  document.querySelectorAll('#clientPortalScreen .cp-sidebar .nav-item').forEach(n=>n.classList.remove('active'));
  const navMatch = document.querySelector(`#clientPortalScreen .cp-sidebar .nav-item[data-cp-nav="${name}"]`);
  if (navMatch) navMatch.classList.add('active');
};

// Sidebar nav → drives the same tab switcher. "Dashboard" resets to the first (Attendance) tab.
window.cpSidebarNav = function(name, el) {
  document.querySelectorAll('#clientPortalScreen .cp-sidebar .nav-item').forEach(n=>n.classList.remove('active'));
  el.classList.add('active');
  document.querySelector('#clientPortalScreen .cp-main').scrollTo({top:0,behavior:'smooth'});
  const target = name === 'dashboard' ? 'attendance' : name;
  const tabBtn = document.querySelector(`#clientPortalScreen .ep-tab[onclick*="cpSwitchTab('${target}'"]`);
  if (tabBtn) {
    document.querySelectorAll('#clientPortalScreen .ep-tab').forEach(b=>b.classList.remove('active'));
    document.querySelectorAll('#clientPortalScreen .ep-tab-panel').forEach(p=>p.classList.remove('active'));
    tabBtn.classList.add('active');
    const panel = document.getElementById('cp-tab-'+target);
    if (panel) panel.classList.add('active');
  }
  // re-highlight the sidebar item for "dashboard" specifically, since the tab click above would otherwise steal it
  if (name === 'dashboard') {
    document.querySelectorAll('#clientPortalScreen .cp-sidebar .nav-item').forEach(n=>n.classList.remove('active'));
    el.classList.add('active');
  }
};

async function loadClientAttendance(clientId) {
  const wrap = document.getElementById('cpAttWrap');
  if (!wrap) return null;
  try {
    const snap = await getDocs(query(collection(db,'hrm_attendance'),where('clientId','==',clientId)));
    let records = snap.docs.map(d=>({id:d.id,...d.data()}));

    // Approved regularizations for this client — the admin has credited these
    // sessions even though the raw check-in/check-out is missing or incomplete,
    // so parents should see them as Completed rather than Short/blank.
    let regByKey = {};
    try {
      const regSnap = await getDocs(query(collection(db,'hrm_regularizations'),where('clientId','==',clientId),where('status','==','approved')));
      regSnap.docs.forEach(d=>{ const r = d.data(); regByKey[r.empUID+'_'+r.date] = r; });
    } catch(e) { /* ignore — attendance still shows without regularization overlay */ }

    // Merge: attach the regularization to its matching attendance record if one
    // exists, and synthesize a row for any regularization that has no attendance
    // record at all (e.g. the employee never checked in that day).
    records = records.map(r => {
      const key = r.empUID+'_'+r.date;
      if (regByKey[key]) { const reg = regByKey[key]; delete regByKey[key]; return {...r, regularized:true, regHours:reg.hours, regReason:reg.reason}; }
      return r;
    });
    Object.values(regByKey).forEach(reg => {
      records.push({
        id: 'reg_'+reg.empUID+'_'+reg.date,
        empUID: reg.empUID, date: reg.date,
        scheduledHours: reg.hours,
        regularized: true, regHours: reg.hours, regReason: reg.reason,
        checkIn: null, checkOut: null
      });
    });
    records.sort((a,b)=>(b.date||'').localeCompare(a.date||''));

    if (!records.length) {
      wrap.innerHTML = `<div class="cp-empty"><div class="cp-empty-illus"><div class="glow"></div><i class="fa-solid fa-calendar-days main-i"></i><i class="fa-solid fa-sparkle spark"></i><span class="badge-i"><i class="fa-regular fa-clock"></i></span></div><h3>No sessions recorded yet.</h3><p>Attendance records will appear here once tutoring sessions are scheduled and completed.</p></div>`;
      return null;
    }
    const uids = [...new Set(records.map(r=>r.empUID).filter(Boolean))];
    const empMap = {};
    for (let i=0;i<uids.length;i+=30) {
      const chunk = uids.slice(i,i+30);
      try {
        const eSnap = await getDocs(query(collection(db,'hrm_employees'),where('uid','in',chunk)));
        eSnap.docs.forEach(d=>{ const e=d.data(); empMap[e.uid]=e.name; });
      } catch(e) { /* ignore lookup errors, fall back to blank name */ }
    }
    wrap.innerHTML = `<table><thead><tr><th>Date</th><th>Tutor</th><th>Check In</th><th>Check Out</th><th>Duration</th><th>Scheduled</th><th>Status</th><th>Session Notes</th></tr></thead><tbody>
      ${records.map(r=>{
        if (r.regularized) {
          return `<tr>
          <td>${r.date?new Date(r.date).toLocaleDateString('en-IN'):'—'}</td>
          <td>${escHtml(empMap[r.empUID]||'—')}</td>
          <td>${escHtml(r.checkIn||'—')}</td>
          <td>${escHtml(r.checkOut||'—')}</td>
          <td>${r.regHours||0}h</td>
          <td>${r.scheduledHours?`${r.scheduledHours}h`:'—'}</td>
          <td><span class="pill pill-present">Completed</span></td>
          <td style="font-size:.8rem;">${escHtml(r.checkOutNotes||r.regReason)||'—'}</td>
        </tr>`;
        }
        const mins = calcDurationMinutes(r.checkIn, r.checkOut);
        const met = r.scheduledHours ? mins >= r.scheduledHours*60 : null;
        const statusPill = !r.checkOut ? '<span class="pill pill-checkedin">In progress</span>' : met===false ? '<span class="pill pill-pending">Short</span>' : '<span class="pill pill-present">Completed</span>';
        return `<tr>
        <td>${r.date?new Date(r.date).toLocaleDateString('en-IN'):'—'}</td>
        <td>${escHtml(empMap[r.empUID]||'—')}</td>
        <td>${escHtml(r.checkIn||'—')}</td>
        <td>${escHtml(r.checkOut||'—')}</td>
        <td>${calcDuration(r.checkIn,r.checkOut)}</td>
        <td>${r.scheduledHours?`${r.scheduledHours}h`:'—'}</td>
        <td>${statusPill}</td>
        <td style="font-size:.8rem;">${escHtml(r.checkOutNotes)||'—'}</td>
      </tr>`;}).join('')}
    </tbody></table>`;
    const latest = records[0];
    return { icon:'fa-clock', color:'blue', title:`Session logged with ${escHtml(empMap[latest.empUID]||'your tutor')}`, sub:latest.checkOutNotes?escHtml(latest.checkOutNotes):'Attendance updated', date: latest.date };
  } catch(err) {
    wrap.innerHTML = `<div class="empty"><h3>Error loading attendance.</h3></div>`;
    return null;
  }
}

async function loadClientMaterials(clientId) {
  const grid = document.getElementById('cpMaterialsGrid');
  if (!grid) return null;
  try {
    const snap = await getDocs(query(collection(db,'hrm_study_materials'),where('clientId','==',clientId)));
    const mats = snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(b.uploadedAt||'').localeCompare(a.uploadedAt||''));
    if (!mats.length) {
      grid.innerHTML = `<div class="cp-empty" style="grid-column:1/-1;"><div class="cp-empty-illus"><div class="glow"></div><i class="fa-solid fa-book-open main-i"></i><i class="fa-solid fa-sparkle spark"></i><span class="badge-i"><i class="fa-solid fa-pen"></i></span></div><h3>No study materials uploaded yet.</h3><p>Worksheets and notes shared by the tutor will show up here.</p></div>`;
      return null;
    }
    grid.innerHTML = mats.map(m => {
      const icon = m.fileType === 'application/pdf' ? '📄' : (m.fileType && m.fileType.startsWith('image/') ? '🖼️' : '📎');
      const sizeKB = m.fileSize ? (m.fileSize/1024).toFixed(1) + ' KB' : '';
      const date = m.uploadedAt ? new Date(m.uploadedAt).toLocaleDateString('en-IN') : '';
      return `<div class="doc-card">
        <div style="display:flex;align-items:center;gap:.6rem;">
          <div class="doc-card-icon">${icon}</div>
          <div style="min-width:0;">
            <div class="doc-card-name" title="${escHtml(m.fileName)}">${escHtml(m.title)||escHtml(m.fileName)}</div>
            <div class="doc-card-meta">by ${escHtml(m.uploadedByName)}</div>
          </div>
        </div>
        <div class="doc-card-meta">${sizeKB}${sizeKB && date?' · ':''}${date}</div>
        <div class="doc-card-actions">
          <button class="mini-btn" onclick="previewStudyMaterial('${m.id}')"><i class="fa-solid fa-eye"></i> View</button>
        </div>
      </div>`;
    }).join('');
    const latest = mats[0];
    return { icon:'fa-book-open', color:'green', title:`New material: ${escHtml(latest.title||latest.fileName)}`, sub:`Uploaded by ${escHtml(latest.uploadedByName||'your tutor')}`, date: latest.uploadedAt };
  } catch(err) {
    grid.innerHTML = `<div class="empty" style="grid-column:1/-1;border:none;"><h3>Error loading materials.</h3></div>`;
    return null;
  }
}

async function loadClientProgress(clientId) {
  const log = document.getElementById('cpProgressLog');
  if (!log) return null;
  try {
    const snap = await getDocs(query(collection(db,'hrm_student_progress'),where('clientId','==',clientId)));
    const entries = snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(b.createdAt||'').localeCompare(a.createdAt||''));
    if (!entries.length) {
      log.innerHTML = `<div class="cp-empty"><div class="cp-empty-illus"><div class="glow"></div><i class="fa-solid fa-chart-line main-i"></i><i class="fa-solid fa-sparkle spark"></i><span class="badge-i"><i class="fa-solid fa-arrow-trend-up"></i></span></div><h3>No progress updates yet.</h3><p>Notes on what's been covered and how your child is doing will appear here.</p></div>`;
      return null;
    }
    log.innerHTML = entries.map(e => `
      <div class="perf-entry">
        <div class="perf-entry-head">
          <span class="perf-entry-subject">${escHtml(e.subject)||'General update'}</span>
          <span class="perf-entry-date">${escHtml(e.date)||(e.createdAt?new Date(e.createdAt).toLocaleDateString('en-IN'):'')}</span>
        </div>
        <div class="perf-entry-note">${escHtml(e.note)}</div>
        <div class="perf-entry-meta"><span>Added by ${escHtml(e.addedByName)}</span></div>
      </div>
    `).join('');
    const latest = entries[0];
    return { icon:'fa-chart-line', color:'violet', title:`Progress update: ${escHtml(latest.subject||'General')}`, sub: escHtml(latest.note||''), date: latest.date||latest.createdAt };
  } catch(err) {
    log.innerHTML = `<p class="muted-note">Could not load progress history.</p>`;
    return null;
  }
}

async function loadClientTestPerformance(clientId) {
  const log = document.getElementById('cpTestPerfLog');
  if (!log) return null;
  try {
    const snap = await getDocs(query(collection(db,'hrm_test_performance'),where('clientId','==',clientId)));
    const entries = snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(b.date||b.createdAt||'').localeCompare(a.date||a.createdAt||''));
    if (!entries.length) {
      log.innerHTML = `<div class="cp-empty"><div class="cp-empty-illus"><div class="glow"></div><i class="fa-solid fa-graduation-cap main-i"></i><i class="fa-solid fa-sparkle spark"></i><span class="badge-i"><i class="fa-solid fa-check"></i></span></div><h3>No test results recorded yet.</h3><p>Marks for each test, by subject and date, will appear here once they're recorded.</p></div>`;
      return null;
    }
    log.innerHTML = entries.map(e => {
      const obtained = Number(e.marksObtained)||0;
      const total = Number(e.totalMarks)||0;
      const pct = total > 0 ? Math.round((obtained/total)*100) : 0;
      return `
      <div class="perf-entry">
        <div class="perf-entry-head">
          <span class="perf-entry-subject">${escHtml(e.subject)||'Test'}</span>
          <span class="perf-entry-date">${escHtml(e.date)||(e.createdAt?new Date(e.createdAt).toLocaleDateString('en-IN'):'')}</span>
        </div>
        <div style="display:flex;align-items:center;gap:.6rem;margin:.3rem 0;">
          <span style="font-family:var(--font-mono);font-weight:700;font-size:.95rem;color:${tpScoreColor(pct)};">${obtained} / ${total}</span>
          <span class="pill" style="background:transparent;border:1px solid ${tpScoreColor(pct)};color:${tpScoreColor(pct)};font-size:.72rem;">${pct}%</span>
        </div>
        ${e.remarks ? `<div class="perf-entry-note">${escHtml(e.remarks)}</div>` : ''}
        <div class="perf-entry-meta">
          <span>Added by ${escHtml(e.addedByName)}</span>
          ${e.fileName ? `<button class="mini-btn" onclick="previewTestPerformanceFile('${e.id}')"><i class="fa-solid fa-eye"></i> Answer Sheet</button>` : ''}
        </div>
      </div>
    `;}).join('');
    const latest = entries[0];
    const lo = Number(latest.marksObtained)||0, lt = Number(latest.totalMarks)||0;
    const lpct = lt>0?Math.round((lo/lt)*100):0;
    return { icon:'fa-graduation-cap', color:'teal', title:`Test result: ${escHtml(latest.subject||'Test')} — ${lpct}%`, sub:`Added by ${escHtml(latest.addedByName||'your tutor')}`, date: latest.date||latest.createdAt };
  } catch(err) {
    log.innerHTML = `<p class="muted-note">Could not load test performance history.</p>`;
    return null;
  }
}

// ─── PARENT: APPLY LEAVE (marks days as non-working for this client) ───
window.openParentLeaveModal = function(clientId) {
  window._parentLeaveClientId = clientId;
  document.getElementById('plFrom').value = '';
  document.getElementById('plTo').value = '';
  document.getElementById('plReason').value = '';
  document.getElementById('parentLeaveModal').classList.add('open');
};

document.getElementById('parentLeaveForm')?.addEventListener('submit', async ev => {
  ev.preventDefault();
  const clientId = window._parentLeaveClientId;
  if (!clientId) return;
  const btn = document.getElementById('plSubmitBtn');
  const from = document.getElementById('plFrom').value;
  const to = document.getElementById('plTo').value || from;
  const reason = document.getElementById('plReason').value.trim();
  if (!from) return;
  if (to < from) { showToast('End date is before start date.', true); return; }
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Submitting...'; btn.disabled = true;
  try {
    const cSnap = await getDoc(doc(db,'clients',clientId));
    const studentName = cSnap.exists() ? cSnap.data().studentName : '';
    const dates = [];
    let cur = new Date(from+'T00:00:00');
    const end = new Date(to+'T00:00:00');
    while (cur <= end) {
      dates.push(cur.toISOString().slice(0,10));
      cur.setDate(cur.getDate()+1);
    }
    await Promise.all(dates.map(date =>
      setDoc(doc(db,'hrm_client_leaves', clientId+'_'+date), {
        clientId, studentName, date, reason,
        createdAt: new Date().toISOString()
      })
    ));
    document.getElementById('parentLeaveModal').classList.remove('open');
    showToast(`Leave marked for ${dates.length} day${dates.length===1?'':'s'}.`);
    loadClientLeaves(clientId);
  } catch(err) { showToast('Error: '+err.message, true); }
  finally { btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Submit'; btn.disabled = false; }
});

window.cancelClientLeave = async function(leaveId, clientId, wrapId) {
  if (!confirm('Cancel this paused day? The session will count as scheduled again.')) return;
  try {
    await deleteDoc(doc(db,'hrm_client_leaves',leaveId));
    showToast('Pause cancelled.');
    loadClientLeaves(clientId, wrapId);
  } catch(err) { showToast('Error: '+err.message, true); }
};

async function loadClientLeaves(clientId, wrapId) {
  wrapId = wrapId || 'cpLeaveWrap';
  const wrap = document.getElementById(wrapId);
  if (!wrap) return;
  const isAdminView = wrapId === 'clientDetailPauseWrap';
  try {
    const snap = await getDocs(query(collection(db,'hrm_client_leaves'),where('clientId','==',clientId)));
    const leaves = snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(b.date||'').localeCompare(a.date||''));
    window._clientLeavesById = window._clientLeavesById || {};
    leaves.forEach(l => { window._clientLeavesById[l.id] = l; });
    if (!leaves.length) {
      wrap.innerHTML = `<div class="cp-empty"><div class="cp-empty-illus"><div class="glow"></div><i class="fa-solid fa-calendar-check main-i"></i><i class="fa-solid fa-sparkle spark"></i><span class="badge-i"><i class="fa-solid fa-check"></i></span></div><h3>No paused days marked.</h3><p>Sessions paused for a date show here, and that date will count as No Work in attendance.</p></div>`;
      return;
    }
    const today = todayISO();
    wrap.innerHTML = `<table><thead><tr><th>Date</th><th>Reason</th><th></th></tr></thead><tbody>
      ${leaves.map(l => `<tr>
        <td>${l.date?new Date(l.date).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric',weekday:'short'}):'—'}${l.date>=today?' <span class="pill pill-pending" style="margin-left:.3rem;">Upcoming</span>':''}</td>
        <td style="font-size:.82rem;">${escHtml(l.reason)||'—'}</td>
        <td style="display:flex;gap:.3rem;flex-wrap:wrap;">
          ${isAdminView?`<button class="mini-btn" onclick="editClientPauseRow('${l.id}')"><i class="fa-solid fa-pen"></i> Edit</button>`:''}
          ${l.date>=today?`<button class="mini-btn mini-btn-danger" onclick="cancelClientLeave('${l.id}','${clientId}','${wrapId}')"><i class="fa-solid fa-xmark"></i> Cancel</button>`:''}
        </td>
      </tr>`).join('')}
    </tbody></table>`;
  } catch(err) {
    wrap.innerHTML = `<div class="empty"><h3>Could not load paused days.</h3></div>`;
  }
}
window.editClientPauseRow = function(leaveId) {
  const l = window._clientLeavesById?.[leaveId];
  if (!l) return;
  openAdminPauseModal(l.clientId, l);
};

// ─── ADMIN: PAUSE CLIENT SESSIONS (reuses the same hrm_client_leaves collection
// as the parent portal's "Apply Leave" — either side pausing a date excuses that
// client's session for everyone assigned, regular or supplementary, and shows
// as No Work in attendance) ───
window.openAdminPauseModal = function(clientId, editLeave) {
  document.getElementById('apClientId').value = clientId;
  document.getElementById('apEditId').value = editLeave ? editLeave.id : '';
  document.getElementById('apEditOriginalDate').value = editLeave ? editLeave.date : '';
  document.getElementById('apFrom').value = editLeave ? editLeave.date : '';
  document.getElementById('apTo').value = '';
  document.getElementById('apReason').value = editLeave ? (editLeave.reason||'') : '';
  document.getElementById('apToWrap').style.display = editLeave ? 'none' : 'block';
  document.getElementById('apModalTitle').innerHTML = editLeave
    ? '<i class="fa-solid fa-pen" style="color:var(--warn);font-size:1rem;"></i> Edit Paused Session'
    : '<i class="fa-solid fa-calendar-xmark" style="color:var(--warn);font-size:1rem;"></i> Pause Sessions';
  document.getElementById('apSubmitBtn').innerHTML = editLeave
    ? '<i class="fa-solid fa-floppy-disk"></i> Save Changes'
    : '<i class="fa-solid fa-pause"></i> Pause Sessions';
  document.getElementById('adminPauseModal').classList.add('open');
};
document.getElementById('adminPauseForm')?.addEventListener('submit', async ev => {
  ev.preventDefault();
  const clientId = document.getElementById('apClientId').value;
  if (!clientId) return;
  const editId = document.getElementById('apEditId').value;
  const originalDate = document.getElementById('apEditOriginalDate').value;
  const btn = document.getElementById('apSubmitBtn');
  const from = document.getElementById('apFrom').value;
  const reason = document.getElementById('apReason').value.trim();
  if (!from) return;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...'; btn.disabled = true;
  try {
    const cSnap = await getDoc(doc(db,'clients',clientId));
    const studentName = cSnap.exists() ? cSnap.data().studentName : '';

    if (editId) {
      // Editing a single existing paused day. The date is the doc's key, so if it
      // changed we have to delete the old doc and write a fresh one.
      if (from !== originalDate) {
        await deleteDoc(doc(db,'hrm_client_leaves', editId));
      }
      await setDoc(doc(db,'hrm_client_leaves', clientId+'_'+from), {
        clientId, studentName, date: from, reason,
        createdAt: new Date().toISOString()
      });
      document.getElementById('adminPauseModal').classList.remove('open');
      showToast('Paused session updated.');
    } else {
      const to = document.getElementById('apTo').value || from;
      if (to < from) { showToast('End date is before start date.', true); btn.innerHTML = '<i class="fa-solid fa-pause"></i> Pause Sessions'; btn.disabled = false; return; }
      const dates = [];
      let cur = new Date(from+'T00:00:00');
      const end = new Date(to+'T00:00:00');
      while (cur <= end) {
        dates.push(cur.toISOString().slice(0,10));
        cur.setDate(cur.getDate()+1);
      }
      await Promise.all(dates.map(date =>
        setDoc(doc(db,'hrm_client_leaves', clientId+'_'+date), {
          clientId, studentName, date, reason,
          createdAt: new Date().toISOString()
        })
      ));
      document.getElementById('adminPauseModal').classList.remove('open');
      showToast(`Sessions paused for ${dates.length} day${dates.length===1?'':'s'}.`);
    }
    loadClientLeaves(clientId, 'clientDetailPauseWrap');
  } catch(err) { showToast('Error: '+err.message, true); }
  finally { btn.innerHTML = '<i class="fa-solid fa-pause"></i> Pause Sessions'; btn.disabled = false; }
});

// ─── PARENT / ADMIN: REDUCE SESSION HOURS (shortens one client's session on a
// specific date instead of pausing it outright — the assigned staff member's
// attendance for that date+client is then measured against the reduced hours
// rather than the client's normal scheduled duration; stored in its own
// hrm_client_reductions collection, doc id `${clientId}_${date}`) ───
window._reduceHoursClientsById = window._reduceHoursClientsById || {};
window._clientReductionsById = window._clientReductionsById || {};

window.openReduceHoursModal = function(clientId, existing) {
  document.getElementById('rhClientId').value = clientId;
  document.getElementById('rhEditId').value = existing?.id || '';
  document.getElementById('rhDate').value = existing?.date || '';
  document.getElementById('rhHours').value = existing?.hours ?? '';
  document.getElementById('rhReason').value = existing?.reason || '';
  document.getElementById('rhModalTitle').innerHTML = existing
    ? '<i class="fa-solid fa-pen" style="color:var(--warn);font-size:1rem;"></i> Edit Reduced Session'
    : '<i class="fa-solid fa-hourglass-half" style="color:var(--warn);font-size:1rem;"></i> Reduce Session Hours';
  document.getElementById('rhSubmitBtn').innerHTML = existing
    ? '<i class="fa-solid fa-floppy-disk"></i> Save Changes'
    : '<i class="fa-solid fa-paper-plane"></i> Save';
  updateReduceHoursNote();
  document.getElementById('reduceHoursModal').classList.add('open');
};

function updateReduceHoursNote() {
  const note = document.getElementById('rhNormalNote');
  if (!note) return;
  const dateVal = document.getElementById('rhDate').value;
  const clientId = document.getElementById('rhClientId').value;
  const client = window._reduceHoursClientsById[clientId];
  if (!dateVal) { note.textContent = ''; return; }
  const weekday = dateWeekdayName(dateVal);
  const sched = client?.tuitionDays?.find(d => d.day === weekday);
  note.textContent = sched
    ? `Normally scheduled for ${sched.hours}h on ${weekday}s — enter fewer hours than that.`
    : `No regular session is scheduled on ${weekday}s for this date — this only applies if a supplementary session is happening then.`;
}
document.getElementById('rhDate')?.addEventListener('change', updateReduceHoursNote);

document.getElementById('reduceHoursForm')?.addEventListener('submit', async ev => {
  ev.preventDefault();
  const clientId = document.getElementById('rhClientId').value;
  if (!clientId) return;
  const editId = document.getElementById('rhEditId').value;
  const date = document.getElementById('rhDate').value;
  const hours = Number(document.getElementById('rhHours').value);
  const reason = document.getElementById('rhReason').value.trim();
  if (!date) return;
  if (!hours || hours <= 0) { showToast('Enter a valid number of hours.', true); return; }
  const client = window._reduceHoursClientsById[clientId];
  const weekday = dateWeekdayName(date);
  const sched = client?.tuitionDays?.find(d => d.day === weekday);
  if (sched && hours >= sched.hours) { showToast(`Reduced hours must be less than the normal ${sched.hours}h session.`, true); return; }
  const btn = document.getElementById('rhSubmitBtn');
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...'; btn.disabled = true;
  try {
    let studentName = client?.studentName;
    if (!studentName) {
      const cSnap = await getDoc(doc(db,'clients',clientId));
      studentName = cSnap.exists() ? cSnap.data().studentName : '';
    }
    if (editId && editId !== clientId+'_'+date) {
      await deleteDoc(doc(db,'hrm_client_reductions', editId));
    }
    await setDoc(doc(db,'hrm_client_reductions', clientId+'_'+date), {
      clientId, studentName, date, hours, reason,
      createdAt: new Date().toISOString()
    });
    document.getElementById('reduceHoursModal').classList.remove('open');
    showToast(editId ? 'Reduced session updated.' : 'Session hours reduced for that date.');
    loadClientReductions(clientId, window._reduceHoursWrapId);
  } catch(err) { showToast('Error: '+err.message, true); }
  finally {
    btn.innerHTML = editId ? '<i class="fa-solid fa-floppy-disk"></i> Save Changes' : '<i class="fa-solid fa-paper-plane"></i> Save';
    btn.disabled = false;
  }
});

window.cancelClientReduction = async function(id, clientId, wrapId) {
  if (!confirm('Remove this reduced-hours entry? The session will count at its normal scheduled duration again.')) return;
  try {
    await deleteDoc(doc(db,'hrm_client_reductions', id));
    showToast('Reduction removed.');
    loadClientReductions(clientId, wrapId);
  } catch(err) { showToast('Error: '+err.message, true); }
};

async function loadClientReductions(clientId, wrapId) {
  wrapId = wrapId || 'cpReduceWrap';
  window._reduceHoursWrapId = wrapId;
  const wrap = document.getElementById(wrapId);
  if (!wrap) return;
  try {
    const snap = await getDocs(query(collection(db,'hrm_client_reductions'),where('clientId','==',clientId)));
    const rows = snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(b.date||'').localeCompare(a.date||''));
    rows.forEach(r => { window._clientReductionsById[r.id] = r; });
    if (!rows.length) {
      wrap.innerHTML = `<div class="cp-empty"><div class="cp-empty-illus"><div class="glow"></div><i class="fa-solid fa-hourglass-half main-i"></i><i class="fa-solid fa-sparkle spark"></i><span class="badge-i"><i class="fa-solid fa-check"></i></span></div><h3>No reduced sessions.</h3><p>Shortened sessions for a date show here, and staff attendance is measured against the reduced time instead of the normal schedule.</p></div>`;
      return;
    }
    const today = todayISO();
    wrap.innerHTML = `<table><thead><tr><th>Date</th><th>Reduced To</th><th>Reason</th><th></th></tr></thead><tbody>
      ${rows.map(r => `<tr>
        <td>${r.date?new Date(r.date).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric',weekday:'short'}):'—'}${r.date>=today?' <span class="pill pill-pending" style="margin-left:.3rem;">Upcoming</span>':''}</td>
        <td style="font-family:var(--font-mono);">${r.hours}h</td>
        <td style="font-size:.82rem;">${escHtml(r.reason)||'—'}</td>
        <td style="display:flex;gap:.3rem;flex-wrap:wrap;">
          <button class="mini-btn" onclick="editClientReductionRow('${r.id}')"><i class="fa-solid fa-pen"></i> Edit</button>
          ${r.date>=today?`<button class="mini-btn mini-btn-danger" onclick="cancelClientReduction('${r.id}','${clientId}','${wrapId}')"><i class="fa-solid fa-xmark"></i> Cancel</button>`:''}
        </td>
      </tr>`).join('')}
    </tbody></table>`;
  } catch(err) {
    wrap.innerHTML = `<div class="empty"><h3>Could not load reduced sessions.</h3></div>`;
  }
}
window.editClientReductionRow = function(id) {
  const r = window._clientReductionsById[id];
  if (!r) return;
  openReduceHoursModal(r.clientId, r);
};

function cpFormatNotifDate(d) {
  if (!d) return '';
  try {
    const dt = new Date(d);
    if (isNaN(dt.getTime())) return '';
    return dt.toLocaleDateString('en-IN', { day:'numeric', month:'short' });
  } catch(e) { return ''; }
}

function renderCpNotifications(items) {
  const list = items.filter(Boolean).sort((a,b)=>String(b.date||'').localeCompare(String(a.date||'')));
  const listEl = document.getElementById('cpNotifList');
  const countEl = document.getElementById('cpNotifCount');
  if (!listEl || !countEl) return;
  if (!list.length) {
    listEl.innerHTML = `<div class="cp-notif-empty"><i class="fa-regular fa-bell-slash"></i><span>You're all caught up.</span></div>`;
    countEl.style.display = 'none';
    return;
  }
  countEl.style.display = 'flex';
  countEl.textContent = list.length;
  listEl.innerHTML = list.map(n => `
    <div class="cp-notif-item">
      <div class="cp-notif-icon ${n.color}"><i class="fa-solid ${n.icon}"></i></div>
      <div class="cp-notif-body">
        <div class="cp-notif-title">${n.title}</div>
        ${n.sub ? `<div class="cp-notif-sub">${n.sub}</div>` : ''}
        <div class="cp-notif-date">${cpFormatNotifDate(n.date)}</div>
      </div>
    </div>
  `).join('');
}

// Bell toggle + outside-click close — bound once since the header markup is static
(function initCpNotifBell(){
  const bellBtn = document.getElementById('cpBellBtn');
  const panel = document.getElementById('cpNotifPanel');
  if (!bellBtn || !panel) return;
  bellBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const willOpen = !panel.classList.contains('open');
    panel.classList.toggle('open', willOpen);
    bellBtn.classList.toggle('active', willOpen);
  });
  document.addEventListener('click', (e) => {
    if (panel.classList.contains('open') && !panel.contains(e.target) && !bellBtn.contains(e.target)) {
      panel.classList.remove('open');
      bellBtn.classList.remove('active');
    }
  });
})();

// ─── MOBILE SIDEBAR DRAWER (parent + employee portals share .cp-shell) ───
window.toggleCpSidebar = function(screenId) {
  const screen = document.getElementById(screenId);
  if (!screen) return;
  const sidebar = screen.querySelector('.cp-sidebar');
  const backdrop = screen.querySelector('.cp-sidebar-backdrop');
  const opening = !sidebar.classList.contains('mobile-open');
  sidebar.classList.toggle('mobile-open', opening);
  if (backdrop) backdrop.classList.toggle('show', opening);
};
window.closeCpSidebar = function(screenId) {
  const screen = document.getElementById(screenId);
  if (!screen) return;
  screen.querySelector('.cp-sidebar')?.classList.remove('mobile-open');
  screen.querySelector('.cp-sidebar-backdrop')?.classList.remove('show');
};
// Close the drawer automatically whenever a nav item inside it is tapped —
// delegated so it also covers the employee sidebar, which is rebuilt on
// every render (see epBuildSidebarNav).
document.addEventListener('click', (e) => {
  const navItem = e.target.closest('.cp-sidebar .nav-item');
  if (!navItem) return;
  const screen = navItem.closest('#empPortalScreen, #clientPortalScreen');
  if (screen) window.closeCpSidebar(screen.id);
});

function epBuildSidebarNav(user, empDoc, userData, pendingCount) {
  const items = [
    { id:'clock', icon:'fa-clock', label:'Attendance' },
    { id:'leaves', icon:'fa-calendar-minus', label:'My Leaves' },
    { id:'report', icon:'fa-chart-bar', label:'Monthly Report', extra:`loadMyMonthlyReport('${user.uid}','${empDoc.id}')` },
    { id:'profile', icon:'fa-user', label:'My Profile' },
    { id:'editreq', icon:'fa-pen-to-square', label:'Edit Profile' },
    { id:'documents', icon:'fa-folder-open', label:'Documents', extra:`loadMyDocuments('${user.uid}')` },
    { id:'materials', icon:'fa-book', label:'Study Materials' },
    { id:'progress', icon:'fa-chart-line', label:'Student Progress' },
    { id:'testperf', icon:'fa-graduation-cap', label:'Test Performance' },
    { id:'slips', icon:'fa-file-invoice-dollar', label:'Salary Slips', extra:`loadMySlips('${user.uid}')` },
  ];
  if (userData.role === 'manager') {
    items.push({ id:'manage', icon:'fa-users', label:`Team Leaves${pendingCount ? ` (${pendingCount})` : ''}` });
  }
  return items.map((it,i) => `
    <div class="nav-item${i===0?' active':''}" data-ep-nav="${it.id}" onclick="epSidebarNav('${it.id}',this);${it.extra||''}">
      <i class="fa-solid ${it.icon}"></i><span>${it.label}</span>
    </div>`).join('');
}

async function renderEmployeePortal(user, userData) {
  const main = document.getElementById('epMainContent');
  main.innerHTML = `<div class="empty"><h3><i class="fa-solid fa-spinner fa-spin"></i>&ensp;Loading your data...</h3></div>`;

  // Load employee record
  const empSnap = await getDocs(query(collection(db,'hrm_employees'),where('uid','==',user.uid)));
  if (empSnap.empty) {
    main.innerHTML = `<div class="empty"><h3>No employee record found.</h3></div>`;
    return;
  }
  const empDoc = empSnap.docs[0];
  const emp = {id: empDoc.id, ...empDoc.data()};

  // Load my CRM client assignments (each carries its own tuition-day schedule)
  let myAssignedClients = [];
  try {
    const clientSnap = await getDocs(query(collection(db,'clients'),where('assignedUserIds','array-contains',user.uid)));
    myAssignedClients = clientSnap.docs.map(d=>({id:d.id,...d.data()}));
  } catch(e) { console.error('assigned clients load', e); }

  // Today's attendance sessions — one doc per client (id: {uid}_{date}_{clientId}),
  // or a single flat doc ({uid}_{date}) for employees with no client assignments.
  const todayStr = todayISO();
  const todayWeekday = dateWeekdayName(todayStr);
  const attSnap = await getDocs(query(collection(db,'hrm_attendance'),where('empUID','==',user.uid),where('date','==',todayStr)));
  const todaySessionsByClient = {};
  let todayFlatAtt = null, todayFlatAttId = null;
  attSnap.docs.forEach(d => {
    const r = d.data();
    if (r.clientId) todaySessionsByClient[r.clientId] = { id:d.id, ...r };
    else { todayFlatAtt = r; todayFlatAttId = d.id; }
  });
  const todaysScheduledClients = myAssignedClients.filter(c => {
    if (c.startDate && todayStr < c.startDate) return false;
    const at = getClientAssignmentType(c, user.uid);
    if (at.pausedDates.includes(todayStr)) return false; // this person specifically excused today
    return (at.regular && (c.tuitionDays||[]).some(d => d.day === todayWeekday)) || at.supplementaryDates.includes(todayStr);
  });

  // Sessions paused for today (client-level "No Work" days, set by admin or parent)
  // are pulled out of the check-in list — nothing is expected of the employee for them.
  let todayPausedClientIds = new Set();
  try {
    const pauseSnap = await getDocs(query(collection(db,'hrm_client_leaves'),where('date','==',todayStr)));
    const myClientIds = new Set(myAssignedClients.map(c=>c.id));
    pauseSnap.docs.forEach(d => { const l = d.data(); if (myClientIds.has(l.clientId)) todayPausedClientIds.add(l.clientId); });
  } catch(e) { console.error('today pause load', e); }
  const todaysActiveClients = todaysScheduledClients.filter(c => !todayPausedClientIds.has(c.id));
  const todaysPausedClients = todaysScheduledClients.filter(c => todayPausedClientIds.has(c.id));

  // Sessions shortened for today (parent or admin reduced the hours instead of
  // pausing outright) — the check-in card below shows the reduced duration, and
  // that's what's expected of the employee for today's attendance.
  let todayReducedHoursByClient = {};
  try {
    const reductionSnap = await getDocs(query(collection(db,'hrm_client_reductions'),where('date','==',todayStr)));
    const myClientIds2 = new Set(myAssignedClients.map(c=>c.id));
    reductionSnap.docs.forEach(d => { const rr = d.data(); if (myClientIds2.has(rr.clientId)) todayReducedHoursByClient[rr.clientId] = Number(rr.hours)||0; });
  } catch(e) { console.error('today reductions load', e); }

  // Load leaves
  const leaveSnap = await getDocs(query(collection(db,'hrm_leaves'),where('empUID','==',user.uid)));
  const myLeaves = leaveSnap.docs.map(d=>({id:d.id,...d.data()}));

  // Load team leaves I manage (if manager)
  let teamLeaves = [];
  let pendingCount = 0;
  if (userData.role === 'manager') {
    const myEmpSnap = await getDocs(query(collection(db,'hrm_employees'),where('managerId','==',user.uid)));
    const myEmpUIDs = myEmpSnap.docs.map(d=>d.data().uid);
    if (myEmpUIDs.length) {
      const plSnap = await getDocs(collection(db,'hrm_leaves'));
      teamLeaves = plSnap.docs.map(d=>({id:d.id,...d.data()}))
        .filter(l=>myEmpUIDs.includes(l.empUID))
        .sort((a,b)=>(b.appliedAt||'').localeCompare(a.appliedAt||''));
      pendingCount = teamLeaves.filter(l=>l.status==='pending').length;
    }
  }

  const isCheckedIn = todayFlatAtt && todayFlatAtt.checkIn && !todayFlatAtt.checkOut;
  const isCheckedOut = todayFlatAtt && todayFlatAtt.checkIn && todayFlatAtt.checkOut;

  document.getElementById('epSidebarNav').innerHTML = epBuildSidebarNav(user, empDoc, userData, pendingCount);

  main.innerHTML = `
    <!-- CLOCK TAB -->
    <div class="ep-tab-panel active" id="ep-tab-clock">
      ${myAssignedClients.length > 0 ? `
        <div class="card panel">
          <div class="panel-head">
            <div><h2>Today's Sessions</h2><p>${escHtml(todayWeekday)}, ${new Date(todayStr+'T00:00:00').toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'})} — check in and out per client.</p></div>
          </div>
          ${todaysScheduledClients.length === 0
            ? `<div class="empty" style="border:none;"><h3>No sessions scheduled today.</h3><p style="font-size:.8rem;margin-top:.3rem;">None of your assigned clients have a tuition day on ${escHtml(todayWeekday)}s.</p></div>`
            : `<div style="display:grid;gap:.7rem;">
                ${todaysPausedClients.map(c => `<div class="session-row" style="opacity:.7;">
                  <div class="session-row-info">
                    <div class="session-row-name">${escHtml(c.studentName)}</div>
                    <div class="session-row-meta">${escHtml(c.clientNumber)} · Session paused for today</div>
                  </div>
                  <div class="session-row-actions"><span class="pill pill-nowork">No Work</span></div>
                </div>`).join('')}
                ${todaysActiveClients.map(c => {
                  const at = getClientAssignmentType(c, user.uid);
                  const weekdaySched = (c.tuitionDays||[]).find(d=>d.day===todayWeekday);
                  const fullSched = weekdaySched || {hours: 1};
                  const reducedToday = todayReducedHoursByClient[c.id];
                  const isReducedToday = reducedToday !== undefined && reducedToday < fullSched.hours;
                  const sched = isReducedToday ? {hours: reducedToday} : fullSched;
                  const reducedTag = isReducedToday ? ` <span class="pill pill-pending" style="font-size:.65rem;" title="Normally ${fullSched.hours}h">reduced from ${fullSched.hours}h</span>` : '';
                  const isRegularToday = at.regular && !!weekdaySched;
                  const supplementaryTag = (!isRegularToday && at.supplementaryDates.includes(todayStr)) ? ' <span class="pill pill-pending" style="font-size:.65rem;">Supplementary</span>' : '';
                  const sess = todaySessionsByClient[c.id];
                  const sessIn = sess && sess.checkIn && !sess.checkOut;
                  const sessOut = sess && sess.checkIn && sess.checkOut;
                  return `<div class="session-row">
                    <div class="session-row-info">
                      <div class="session-row-name">${escHtml(c.studentName)}${supplementaryTag}${reducedTag}</div>
                      <div class="session-row-meta">${escHtml(c.clientNumber)} · Scheduled ${sched.hours}h
                        ${sessOut ? ` · Logged ${calcDuration(sess.checkIn,sess.checkOut)} · <span style="color:var(--success);">Checked out ${sess.checkOut}</span>`
                          : sessIn ? ` · <span style="color:var(--warn);">Checked in since ${sess.checkIn}</span>`
                          : ` · Not checked in yet`}
                      </div>
                    </div>
                    <div class="session-row-actions">
                      ${sessOut ? `<span class="pill pill-present">Done</span>`
                        : sessIn ? `<button class="btn btn-secondary btn-sm" onclick="openCheckoutNotesModal('${user.uid}','${empDoc.id}','${sess.id}')"><i class="fa-solid fa-right-from-bracket"></i> Check Out</button>`
                        : `<button class="btn btn-gold btn-sm" onclick="doClientCheckIn('${user.uid}','${empDoc.id}','${c.id}','${escHtml(c.clientNumber)}','${escHtml(c.studentName)}',${sched.hours})"><i class="fa-solid fa-right-to-bracket"></i> Check In</button>`}
                    </div>
                  </div>`;
                }).join('')}
              </div>`
          }
        </div>
      ` : `
        <div class="clock-card">
          <div class="clock-time" id="epClock">--:--:--</div>
          <div class="clock-date" id="epDate"></div>
          <div class="clock-status" id="clockStatusText">
            ${isCheckedOut ? `<span style="color:#9FD9B4;"><i class="fa-solid fa-circle-check"></i> Checked out at ${todayFlatAtt.checkOut}</span>` :
              isCheckedIn ? `<span style="color:#E9CE8A;"><i class="fa-solid fa-circle-dot fa-beat"></i> Checked in since ${todayFlatAtt.checkIn}</span>` :
              `<span>Not checked in yet today</span>`}
          </div>
          <div class="clock-btns">
            ${!isCheckedIn && !isCheckedOut ? `<button class="clock-in-btn" onclick="doCheckIn('${user.uid}','${empDoc.id}')"><i class="fa-solid fa-right-to-bracket"></i> Check In</button>` : ''}
            ${isCheckedIn ? `<button class="clock-out-btn" onclick="openCheckoutNotesModal('${user.uid}','${empDoc.id}','${todayFlatAttId}')"><i class="fa-solid fa-right-from-bracket"></i> Check Out</button>` : ''}
            ${isCheckedOut ? `<div style="color:#9FD9B4;font-size:.9rem;"><i class="fa-solid fa-circle-check"></i> Attendance marked for today. Duration: ${calcDuration(todayFlatAtt.checkIn,todayFlatAtt.checkOut)}</div>` : ''}
          </div>
        </div>
      `}
      <div style="margin-top:1rem;">
        <div class="card panel"><div class="panel-head"><h2>My Attendance History</h2></div>
          <div class="table-wrap" id="epMyAttTable"><div class="empty"><h3>Loading...</h3></div></div>
        </div>
      </div>
    </div>

    <!-- LEAVES TAB -->
    <div class="ep-tab-panel" id="ep-tab-leaves">
      <div class="info-box" style="margin-bottom:1rem;">
        <i class="fa-solid fa-circle-info"></i> Leave requests are for advance notice only — approved or not, leave days are counted the same as an absence for attendance and payroll.
      </div>
      <div class="card panel">
        <div class="panel-head"><div><h2>Leave Requests</h2></div><button class="btn btn-gold" onclick="openLeaveModal('${user.uid}','${empDoc.id}','${userData.role}','${emp.managerId||''}')"><i class="fa-solid fa-plus"></i> Apply Leave</button></div>
        <div class="table-wrap">
          <table><thead><tr><th>Type</th><th>From</th><th>To</th><th>Days</th><th>Reason</th><th>Status</th></tr></thead>
          <tbody>
            ${myLeaves.length ? myLeaves.sort((a,b)=>(b.appliedAt||'').localeCompare(a.appliedAt||'')).map(l=>`
              <tr><td><span class="pill ${leavePillClass(l.leaveType)}">${escHtml(leaveLabel(l.leaveType))}</span></td>
              <td>${escHtml(l.fromDate)}</td><td>${escHtml(l.toDate)}</td>
              <td>${escHtml(String(l.days??1))}</td><td>${escHtml(l.reason||'—')}</td>
              <td><span class="pill pill-${escHtml(l.status||'pending')}">${escHtml(l.status||'pending')}</span></td></tr>`).join('')
            : '<tr><td colspan="6" style="text-align:center;color:var(--text-3);font-style:italic;padding:1.5rem;">No leave requests yet.</td></tr>'}
          </tbody></table>
        </div>
      </div>
    </div>

    </div>

    <!-- MONTHLY REPORT TAB (Employee self-view) -->
    <div class="ep-tab-panel" id="ep-tab-report">
      <div class="card panel" style="padding:.9rem 1rem;margin-bottom:1rem;">
        <div class="panel-head">
          <div><h2>My Monthly Report</h2><p>Each day's required hours = sum of your scheduled clients' session durations that day. Logging less than that marks the day Absent; days with no client scheduled aren't counted at all.</p></div>
          <div style="display:flex;gap:.5rem;align-items:center;">
            <input class="input" type="month" id="empReportMonth" style="width:160px;padding:.5rem .8rem;">
            <button class="btn btn-gold" onclick="loadMyMonthlyReport('${user.uid}','${empDoc.id}')"><i class="fa-solid fa-rotate"></i> Load</button>
          </div>
        </div>
      </div>
      <div id="empReportWrap">
        <div class="empty"><div class="empty-icon">📊</div><h3>Select a month above and click Load.</h3></div>
      </div>
    </div>

    <!-- PROFILE TAB -->
    <div class="ep-tab-panel" id="ep-tab-profile">
      <div class="card panel">
        <div class="panel-head"><h2>My Profile</h2></div>
        <div style="display:flex;gap:1rem;align-items:flex-start;flex-wrap:wrap;margin-bottom:.3rem;">
          <div class="profile-photo-wrap" onclick="openPhotoUploadModal('${user.uid}','${escHtml(emp.name)}')">
            ${emp.photoURL
              ? `<img class="profile-photo" src="${escHtml(emp.photoURL)}" alt="Profile">`
              : `<div class="profile-photo-initials">${escHtml(emp.name.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase())}</div>`}
            <div class="photo-upload-btn" title="Change photo"><i class="fa-solid fa-camera"></i></div>
          </div>
          <div id="epHomeStats" style="flex:1;display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:1rem;min-width:0;">
            <div class="stat-card"><div class="stat-label">Name</div><div class="stat-value" style="font-size:1.05rem;font-family:var(--font-head);">${escHtml(emp.name)}</div><div class="stat-help">${escHtml(emp.title||'')}</div></div>
            <div class="stat-card"><div class="stat-label">Employee ID</div><div class="stat-value" style="font-size:1.05rem;">${escHtml(emp.employeeId||'')}</div><div class="stat-help">${escHtml(emp.role||'employee')}</div></div>
            <div class="stat-card"><div class="stat-label">Leave Requests</div><div class="stat-value" style="font-size:1.05rem;">${myLeaves.filter(l=>l.status==='pending').length} pending</div><div class="stat-help">${myLeaves.length} total submitted</div></div>
            <div class="stat-card" style="border-left:3px solid var(--gold);"><div class="stat-label">Annual CTC</div><div class="stat-value" style="font-size:1.05rem;color:var(--warn);">${formatCurrency(emp.salary||0)}</div><div class="stat-help">Monthly: ${formatCurrency(Math.round((emp.salary||0)/12))}</div></div>
          </div>
        </div>
        <div class="ep-detail-grid" style="display:grid;grid-template-columns:repeat(3,1fr);gap:.7rem;margin-top:1rem;">
          ${profileDetailItem('Name', emp.name)}
          ${profileDetailItem('Employee ID', emp.employeeId)}
          ${profileDetailItem('Title', emp.title)}
          ${profileDetailItem('Email', emp.email)}
          ${profileDetailItem('Phone', emp.phone)}
          ${profileDetailItem('Gender', emp.gender)}
          ${profileDetailItem('Date of Hiring', formatDate(emp.dateOfHiring))}
          ${profileDetailItem('PAN', emp.pan)}
          ${profileDetailItem('Aadhaar', emp.aadhaar ? '••••'+emp.aadhaar.slice(-4) : '—')}
          ${profileDetailItem('Bank Account', emp.bankAccount ? '••••'+emp.bankAccount.slice(-4) : '—')}
          ${profileDetailItem('IFSC', emp.ifsc)}
          ${profileDetailItem('Bank Name', emp.bankName)}
        </div>
        <div class="ep-detail-grid" style="margin-top:1rem;padding:1rem;border-radius:var(--r-md);background:linear-gradient(135deg,var(--gold-soft),rgba(201,168,76,0.05));border:1px solid var(--gold-border);display:grid;grid-template-columns:1fr 1fr 1fr;gap:.7rem;">
          <div>
            <div style="font-size:.68rem;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--warn);margin-bottom:.3rem;"><i class="fa-solid fa-indian-rupee-sign"></i> Annual CTC</div>
            <div style="font-size:1.3rem;font-family:var(--font-mono);font-weight:700;color:var(--ink);">${formatCurrency(emp.salary||0)}</div>
          </div>
          <div>
            <div style="font-size:.68rem;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--text-3);margin-bottom:.3rem;">Monthly Gross</div>
            <div style="font-size:1.1rem;font-family:var(--font-mono);color:var(--ink);">${formatCurrency(Math.round((emp.salary||0)/12))}</div>
          </div>
          <div>
            <div style="font-size:.68rem;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--text-3);margin-bottom:.3rem;">Daily Rate (26d)</div>
            <div style="font-size:1.1rem;font-family:var(--font-mono);color:var(--ink);">${formatCurrency(Math.round((emp.salary||0)/12/26))}</div>
          </div>
        </div>
      </div>
    </div>

    <!-- EDIT PROFILE TAB -->
    <div class="ep-tab-panel" id="ep-tab-editreq">
      <div class="card panel" style="margin-bottom:1rem;">
        <div class="panel-head">
          <div><h2>Request Profile Edit</h2><p>Submit changes to your profile. Admin will review and approve.</p></div>
          <button class="btn btn-gold" onclick="openEmpEditReqModal('${empDoc.id}','${escHtml(JSON.stringify({phone:emp.phone||'',gender:emp.gender||'',pan:emp.pan||'',aadhaar:emp.aadhaar||'',bankAccount:emp.bankAccount||'',ifsc:emp.ifsc||'',bankName:emp.bankName||'',bankHolder:emp.bankHolder||''})).replace(/'/g,"&#39;")}')">
            <i class="fa-solid fa-plus"></i> New Edit Request
          </button>
        </div>
      </div>
      <div class="card panel">
        <div class="panel-head"><h2>My Edit Requests</h2></div>
        <div class="table-wrap" id="ep-my-edit-reqs"><div class="empty"><h3><i class="fa-solid fa-spinner fa-spin"></i> Loading...</h3></div></div>
      </div>
    </div>

    <!-- DOCUMENTS TAB -->
    <div class="ep-tab-panel" id="ep-tab-documents">
      <div class="card panel">
        <div class="panel-head">
          <div><h2>My Documents</h2><p>Upload PAN card, Aadhaar, mark sheets, and other documents.</p></div>
        </div>
        <!-- Compact upload bar -->
        <div style="display:flex;gap:.6rem;align-items:center;flex-wrap:wrap;padding:.75rem;background:var(--surface-2);border:1px solid var(--border-2);border-radius:var(--r-md);margin-bottom:1rem;">
          <select class="select-filter" id="docTypeSelect" style="flex:1;min-width:160px;">
            <option value="pan">PAN Card</option>
            <option value="aadhaar">Aadhaar Card</option>
            <option value="marksheet_10">10th Mark Sheet</option>
            <option value="marksheet_12">12th Mark Sheet</option>
            <option value="degree">Degree Certificate</option>
            <option value="offer_letter">Offer Letter</option>
            <option value="relieving">Relieving Letter</option>
            <option value="experience">Experience Certificate</option>
            <option value="other">Other</option>
          </select>
          <label style="display:inline-flex;align-items:center;gap:.45rem;padding:.5rem 1rem;border-radius:var(--r-sm);background:var(--gold);color:var(--ink-strong);font-weight:700;font-size:.82rem;cursor:pointer;white-space:nowrap;transition:filter .15s;" onmouseover="this.style.filter='brightness(1.08)'" onmouseout="this.style.filter=''">
            <i class="fa-solid fa-paperclip"></i> Attach File
            <input type="file" style="display:none" accept=".pdf,.jpg,.jpeg,.png" multiple onchange="handleDocFileSelect(event,'${user.uid}')">
          </label>
          <span style="font-size:.72rem;color:var(--text-3);">PDF, JPG, PNG — Max 5 MB</span>
        </div>
        <div id="docUploadStatus"></div>
        <div id="docGrid" class="doc-grid"><div class="empty" style="grid-column:1/-1;border:none;"><h3><i class="fa-solid fa-spinner fa-spin"></i> Loading...</h3></div></div>
      </div>
    </div>

    <!-- STUDY MATERIALS TAB -->
    <div class="ep-tab-panel" id="ep-tab-materials">
      <div class="card panel">
        <div class="panel-head">
          <div><h2>Study Materials</h2><p>Upload worksheets, notes, or resources for a specific student.</p></div>
        </div>
        <div class="field" style="max-width:360px;">
          <label>Student / Client</label>
          <select class="select-input" id="smClientSelect" onchange="loadStudyMaterials(this.value)">
            <option value="">Select a client…</option>
            ${myAssignedClients.map(c=>`<option value="${escHtml(c.id)}" data-number="${escHtml(c.clientNumber)}" data-student="${escHtml(c.studentName)}">${escHtml(c.clientNumber)} — ${escHtml(c.studentName)}</option>`).join('')}
          </select>
          ${myAssignedClients.length===0 ? '<div class="muted-note" style="margin-top:.4rem;">No clients are assigned to you yet.</div>' : ''}
        </div>
        <div id="smUploadWrap" style="display:none;margin:1rem 0;">
          <div style="display:flex;gap:.6rem;align-items:center;flex-wrap:wrap;padding:.75rem;background:var(--surface-2);border:1px solid var(--border-2);border-radius:var(--r-md);">
            <input class="input" id="smTitle" placeholder="Title / description (optional)" style="flex:1;min-width:180px;">
            <label style="display:inline-flex;align-items:center;gap:.45rem;padding:.5rem 1rem;border-radius:var(--r-sm);background:var(--gold);color:var(--ink-strong);font-weight:700;font-size:.82rem;cursor:pointer;white-space:nowrap;" onmouseover="this.style.filter='brightness(1.08)'" onmouseout="this.style.filter=''">
              <i class="fa-solid fa-paperclip"></i> Attach File
              <input type="file" style="display:none" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx" multiple onchange="handleStudyMaterialSelect(event)">
            </label>
            <span style="font-size:.72rem;color:var(--text-3);">PDF, JPG, PNG, DOC — Max 5 MB</span>
          </div>
          <div id="smUploadStatus"></div>
        </div>
        <div id="smGrid" class="doc-grid"><div class="empty" style="grid-column:1/-1;border:none;"><h3>Select a student to see their materials.</h3></div></div>
      </div>
    </div>

    <!-- STUDENT PROGRESS TAB -->
    <div class="ep-tab-panel" id="ep-tab-progress">
      <div class="card panel">
        <div class="panel-head">
          <div><h2>Student Progress</h2><p>Log what was covered and how a student is doing.</p></div>
        </div>
        <div class="field" style="max-width:360px;">
          <label>Student / Client</label>
          <select class="select-input" id="spClientSelect" onchange="loadStudentProgress(this.value)">
            <option value="">Select a client…</option>
            ${myAssignedClients.map(c=>`<option value="${escHtml(c.id)}" data-number="${escHtml(c.clientNumber)}" data-student="${escHtml(c.studentName)}">${escHtml(c.clientNumber)} — ${escHtml(c.studentName)}</option>`).join('')}
          </select>
          ${myAssignedClients.length===0 ? '<div class="muted-note" style="margin-top:.4rem;">No clients are assigned to you yet.</div>' : ''}
        </div>
        <div id="spFormWrap" style="display:none;margin:1rem 0;">
          <div class="modal-alert" id="spAlert"></div>
          <form id="spForm" class="form-grid" onsubmit="return false;">
            <div class="form-row">
              <div class="field"><label>Subject / Topic</label><input class="input" id="sp_subject" placeholder="e.g. Algebra, Chapter 4"></div>
              <div class="field"><label>Date</label><input class="input" id="sp_date" type="date"></div>
            </div>
            <div class="field"><label>Progress Notes <span class="req">*</span></label><textarea class="input" id="sp_note" rows="3" placeholder="What was covered, how the student performed, areas to work on…"></textarea></div>
            <button class="btn btn-gold" type="button" id="spSaveBtn" onclick="submitStudentProgress()"><i class="fa-solid fa-plus"></i> Add Progress Update</button>
          </form>
        </div>
        <div class="perf-log-divider" id="spDivider" style="display:none;"><span>Progress History</span></div>
        <div id="spLog"><p class="muted-note">Select a student to see their progress log.</p></div>
      </div>
    </div>

    <!-- TEST PERFORMANCE TAB -->
    <div class="ep-tab-panel" id="ep-tab-testperf">
      <div class="card panel">
        <div class="panel-head">
          <div><h2>Student Test Performance</h2><p>Record marks for a student's test, by subject and date.</p></div>
        </div>
        <div class="field" style="max-width:360px;">
          <label>Student / Client</label>
          <select class="select-input" id="tpClientSelect" onchange="loadTestPerformance(this.value)">
            <option value="">Select a client…</option>
            ${myAssignedClients.map(c=>`<option value="${escHtml(c.id)}" data-number="${escHtml(c.clientNumber)}" data-student="${escHtml(c.studentName)}">${escHtml(c.clientNumber)} — ${escHtml(c.studentName)}</option>`).join('')}
          </select>
          ${myAssignedClients.length===0 ? '<div class="muted-note" style="margin-top:.4rem;">No clients are assigned to you yet.</div>' : ''}
        </div>
        <div id="tpFormWrap" style="display:none;margin:1rem 0;">
          <div class="modal-alert" id="tpAlert"></div>
          <form id="tpForm" class="form-grid" onsubmit="return false;">
            <div class="form-row">
              <div class="field"><label>Subject <span class="req">*</span></label><input class="input" id="tp_subject" placeholder="e.g. Mathematics"></div>
              <div class="field"><label>Test Date <span class="req">*</span></label><input class="input" id="tp_date" type="date"></div>
            </div>
            <div class="form-row">
              <div class="field"><label>Marks Obtained <span class="req">*</span></label><input class="input" id="tp_marksObtained" type="number" min="0" step="0.01" placeholder="e.g. 42"></div>
              <div class="field"><label>Total Marks <span class="req">*</span></label><input class="input" id="tp_totalMarks" type="number" min="0" step="0.01" placeholder="e.g. 50"></div>
            </div>
            <div class="field"><label>Remarks</label><textarea class="input" id="tp_remarks" rows="2" placeholder="Optional notes on performance…"></textarea></div>
            <div class="field">
              <label>Answer Sheet (optional)</label>
              <div style="display:flex;gap:.6rem;align-items:center;flex-wrap:wrap;">
                <label style="display:inline-flex;align-items:center;gap:.45rem;padding:.5rem 1rem;border-radius:var(--r-sm);background:var(--gold);color:var(--ink-strong);font-weight:700;font-size:.82rem;cursor:pointer;white-space:nowrap;" onmouseover="this.style.filter='brightness(1.08)'" onmouseout="this.style.filter=''">
                  <i class="fa-solid fa-paperclip"></i> Attach File
                  <input type="file" style="display:none" accept=".pdf,.jpg,.jpeg,.png" onchange="handleTpFileSelect(event)">
                </label>
                <span style="font-size:.72rem;color:var(--text-3);">PDF, JPG, PNG — Max 5 MB</span>
                <span id="tpFileName" style="font-size:.78rem;color:var(--text-2);"></span>
              </div>
            </div>
            <button class="btn btn-gold" type="button" id="tpSaveBtn" onclick="submitTestPerformance()"><i class="fa-solid fa-plus"></i> Add Test Result</button>
          </form>
        </div>
        <div class="perf-log-divider" id="tpDivider" style="display:none;"><span>Test History</span></div>
        <div id="tpLog"><p class="muted-note">Select a student to see their test performance log.</p></div>
      </div>
    </div>

    <!-- SALARY SLIPS TAB -->
    <div class="ep-tab-panel" id="ep-tab-slips">
      <div class="card panel">
        <div class="panel-head"><div><h2>My Salary Slips</h2><p>Salary slips uploaded by HR or Admin. Click to download.</p></div></div>
        <div class="table-wrap" id="empSlipsWrap"><div class="empty"><h3><i class="fa-solid fa-spinner fa-spin"></i> Loading...</h3></div></div>
      </div>
    </div>

    ${userData.role === 'manager' ? `
    <div class="ep-tab-panel" id="ep-tab-manage">
      <div class="card panel">
        <div class="panel-head"><h2>Team Leave Requests</h2><p>Approve, reject, or delete your team's requests.</p></div>
        <div class="table-wrap">
          <table><thead><tr><th>Employee</th><th>Type</th><th>From</th><th>To</th><th>Days</th><th>Reason</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>
            ${teamLeaves.length ? teamLeaves.map(l=>`
              <tr><td><strong>${escHtml(l.empName||'')}</strong></td>
              <td><span class="pill ${leavePillClass(l.leaveType)}">${escHtml(leaveLabel(l.leaveType))}</span></td>
              <td>${escHtml(l.fromDate)}</td><td>${escHtml(l.toDate)}</td>
              <td>${escHtml(String(l.days??1))}</td><td>${escHtml(l.reason||'—')}</td>
              <td><span class="pill pill-${l.status||'pending'}">${l.status||'pending'}</span></td>
              <td style="display:flex;gap:.3rem;flex-wrap:wrap;">
                ${l.status==='pending'?`
                  <button class="mini-btn mini-btn-success" onclick="actionLeave('${l.id}','approved','${l.empUID}','${l.leaveType}',${l.days??1},true)"><i class="fa-solid fa-check"></i> Approve</button>
                  <button class="mini-btn mini-btn-danger" onclick="actionLeave('${l.id}','rejected','${l.empUID}','${l.leaveType}',${l.days??1},true)"><i class="fa-solid fa-xmark"></i> Reject</button>
                ` : ''}
                <button class="mini-btn mini-btn-danger" onclick="deleteLeave('${l.id}',true)"><i class="fa-solid fa-trash"></i> Delete</button>
              </td></tr>`).join('')
            : '<tr><td colspan="8" style="text-align:center;color:var(--text-3);font-style:italic;padding:1.5rem;">No team leave requests.</td></tr>'}
          </tbody></table>
        </div>
      </div>
    </div>` : ''}
  `;

  startClock();
  loadMyAttHistory(user.uid);
  loadMyEditRequests(user.uid);
}

function profileDetailItem(label, val) {
  return `<div style="padding:.75rem;border-radius:var(--r-sm);border:1px solid var(--border-2);background:var(--surface-2);">
    <div style="font-size:.68rem;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--text-3);margin-bottom:.3rem;">${label}</div>
    <div style="font-size:.84rem;color:var(--text);">${escHtml(val||'—')}</div>
  </div>`;
}

window.epSidebarNav = function(name, el) {
  document.querySelectorAll('#empPortalScreen .cp-sidebar .nav-item').forEach(n=>n.classList.remove('active'));
  el.classList.add('active');
  document.querySelectorAll('#empPortalScreen .ep-tab-panel').forEach(p=>p.classList.remove('active'));
  const panel = document.getElementById('ep-tab-'+name);
  if (panel) panel.classList.add('active');
  const mainEl = document.querySelector('#empPortalScreen .cp-main');
  if (mainEl) mainEl.scrollTo({top:0,behavior:'smooth'});
};
// kept as an alias so any older call sites (or inline onclick strings) referencing epSwitchTab keep working
window.epSwitchTab = window.epSidebarNav;

function startClock() {
  if (clockInterval) clearInterval(clockInterval);
  function tick() {
    const now = new Date();
    const el = document.getElementById('epClock');
    const de = document.getElementById('epDate');
    if (el) el.textContent = now.toLocaleTimeString('en-IN');
    if (de) de.textContent = now.toLocaleDateString('en-IN',{weekday:'long',day:'2-digit',month:'long',year:'numeric'});
  }
  tick();
  clockInterval = setInterval(tick, 1000);
}

function calcDuration(checkIn, checkOut) {
  if (!checkIn || !checkOut) return '—';
  const [ih,im,is_] = checkIn.split(':').map(Number);
  const [oh,om,os_] = checkOut.split(':').map(Number);
  const diff = (oh*3600+om*60+(os_||0)) - (ih*3600+im*60+(is_||0));
  const h = Math.floor(diff/3600), m = Math.floor((diff%3600)/60);
  return `${h}h ${m}m`;
}

window.doCheckIn = async function(uid, empDocId) {
  const now = new Date();
  const timeStr = now.toTimeString().split(' ')[0];
  const dateStr = now.toISOString().split('T')[0];
  const attId = `${uid}_${dateStr}`;
  try {
    await setDoc(doc(db,'hrm_attendance',attId), {empUID:uid, empDocId, date:dateStr, checkIn:timeStr, checkOut:null, createdAt: now.toISOString()});
    showToast('Checked in at '+timeStr);
    const ud = await getDoc(doc(db,'hrm_users',uid));
    renderEmployeePortal(window.hrmCurrentUser, ud.data());
  } catch(e) { showToast('Check-in failed: '+e.message, true); }
};

// Per-client session check-in — one attendance doc per (employee, date, client),
// so each client's session is tracked and reportable on its own.
window.doClientCheckIn = async function(uid, empDocId, clientId, clientNumber, studentName, scheduledHours) {
  const now = new Date();
  const timeStr = now.toTimeString().split(' ')[0];
  const dateStr = now.toISOString().split('T')[0];
  const attId = `${uid}_${dateStr}_${clientId}`;
  try {
    await setDoc(doc(db,'hrm_attendance',attId), {
      empUID:uid, empDocId, clientId, clientNumber, studentName,
      scheduledHours: Number(scheduledHours)||0,
      date:dateStr, checkIn:timeStr, checkOut:null, createdAt: now.toISOString()
    });
    showToast(`Checked in for ${studentName} at ${timeStr}`);
    const ud = await getDoc(doc(db,'hrm_users',uid));
    renderEmployeePortal(window.hrmCurrentUser, ud.data());
  } catch(e) { showToast('Check-in failed: '+e.message, true); }
};

window.doCheckOut = async function(uid, empDocId, attDocId, notes) {
  const now = new Date();
  const timeStr = now.toTimeString().split(' ')[0];
  try {
    const payload = { checkOut: timeStr };
    if (notes) payload.checkOutNotes = notes;
    await setDoc(doc(db,'hrm_attendance',attDocId), payload, {merge:true});
    showToast('Checked out at '+timeStr);
    const ud = await getDoc(doc(db,'hrm_users',uid));
    renderEmployeePortal(window.hrmCurrentUser, ud.data());
  } catch(e) { showToast('Check-out failed: '+e.message, true); }
};

let _checkoutTarget = null;
window.openCheckoutNotesModal = function(uid, empDocId, attDocId) {
  _checkoutTarget = { uid, empDocId, attDocId };
  document.getElementById('checkoutNotesText').value = '';
  document.getElementById('checkoutNotesModal').classList.add('open');
};
window.submitCheckoutNotes = async function() {
  if (!_checkoutTarget) return;
  const notes = document.getElementById('checkoutNotesText').value.trim();
  document.getElementById('checkoutNotesModal').classList.remove('open');
  await doCheckOut(_checkoutTarget.uid, _checkoutTarget.empDocId, _checkoutTarget.attDocId, notes);
  _checkoutTarget = null;
};

async function loadMyAttHistory(uid) {
  const el = document.getElementById('epMyAttTable');
  if (!el) return;
  try {
    const snap = await getDocs(query(collection(db,'hrm_attendance'),where('empUID','==',uid)));
    let recs = snap.docs.map(d=>({id:d.id,...d.data()}));

    // Approved regularizations count as Present (and are paid) — show them here too.
    let regByKey = {};
    try {
      const regSnap = await getDocs(query(collection(db,'hrm_regularizations'),where('empUID','==',uid),where('status','==','approved')));
      regSnap.docs.forEach(d=>{ const r=d.data(); if (r.date) regByKey[r.date] = r; });
    } catch(e) { /* ignore — history still loads without the regularization overlay */ }
    recs = recs.map(r=>{
      if (regByKey[r.date]) { const reg = regByKey[r.date]; delete regByKey[r.date]; return {...r, regularized:true, regHours:reg.hours, regReason:reg.reason}; }
      return r;
    });
    Object.values(regByKey).forEach(reg=>{
      recs.push({
        id: 'reg_'+reg.empUID+'_'+reg.date,
        empUID: reg.empUID, date: reg.date, clientId: reg.clientId, clientLabel: reg.clientLabel,
        scheduledHours: reg.hours, regularized: true, regHours: reg.hours, regReason: reg.reason,
        checkIn: null, checkOut: null
      });
    });

    recs = recs.sort((a,b)=>b.date.localeCompare(a.date)).slice(0,40);
    if (!recs.length) { el.innerHTML=`<div class="empty" style="border:none;"><h3>No records yet.</h3></div>`; return; }
    el.innerHTML = `<table><thead><tr><th>Date</th><th>Client</th><th>Check In</th><th>Check Out</th><th>Logged</th><th>Scheduled</th><th>Notes</th></tr></thead><tbody>
      ${recs.map(r=>{
        const clientCell = r.clientNumber
          ? `${escHtml(r.clientNumber)}<div style="font-size:.72rem;color:var(--text-3);">${escHtml(r.studentName)}</div>`
          : (r.clientLabel ? escHtml(r.clientLabel) : '<span style="color:var(--text-3);">—</span>');
        if (r.regularized) {
          return `<tr>
          <td>${escHtml(r.date)}</td>
          <td>${clientCell}</td>
          <td>${escHtml(r.checkIn||'—')}</td>
          <td>${escHtml(r.checkOut||'—')}</td>
          <td>${r.regHours||0}h <span class="pill pill-present" style="margin-left:.2rem;">Regularized</span></td>
          <td>${r.scheduledHours?`${r.scheduledHours}h`:'—'}</td>
          <td style="max-width:220px;font-size:.78rem;">${escHtml(r.checkOutNotes||r.regReason)||'<span style="color:var(--text-3);">—</span>'}</td>
        </tr>`;
        }
        const mins = calcDurationMinutes(r.checkIn, r.checkOut);
        const met = r.scheduledHours ? mins >= r.scheduledHours*60 : null;
        return `<tr>
        <td>${escHtml(r.date)}</td>
        <td>${clientCell}</td>
        <td>${escHtml(r.checkIn||'—')}</td>
        <td>${escHtml(r.checkOut||'—')}</td>
        <td>${calcDuration(r.checkIn,r.checkOut)}${met===false?' <span class="pill pill-pending" style="margin-left:.2rem;">Short</span>':met===true?' <span class="pill pill-present" style="margin-left:.2rem;">Met</span>':''}</td>
        <td>${r.scheduledHours?`${r.scheduledHours}h`:'—'}</td>
        <td style="max-width:220px;font-size:.78rem;">${escHtml(r.checkOutNotes)||'<span style="color:var(--text-3);">—</span>'}</td>
      </tr>`;}).join('')}
    </tbody></table>`;
  } catch(e) { el.innerHTML=`<div class="empty"><h3>Error loading records.</h3></div>`; }
}

// ─── LEAVE MODAL ───
window.openLeaveModal = function(uid, empDocId, role, managerId) {
  window._leaveContext = {uid, empDocId, role, managerId};
  document.getElementById('leaveForm').reset();
  onLeaveTypeChange();
  document.getElementById('leaveModal').classList.add('open');
};
window.onLeaveTypeChange = function() {
  const t = document.getElementById('leaveType').value;
  const def = LEAVE_TYPES[t] || {};
  const toWrap = document.getElementById('leaveToWrap');
  const toInput = document.getElementById('leaveTo');
  const fromInput = document.getElementById('leaveFrom');
  const fromLabel = document.getElementById('leaveFromLabel');
  const info = document.getElementById('leaveDaysInfo');
  // Always show the From → To date range
  toWrap.style.display = '';
  fromLabel.textContent = 'From Date';
  if (def.half) {
    // Half day applies to a single date: lock To to From
    if (toInput) {
      toInput.readOnly = true;
      toInput.required = false;
      toInput.value = fromInput.value || '';
      toInput.style.background = 'var(--border-2)';
    }
    info.innerHTML = '<i class="fa-solid fa-circle-info"></i> Half-day leave — <strong>0.5 day</strong> on the From date.';
  } else {
    if (toInput) {
      toInput.readOnly = false;
      toInput.required = true;
      toInput.style.background = '';
    }
    info.innerHTML = '<i class="fa-solid fa-circle-info"></i> Full-day leave — counts as <strong>1 day per date</strong> in the range.';
  }
};
window.closeLeaveModal = function() { document.getElementById('leaveModal').classList.remove('open'); };
document.getElementById('leaveFrom').addEventListener('input', () => {
  const t = document.getElementById('leaveType').value;
  if (LEAVE_TYPES[t] && LEAVE_TYPES[t].half) {
    document.getElementById('leaveTo').value = document.getElementById('leaveFrom').value;
  }
});

document.getElementById('leaveForm').addEventListener('submit', async e => {
  e.preventDefault();
  const ctx = window._leaveContext;
  if (!ctx) return;
  const leaveType = document.getElementById('leaveType').value;
  const def = LEAVE_TYPES[leaveType] || {};
  const fromDate = document.getElementById('leaveFrom').value;
  const reason = document.getElementById('leaveReason').value.trim();
  if (!fromDate) { showToast('Please select a date.', true); return; }
  let toDate, days;
  if (def.half) {
    toDate = fromDate;
    days = 0.5;
  } else {
    toDate = document.getElementById('leaveTo').value || fromDate;
    if (new Date(toDate) < new Date(fromDate)) { showToast('To date is before from date.', true); return; }
    days = Math.max(1, Math.ceil((new Date(toDate)-new Date(fromDate))/86400000)+1);
  }

  // Get employee name
  const empSnap = await getDocs(query(collection(db,'hrm_employees'),where('uid','==',ctx.uid)));
  const empName = empSnap.empty ? '' : empSnap.docs[0].data().name;

  const leaveId = 'lv_'+Date.now();
  const leaveData = {
    empUID: ctx.uid, empDocId: ctx.empDocId, empName,
    leaveType, fromDate, toDate, days, reason,
    status: 'pending',
    forRole: ctx.role, // 'employee' or 'manager'
    managerId: ctx.managerId || null, // if employee: goes to manager; if manager: goes to admin
    appliedAt: new Date().toISOString()
  };
  try {
    await setDoc(doc(db,'hrm_leaves',leaveId), leaveData);
    closeLeaveModal();
    document.getElementById('leaveForm').reset();
    showToast('Leave request submitted!');
    // Reload portal
    const ud = await getDoc(doc(db,'hrm_users',ctx.uid));
    renderEmployeePortal(window.hrmCurrentUser, ud.data());
  } catch(err) { showToast('Error: '+err.message, true); }
});

// Action a leave (approve/reject). No balance to adjust anymore — this
// just records the decision. Attendance/payroll treats every leave day
// (approved or not) the same as an ordinary absence — see buildMonthReport.
window.actionLeave = async function(leaveId, action, empUID, leaveType, days, fromPortal=false) {
  try {
    await setDoc(doc(db,'hrm_leaves',leaveId), {status:action, actionedAt:new Date().toISOString()}, {merge:true});
    showToast(`Leave ${action}!`);
    if (fromPortal) {
      const ud = await getDoc(doc(db,'hrm_users',window.hrmCurrentUser.uid));
      renderEmployeePortal(window.hrmCurrentUser, ud.data());
    } else {
      loadLeaves();
    }
  } catch(err) { showToast('Error: '+err.message, true); }
};

// Delete a leave request (managers & admin). Refunds balance only if it was approved.
window.deleteLeave = async function(leaveId, fromPortal=false) {
  if (!confirm('Delete this leave request permanently? This cannot be undone.')) return;
  try {
    await deleteDoc(doc(db,'hrm_leaves',leaveId));
    showToast('Leave request deleted.');
    if (fromPortal) {
      const ud = await getDoc(doc(db,'hrm_users',window.hrmCurrentUser.uid));
      renderEmployeePortal(window.hrmCurrentUser, ud.data());
    } else {
      loadLeaves();
    }
  } catch(err) { showToast('Delete error: '+err.message, true); }
};

// ─── ADMIN: EMPLOYEE SYNC ───
function startEmployeeSync() {
  if (firestoreUnsubEmp) firestoreUnsubEmp();
  firestoreUnsubEmp = onSnapshot(collection(db,'hrm_employees'), snap => {
    window.hrmEmployees = snap.docs.map(d=>({id:d.id,...d.data()}));
    renderCurrentAdminPage();
  });
}

function startLeaveSync() {
  if (firestoreUnsubLeave) firestoreUnsubLeave();
  firestoreUnsubLeave = onSnapshot(collection(db,'hrm_leaves'), ()=>{
    if (document.getElementById('pageLeaves')?.classList.contains('active')) loadLeaves();
    if (document.getElementById('pageDashboard')?.classList.contains('active')) renderDashboard();
  });
}

// ════════════════════════════════════════════════════════════
// CRM — Leads / Clients / Users
// Reuses the same 'leads' / 'clients' / 'counters' Firestore collections
// the public website's demo-booking form already writes to, so leads
// submitted there show up here automatically. "Users" (who can be
// assigned to clients) are just employees with crmAssignable:true on
// their hrm_employees/hrm_users record — set via the "Can be assigned
// to CRM clients" checkbox on Add/Edit Employee. There is no separate
// account-creation flow here.
// ════════════════════════════════════════════════════════════
const CRM_PREFIX = { leads: 'SJ-LD-', clients: 'SJ-CL-' };
async function crmNextNumber(kind) {
  const ref = doc(db, 'counters', kind);
  const next = await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const current = snap.exists() ? (snap.data().count || 0) : 0;
    const updated = current + 1;
    tx.set(ref, { count: updated });
    return updated;
  });
  return CRM_PREFIX[kind] + String(next).padStart(4, '0');
}

function startCrmSync() {
  if (firestoreUnsubCrmLeads) firestoreUnsubCrmLeads();
  firestoreUnsubCrmLeads = onSnapshot(query(collection(db,'leads'), orderBy('createdAt','desc')), snap => {
    window.hrmLeads = snap.docs.map(d=>({id:d.id,...d.data()}));
    if (document.getElementById('pageLeads')?.classList.contains('active')) renderLeadsPage();
    if (document.getElementById('pageDashboard')?.classList.contains('active')) renderDashboard();
  }, err => console.error('leads sync', err));

  if (firestoreUnsubCrmClients) firestoreUnsubCrmClients();
  firestoreUnsubCrmClients = onSnapshot(query(collection(db,'clients'), orderBy('createdAt','desc')), snap => {
    window.hrmClients = snap.docs.map(d=>({id:d.id,...d.data()}));
    if (document.getElementById('pageClients')?.classList.contains('active')) renderClientsPage();
    if (document.getElementById('pageCrmUsers')?.classList.contains('active')) renderCrmUsersPage();
    if (document.getElementById('pageDashboard')?.classList.contains('active')) renderDashboard();
  }, err => console.error('clients sync', err));
  // Note: no separate 'crm_users' listener — CRM-assignable people are just
  // employees tagged crmAssignable:true, sourced from window.hrmEmployees
  // (already kept in sync by startEmployeeSync()).
}

function crmVal(id){ return (document.getElementById(id).value||'').trim(); }
function crmSetVal(id,v){ document.getElementById(id).value = v||''; }

// ─── CLIENT TUITION SCHEDULE (days + duration) ───
const WEEK_DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
function renderClientScheduleGrid(existingDays) {
  const map = {};
  (existingDays||[]).forEach(d => { map[d.day] = d.hours; });
  const grid = document.getElementById('cf_scheduleGrid');
  if (!grid) return;
  grid.innerHTML = WEEK_DAYS.map(day => {
    const checked = map.hasOwnProperty(day);
    const hrs = checked ? map[day] : '';
    return `<div class="sched-row${checked?' on':''}" id="sched-row-${day}">
      <label><input type="checkbox" data-sched-day="${day}" ${checked?'checked':''} onchange="toggleSchedRow('${day}',this.checked)"> ${day}</label>
      <div class="sched-dur"><input type="number" min="0.5" step="0.5" data-sched-hours="${day}" value="${hrs}" placeholder="hrs"> hrs / session</div>
    </div>`;
  }).join('');
}
window.toggleSchedRow = function(day, on) {
  const row = document.getElementById('sched-row-'+day);
  if (!row) return;
  row.classList.toggle('on', on);
  if (on) {
    const input = row.querySelector('[data-sched-hours]');
    if (input && !input.value) input.value = '1';
  }
};
function collectClientSchedule() {
  const grid = document.getElementById('cf_scheduleGrid');
  if (!grid) return [];
  return WEEK_DAYS
    .map(day => {
      const cb = grid.querySelector(`[data-sched-day="${day}"]`);
      const hrsInput = grid.querySelector(`[data-sched-hours="${day}"]`);
      if (!cb || !cb.checked) return null;
      const hours = Number(hrsInput?.value) || 1;
      return { day, hours };
    })
    .filter(Boolean);
}
function formatClientSchedule(tuitionDays) {
  if (!tuitionDays || !tuitionDays.length) return '<span class="muted-note">No tuition days set.</span>';
  return tuitionDays.map(d => `<span class="sched-badge"><i class="fa-solid fa-clock"></i> ${escHtml(d.day.slice(0,3))} · ${d.hours}h</span>`).join(' ');
}
function clientWeeklyHours(tuitionDays) {
  return (tuitionDays||[]).reduce((s,d)=>s+(Number(d.hours)||0),0);
}
function crmFmtDate(ts){
  if(!ts) return '—';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'});
}
function crmFmtDateTime(ts){
  if(!ts) return '—';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleString('en-IN',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'});
}
function crmPillClass(status){ return 'pill pill-'+String(status||'new').toLowerCase().replace(/\s+/g,''); }

const LEAD_STATUSES = ['New','Contacted','Converted','Lost'];
function crmLeadStatusSelect(l) {
  const current = l.status || 'New';
  const opts = LEAD_STATUSES.map(s => `<option value="${s}" ${s===current?'selected':''}>${s}</option>`).join('');
  return `<select class="status-select ${crmPillClass(current)}" onchange="updateLeadStatus('${l.id}',this.value)">${opts}</select>`;
}

window.updateLeadStatus = async function(id, status) {
  try {
    await setDoc(doc(db,'leads',id), { status }, { merge:true });
    showToast('Lead status updated.');
  } catch(e) { showToast('Could not update status: '+e.message, true); }
};

// ─── LEADS ───
function renderLeadsPage() {
  const wrap = document.getElementById('leadsTableWrap');
  const leads = window.hrmLeads || [];
  const search = crmVal('leadSearch').toLowerCase();
  const statusFilter = document.getElementById('leadStatusFilter').value;

  const rows = leads.filter(l=>{
    if (statusFilter && l.status !== statusFilter) return false;
    if (!search) return true;
    return [l.leadNumber,l.parentName,l.studentName,l.phone,l.email,l.subjects,l.area].join(' ').toLowerCase().includes(search);
  });

  if (rows.length === 0) {
    wrap.innerHTML = `<div class="empty"><div class="empty-icon">📥</div><h3>No leads yet.</h3><p style="font-size:.8rem;margin-top:.3rem;">New website enquiries will appear here automatically.</p></div>`;
  } else {
    wrap.innerHTML = `<table><thead><tr><th>Lead #</th><th>Student / Parent</th><th>Contact</th><th>Subjects</th><th>Area</th><th>Source</th><th>Status</th><th>Received</th><th>Actions</th></tr></thead><tbody>
      ${rows.map(l=>`
        <tr>
          <td><strong>${escHtml(l.leadNumber)}</strong></td>
          <td>${escHtml(l.studentName)}<div style="font-size:.75rem;color:var(--text-3);">${escHtml(l.parentName)}</div></td>
          <td>${escHtml(l.phone)}${l.email?`<div style="font-size:.75rem;color:var(--text-3);">${escHtml(l.email)}</div>`:''}</td>
          <td>${escHtml(l.subjects)}</td>
          <td>${escHtml(l.area)}</td>
          <td><span class="pill" style="background:var(--surface-2);color:var(--text-2);">${escHtml(l.source||'manual')}</span></td>
          <td>${crmLeadStatusSelect(l)}</td>
          <td style="font-size:.78rem;color:var(--text-3);">${crmFmtDateTime(l.createdAt)}</td>
          <td class="row-actions">
            <button class="btn-icon" title="View" onclick="openLeadDetailModal('${l.id}')"><i class="fa-solid fa-eye"></i></button>
            <button class="btn-icon" title="Delete" onclick="deleteLead('${l.id}')"><i class="fa-solid fa-trash"></i></button>
          </td>
        </tr>`).join('')}
    </tbody></table>`;
  }
}

window.openAddLeadModal = function() {
  document.getElementById('leadModalTitle').innerHTML = '<i class="fa-solid fa-inbox" style="color:var(--gold);font-size:1rem;"></i> Add Lead';
  document.getElementById('leadForm').reset();
  document.getElementById('lf_id').value = '';
  document.getElementById('leadModal').classList.add('open');
};

window.openLeadEditModal = function(lead) {
  document.getElementById('leadModalTitle').innerHTML = '<i class="fa-solid fa-inbox" style="color:var(--gold);font-size:1rem;"></i> Edit Lead';
  document.getElementById('lf_id').value = lead.id;
  crmSetVal('lf_parentName',lead.parentName); crmSetVal('lf_studentName',lead.studentName);
  crmSetVal('lf_phone',lead.phone); crmSetVal('lf_email',lead.email);
  crmSetVal('lf_grade',lead.grade); crmSetVal('lf_curriculum',lead.curriculum);
  crmSetVal('lf_subjects',lead.subjects); crmSetVal('lf_area',lead.area);
  crmSetVal('lf_status',lead.status); crmSetVal('lf_notes',lead.notes);
  document.getElementById('leadModal').classList.add('open');
};

window.deleteLead = async function(id) {
  if (!confirm('Delete this lead? This cannot be undone.')) return;
  try { await deleteDoc(doc(db,'leads',id)); showToast('Lead deleted.'); }
  catch(e){ showToast('Could not delete lead: '+e.message, true); }
};

window.openLeadDetailModal = function(id) {
  const lead = (window.hrmLeads||[]).find(l=>l.id===id);
  if (!lead) return;
  document.getElementById('leadDetailTitle').innerHTML = `<i class="fa-solid fa-inbox" style="color:var(--gold);font-size:1rem;"></i> ${escHtml(lead.leadNumber)}`;
  document.getElementById('leadDetailBody').innerHTML = `
    <div class="form-row">
      <div><div style="font-size:.72rem;text-transform:uppercase;color:var(--text-3);font-weight:700;">Parent / Guardian</div><div>${escHtml(lead.parentName)}</div></div>
      <div><div style="font-size:.72rem;text-transform:uppercase;color:var(--text-3);font-weight:700;">Student</div><div>${escHtml(lead.studentName)}</div></div>
    </div>
    <div class="form-row" style="margin-top:.8rem;">
      <div><div style="font-size:.72rem;text-transform:uppercase;color:var(--text-3);font-weight:700;">Phone</div><div>${escHtml(lead.phone)}</div></div>
      <div><div style="font-size:.72rem;text-transform:uppercase;color:var(--text-3);font-weight:700;">Email</div><div>${escHtml(lead.email)||'—'}</div></div>
    </div>
    <div class="form-row" style="margin-top:.8rem;">
      <div><div style="font-size:.72rem;text-transform:uppercase;color:var(--text-3);font-weight:700;">Subjects</div><div>${escHtml(lead.subjects)}</div></div>
      <div><div style="font-size:.72rem;text-transform:uppercase;color:var(--text-3);font-weight:700;">Area</div><div>${escHtml(lead.area)}</div></div>
    </div>
    <div style="margin-top:.8rem;"><div style="font-size:.72rem;text-transform:uppercase;color:var(--text-3);font-weight:700;">Received</div><div>${crmFmtDateTime(lead.createdAt)} &middot; ${escHtml(lead.source||'manual')}</div></div>
    ${lead.message?`<div class="info-box" style="margin-top:.8rem;"><i class="fa-solid fa-message"></i> ${escHtml(lead.message)}</div>`:''}
    ${lead.notes?`<div class="info-box" style="margin-top:.8rem;"><i class="fa-solid fa-note-sticky"></i> ${escHtml(lead.notes)}</div>`:''}
    ${lead.clientNumber?`<div class="info-box" style="margin-top:.8rem;"><i class="fa-solid fa-circle-check"></i> Converted to client <strong>${escHtml(lead.clientNumber)}</strong>.</div>`:''}
  `;
  const foot = document.getElementById('leadDetailFoot');
  foot.innerHTML = `<button class="btn btn-secondary" onclick="document.getElementById('leadDetailModal').classList.remove('open');openLeadEditModal(${JSON.stringify(lead).replace(/"/g,'&quot;')})">Edit</button>`;
  if (lead.status !== 'Converted') {
    const convertBtn = document.createElement('button');
    convertBtn.className = 'btn btn-gold';
    convertBtn.innerHTML = '<i class="fa-solid fa-right-long"></i> Convert to Client';
    convertBtn.onclick = () => { document.getElementById('leadDetailModal').classList.remove('open'); convertLeadToClient(lead); };
    foot.appendChild(convertBtn);
  }
  document.getElementById('leadDetailModal').classList.add('open');
};

async function convertLeadToClient(lead) {
  if (!confirm(`Convert ${lead.leadNumber} into a client record?`)) return;
  try {
    const clientNumber = await crmNextNumber('clients');
    const clientRef = doc(collection(db,'clients'));
    await setDoc(clientRef, {
      parentName: lead.parentName, studentName: lead.studentName, phone: lead.phone, email: lead.email||'',
      grade: lead.grade||'', curriculum: lead.curriculum||'', subjects: lead.subjects, area: lead.area,
      status: 'Active', assignedUserIds: [], assignmentMeta: {}, notes: lead.notes||'', startDate: todayISO(),
      clientNumber, leadId: lead.id, leadNumber: lead.leadNumber, createdAt: serverTimestamp()
    });
    await setDoc(doc(db,'leads',lead.id), { status:'Converted', clientId: clientRef.id, clientNumber }, { merge:true });
    showToast(`Converted to client ${clientNumber}.`);
  } catch(e) { showToast('Could not convert lead: '+e.message, true); }
}

// ─── CRM: CLIENT / PARENT PORTAL LOGIN ───
window.openClientLoginModal = function(clientId) {
  const c = (window.hrmClients||[]).find(x=>x.id===clientId);
  document.getElementById('clLoginClientId').value = clientId;
  document.getElementById('clLoginEmail').value = c?.email || '';
  document.getElementById('clLoginPass').value = '';
  document.getElementById('clLoginAlert').className = 'modal-alert';
  document.getElementById('clientLoginModal').classList.add('open');
};

window.submitClientLogin = async function() {
  const clientId = document.getElementById('clLoginClientId').value;
  const email = document.getElementById('clLoginEmail').value.trim();
  const pass = document.getElementById('clLoginPass').value;
  const alertEl = document.getElementById('clLoginAlert');
  alertEl.className = 'modal-alert';
  const c = (window.hrmClients||[]).find(x=>x.id===clientId);
  if (!c) { alertEl.textContent = 'Client record not found.'; alertEl.className = 'modal-alert show error'; return; }
  if (!email || !pass) { alertEl.textContent = 'Email and password are required.'; alertEl.className = 'modal-alert show error'; return; }
  if (pass.length < 6) { alertEl.textContent = 'Password must be at least 6 characters.'; alertEl.className = 'modal-alert show error'; return; }
  const btn = document.getElementById('clLoginSaveBtn');
  btn.disabled = true; btn.innerHTML = 'Creating…';
  try {
    const cred = await createUserWithEmailAndPassword(secondaryAuth, email, pass);
    await signOut(secondaryAuth);
    const uid = cred.user.uid;
    await setDoc(doc(db,'hrm_users',uid), {
      role: 'client', clientId, name: c.parentName || c.studentName, email,
      status: 'active', createdAt: new Date().toISOString()
    });
    await setDoc(doc(db,'clients',clientId), { loginUid: uid, loginEmail: email }, { merge:true });
    showToast('Client login created successfully!');
    document.getElementById('clientLoginModal').classList.remove('open');
    setTimeout(()=>openClientDetailModal(clientId), 300);
  } catch(err) {
    alertEl.textContent = 'Could not create login: ' + err.message;
    alertEl.className = 'modal-alert show error';
  } finally {
    btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-key"></i> Create Login';
  }
};

document.getElementById('addLeadBtn')?.addEventListener('click', () => window.openAddLeadModal());
document.getElementById('leadSearch')?.addEventListener('input', renderLeadsPage);
document.getElementById('leadStatusFilter')?.addEventListener('change', renderLeadsPage);
document.getElementById('leadForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const payload = {
    parentName: crmVal('lf_parentName'), studentName: crmVal('lf_studentName'),
    phone: crmVal('lf_phone'), email: crmVal('lf_email'),
    grade: crmVal('lf_grade'), curriculum: crmVal('lf_curriculum'),
    subjects: crmVal('lf_subjects'), area: crmVal('lf_area'),
    status: crmVal('lf_status')||'New', notes: crmVal('lf_notes')
  };
  const id = document.getElementById('lf_id').value;
  const btn = document.getElementById('leadSaveBtn');
  btn.disabled = true;
  try {
    if (id) {
      await setDoc(doc(db,'leads',id), payload, { merge:true });
      showToast('Lead updated.');
    } else {
      const leadNumber = await crmNextNumber('leads');
      const ref = doc(collection(db,'leads'));
      await setDoc(ref, { ...payload, leadNumber, source:'manual', createdAt: serverTimestamp() });
      showToast(`Lead ${leadNumber} created.`);
    }
    document.getElementById('leadModal').classList.remove('open');
  } catch(err) { showToast('Could not save lead: '+err.message, true); }
  finally { btn.disabled = false; }
});

// ─── CLIENTS ───
function crmAssignedTutorTags(ids, assignmentMeta) {
  if (!ids || ids.length===0) return '<span style="color:var(--text-3);font-size:.78rem;">Unassigned</span>';
  return ids.map(uid=>{
    const u = (window.hrmEmployees||[]).find(x=>x.uid===uid);
    const meta = assignmentMeta?.[uid];
    let isRegular = true, hasSup = false;
    if (meta) {
      if (meta.regular === undefined && meta.supplementaryDates === undefined && meta.type !== undefined) {
        isRegular = meta.type !== 'supplementary';
        hasSup = meta.type === 'supplementary' && (meta.dates||[]).length > 0;
      } else {
        isRegular = meta.regular !== false;
        hasSup = (meta.supplementaryDates||[]).length > 0;
      }
    }
    const tag = !isRegular && hasSup ? ' <span style="color:var(--gold);">(Supp)</span>' : (isRegular && hasSup ? ' <span style="color:var(--gold);">(+Supp)</span>' : '');
    return `<span class="pill" style="background:var(--surface-2);color:var(--text-2);margin:1px 3px 0 0;">${escHtml(u?u.name:'User')}${tag}</span>`;
  }).join('');
}

function renderClientsPage() {
  const wrap = document.getElementById('clientsTableWrap');
  const clients = window.hrmClients || [];
  const search = crmVal('clientSearch').toLowerCase();
  const statusFilter = document.getElementById('clientStatusFilter').value;

  const rows = clients.filter(c=>{
    if (statusFilter && c.status !== statusFilter) return false;
    if (!search) return true;
    return [c.clientNumber,c.parentName,c.studentName,c.phone,c.email,c.subjects,c.area].join(' ').toLowerCase().includes(search);
  });

  if (rows.length === 0) {
    wrap.innerHTML = `<div class="empty"><div class="empty-icon">👥</div><h3>No clients yet.</h3><p style="font-size:.8rem;margin-top:.3rem;">Convert a lead, or add one directly.</p></div>`;
  } else {
    wrap.innerHTML = `<table><thead><tr><th>Client #</th><th>Student / Parent</th><th>Contact</th><th>Subjects</th><th>Area</th><th>Fee</th><th>Assigned User(s)</th><th>Status</th><th>Since</th><th>Actions</th></tr></thead><tbody>
      ${rows.map(c=>`
        <tr>
          <td><strong>${escHtml(c.clientNumber)}</strong></td>
          <td>${escHtml(c.studentName)}<div style="font-size:.75rem;color:var(--text-3);">${escHtml(c.parentName)}</div></td>
          <td>${escHtml(c.phone)}${c.email?`<div style="font-size:.75rem;color:var(--text-3);">${escHtml(c.email)}</div>`:''}</td>
          <td>${escHtml(c.subjects)}</td>
          <td>${escHtml(c.area)}</td>
          <td style="font-family:var(--font-mono);">${c.fee?formatCurrency(c.fee):'—'}</td>
          <td>${crmAssignedTutorTags(c.assignedUserIds, c.assignmentMeta)}</td>
          <td><span class="pill pill-${(c.status||'active').toLowerCase()}">${escHtml(c.status||'Active')}</span></td>
          <td style="font-size:.78rem;color:var(--text-3);">${crmFmtDate(c.createdAt)}</td>
          <td class="row-actions">
            <button class="btn-icon" title="View" onclick="openClientDetailModal('${c.id}')"><i class="fa-solid fa-eye"></i></button>
            <button class="btn-icon" title="Assign users" onclick="openAssignUsersModal('${c.id}')"><i class="fa-solid fa-user-shield"></i></button>
            <button class="btn-icon" title="Delete" onclick="deleteClient('${c.id}')"><i class="fa-solid fa-trash"></i></button>
          </td>
        </tr>`).join('')}
    </tbody></table>`;
  }
}

window.openAddClientModal = function() {
  document.getElementById('clientModalTitle').innerHTML = '<i class="fa-solid fa-user-group" style="color:var(--gold);font-size:1rem;"></i> Add Client';
  document.getElementById('clientForm').reset();
  document.getElementById('cf_id').value = '';
  crmSetVal('cf_startDate', todayISO());
  renderClientScheduleGrid([]);
  document.getElementById('clientModal').classList.add('open');
};

window.openClientEditModal = function(client) {
  document.getElementById('clientModalTitle').innerHTML = '<i class="fa-solid fa-user-group" style="color:var(--gold);font-size:1rem;"></i> Edit Client';
  document.getElementById('cf_id').value = client.id;
  crmSetVal('cf_parentName',client.parentName); crmSetVal('cf_studentName',client.studentName);
  crmSetVal('cf_phone',client.phone); crmSetVal('cf_email',client.email);
  crmSetVal('cf_grade',client.grade); crmSetVal('cf_curriculum',client.curriculum);
  crmSetVal('cf_subjects',client.subjects); crmSetVal('cf_area',client.area);
  crmSetVal('cf_status',client.status); crmSetVal('cf_notes',client.notes);
  crmSetVal('cf_fee',client.fee);
  crmSetVal('cf_startDate', client.startDate || todayISO());
  renderClientScheduleGrid(client.tuitionDays||[]);
  document.getElementById('clientModal').classList.add('open');
};

window.deleteClient = async function(id) {
  if (!confirm('Delete this client record? This cannot be undone.')) return;
  try { await deleteDoc(doc(db,'clients',id)); showToast('Client deleted.'); }
  catch(e){ showToast('Could not delete client: '+e.message, true); }
};

async function loadClientDetailMaterials(clientId) {
  const grid = document.getElementById('clientDetailMaterials');
  if (!grid) return;
  try {
    const snap = await getDocs(query(collection(db,'hrm_study_materials'),where('clientId','==',clientId)));
    const mats = snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(b.uploadedAt||'').localeCompare(a.uploadedAt||''));
    if (!mats.length) {
      grid.innerHTML = `<div class="empty" style="grid-column:1/-1;border:none;padding:1rem;"><h3 style="font-size:.85rem;">No study materials uploaded yet.</h3></div>`;
      return;
    }
    grid.innerHTML = mats.map(m => {
      const icon = m.fileType === 'application/pdf' ? '📄' : (m.fileType && m.fileType.startsWith('image/') ? '🖼️' : '📎');
      const date = m.uploadedAt ? new Date(m.uploadedAt).toLocaleDateString('en-IN') : '';
      return `<div class="doc-card">
        <div style="display:flex;align-items:center;gap:.6rem;">
          <div class="doc-card-icon">${icon}</div>
          <div style="min-width:0;">
            <div class="doc-card-name" title="${escHtml(m.fileName)}">${escHtml(m.title)||escHtml(m.fileName)}</div>
            <div class="doc-card-meta">by ${escHtml(m.uploadedByName)} · ${date}</div>
          </div>
        </div>
        <div class="doc-card-actions">
          <button class="mini-btn" onclick="previewStudyMaterial('${m.id}')"><i class="fa-solid fa-eye"></i> View</button>
        </div>
      </div>`;
    }).join('');
  } catch(err) {
    grid.innerHTML = `<div class="empty" style="grid-column:1/-1;padding:1rem;"><h3 style="font-size:.85rem;">Could not load materials.</h3></div>`;
  }
}

async function loadClientDetailProgress(clientId) {
  const wrap = document.getElementById('clientDetailProgress');
  if (!wrap) return;
  try {
    const snap = await getDocs(query(collection(db,'hrm_student_progress'),where('clientId','==',clientId)));
    const entries = snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(b.createdAt||'').localeCompare(a.createdAt||''));
    if (!entries.length) {
      wrap.innerHTML = `<p class="muted-note">No progress updates yet.</p>`;
      return;
    }
    wrap.innerHTML = entries.map(e => `
      <div class="perf-entry">
        <div class="perf-entry-head">
          <span class="perf-entry-subject">${escHtml(e.subject)||'General update'}</span>
          <span class="perf-entry-date">${escHtml(e.date)||(e.createdAt?new Date(e.createdAt).toLocaleDateString('en-IN'):'')}</span>
        </div>
        <div class="perf-entry-note">${escHtml(e.note)}</div>
        <div class="perf-entry-meta">
          <span>Added by ${escHtml(e.addedByName)}</span>
          <button class="perf-entry-del" onclick="deleteStudentProgress('${e.id}','${clientId}')">Delete</button>
        </div>
      </div>
    `).join('');
  } catch(err) {
    wrap.innerHTML = `<p class="muted-note">Could not load progress history.</p>`;
  }
}

window.openClientDetailModal = function(id) {
  const c = (window.hrmClients||[]).find(x=>x.id===id);
  if (!c) return;
  document.getElementById('clientDetailTitle').innerHTML = `<i class="fa-solid fa-user-group" style="color:var(--gold);font-size:1rem;"></i> ${escHtml(c.clientNumber)}`;
  document.getElementById('clientDetailBody').innerHTML = `
    <div class="form-row">
      <div><div style="font-size:.72rem;text-transform:uppercase;color:var(--text-3);font-weight:700;">Parent / Guardian</div><div>${escHtml(c.parentName)}</div></div>
      <div><div style="font-size:.72rem;text-transform:uppercase;color:var(--text-3);font-weight:700;">Student</div><div>${escHtml(c.studentName)}</div></div>
    </div>
    <div class="form-row" style="margin-top:.8rem;">
      <div><div style="font-size:.72rem;text-transform:uppercase;color:var(--text-3);font-weight:700;">Phone</div><div>${escHtml(c.phone)}</div></div>
      <div><div style="font-size:.72rem;text-transform:uppercase;color:var(--text-3);font-weight:700;">Email</div><div>${escHtml(c.email)||'—'}</div></div>
    </div>
    <div class="form-row" style="margin-top:.8rem;">
      <div><div style="font-size:.72rem;text-transform:uppercase;color:var(--text-3);font-weight:700;">Subjects</div><div>${escHtml(c.subjects)}</div></div>
      <div><div style="font-size:.72rem;text-transform:uppercase;color:var(--text-3);font-weight:700;">Area</div><div>${escHtml(c.area)}</div></div>
    </div>
    <div class="form-row" style="margin-top:.8rem;">
      <div><div style="font-size:.72rem;text-transform:uppercase;color:var(--text-3);font-weight:700;">Fee</div><div style="font-family:var(--font-mono);color:var(--warn);font-weight:700;">${c.fee?formatCurrency(c.fee):'—'}</div></div>
      <div><div style="font-size:.72rem;text-transform:uppercase;color:var(--text-3);font-weight:700;">Status</div><div><span class="pill pill-${(c.status||'active').toLowerCase()}">${escHtml(c.status||'Active')}</span></div></div>
    </div>
    <div class="form-row" style="margin-top:.8rem;">
      <div><div style="font-size:.72rem;text-transform:uppercase;color:var(--text-3);font-weight:700;">Start Date</div><div>${c.startDate?new Date(c.startDate+'T00:00:00').toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'}):'—'}</div></div>
    </div>
    <div style="margin-top:.8rem;"><div style="font-size:.72rem;text-transform:uppercase;color:var(--text-3);font-weight:700;margin-bottom:.35rem;">Tuition Schedule</div><div style="display:flex;gap:.4rem;flex-wrap:wrap;align-items:center;">${formatClientSchedule(c.tuitionDays)} ${c.tuitionDays?.length?`<span class="muted-note">(${clientWeeklyHours(c.tuitionDays)} hrs/week)</span>`:''}</div></div>
    <div style="margin-top:.8rem;"><div style="font-size:.72rem;text-transform:uppercase;color:var(--text-3);font-weight:700;">Assigned User(s)</div><div>${crmAssignedTutorTags(c.assignedUserIds, c.assignmentMeta)}</div></div>
    <div style="margin-top:1rem;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:.5rem;">
        <div style="font-size:.72rem;text-transform:uppercase;color:var(--text-3);font-weight:700;"><i class="fa-solid fa-calendar-xmark"></i> Paused Sessions</div>
        <button class="mini-btn" onclick="openAdminPauseModal('${c.id}')"><i class="fa-solid fa-pause"></i> Pause Dates</button>
      </div>
      <div id="clientDetailPauseWrap"><p class="muted-note"><i class="fa-solid fa-spinner fa-spin"></i> Loading…</p></div>
    </div>
    <div style="margin-top:1rem;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:.5rem;">
        <div style="font-size:.72rem;text-transform:uppercase;color:var(--text-3);font-weight:700;"><i class="fa-solid fa-hourglass-half"></i> Reduced Sessions</div>
        <button class="mini-btn" onclick="openReduceHoursModal('${c.id}')"><i class="fa-solid fa-clock"></i> Reduce a Date</button>
      </div>
      <div id="clientDetailReduceWrap"><p class="muted-note"><i class="fa-solid fa-spinner fa-spin"></i> Loading…</p></div>
    </div>
    ${c.leadNumber?`<div class="info-box" style="margin-top:.8rem;"><i class="fa-solid fa-circle-check"></i> Converted from lead <strong>${escHtml(c.leadNumber)}</strong>.</div>`:''}
    ${c.notes?`<div class="info-box" style="margin-top:.8rem;"><i class="fa-solid fa-note-sticky"></i> ${escHtml(c.notes)}</div>`:''}
    <div style="margin-top:.8rem;">
      <div style="font-size:.72rem;text-transform:uppercase;color:var(--text-3);font-weight:700;margin-bottom:.4rem;"><i class="fa-solid fa-key"></i> Parent / Client Login</div>
      ${c.loginUid
        ? `<div class="info-box"><i class="fa-solid fa-circle-check"></i> Login active — ${escHtml(c.loginEmail)}</div>`
        : `<div class="muted-note" style="margin-bottom:.4rem;">No portal login has been created for this client yet.</div><button class="btn btn-secondary btn-sm" onclick="openClientLoginModal('${c.id}')"><i class="fa-solid fa-key"></i> Create Login</button>`}
    </div>
    <div style="margin-top:1rem;">
      <div style="font-size:.72rem;text-transform:uppercase;color:var(--text-3);font-weight:700;margin-bottom:.5rem;"><i class="fa-solid fa-chart-line"></i> Student Progress</div>
      <div id="clientDetailProgress"><p class="muted-note"><i class="fa-solid fa-spinner fa-spin"></i> Loading…</p></div>
    </div>
    <div style="margin-top:1rem;">
      <div style="font-size:.72rem;text-transform:uppercase;color:var(--text-3);font-weight:700;margin-bottom:.5rem;"><i class="fa-solid fa-book"></i> Study Materials</div>
      <div id="clientDetailMaterials" class="doc-grid"><div class="empty" style="grid-column:1/-1;border:none;padding:1rem;"><h3 style="font-size:.85rem;"><i class="fa-solid fa-spinner fa-spin"></i> Loading…</h3></div></div>
    </div>
  `;
  loadClientDetailMaterials(c.id);
  loadClientDetailProgress(c.id);
  loadClientLeaves(c.id, 'clientDetailPauseWrap');
  window._reduceHoursClientsById = window._reduceHoursClientsById || {};
  window._reduceHoursClientsById[c.id] = c;
  loadClientReductions(c.id, 'clientDetailReduceWrap');
  document.getElementById('clientDetailFoot').innerHTML = `
    <button class="btn btn-secondary" onclick="document.getElementById('clientDetailModal').classList.remove('open');openClientEditModal(${JSON.stringify(c).replace(/"/g,'&quot;')})">Edit</button>
    <button class="btn btn-gold" onclick="document.getElementById('clientDetailModal').classList.remove('open');openAssignUsersModal('${c.id}')"><i class="fa-solid fa-user-shield"></i> Assign Users</button>
  `;
  document.getElementById('clientDetailModal').classList.add('open');
};

document.getElementById('addClientBtn')?.addEventListener('click', () => window.openAddClientModal());
document.getElementById('clientSearch')?.addEventListener('input', renderClientsPage);
document.getElementById('clientStatusFilter')?.addEventListener('change', renderClientsPage);
document.getElementById('clientForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const tuitionDays = collectClientSchedule();
  if (!tuitionDays.length) { showToast('Select at least one tuition day and duration.', true); return; }
  const payload = {
    parentName: crmVal('cf_parentName'), studentName: crmVal('cf_studentName'),
    phone: crmVal('cf_phone'), email: crmVal('cf_email'),
    grade: crmVal('cf_grade'), curriculum: crmVal('cf_curriculum'),
    subjects: crmVal('cf_subjects'), area: crmVal('cf_area'),
    status: crmVal('cf_status')||'Active', notes: crmVal('cf_notes'),
    fee: Number(crmVal('cf_fee'))||0,
    startDate: crmVal('cf_startDate') || todayISO(),
    tuitionDays
  };
  const id = document.getElementById('cf_id').value;
  const btn = document.getElementById('clientSaveBtn');
  btn.disabled = true;
  try {
    if (id) {
      await setDoc(doc(db,'clients',id), payload, { merge:true });
      showToast('Client updated.');
    } else {
      const clientNumber = await crmNextNumber('clients');
      const ref = doc(collection(db,'clients'));
      await setDoc(ref, { ...payload, clientNumber, assignedUserIds:[], assignmentMeta:{}, createdAt: serverTimestamp() });
      showToast(`Client ${clientNumber} created.`);
    }
    document.getElementById('clientModal').classList.remove('open');
  } catch(err) { showToast('Could not save client: '+err.message, true); }
  finally { btn.disabled = false; }
});

// ─── ASSIGN USERS ↔ CLIENTS ───
// Per user, per client, three independent things can be set:
//  - regular            : follows the client's normal weekly tuition schedule
//  - supplementaryDates  : extra one-off dates this person covers, on top of (or
//                          instead of) their regular days — e.g. a substitute session
//  - pausedDates         : dates this person is specifically excused from — e.g.
//                          someone else covered their regular session that day
// A staff member can be Regular AND have Supplementary dates AND have Paused dates,
// all at once — they're independent, not mutually exclusive.
let _assignUsersTargetClientId = null;
window._auSup = {};    // { uid: ['YYYY-MM-DD', ...] } — supplementary dates, working state while modal is open
window._auPaused = {}; // { uid: ['YYYY-MM-DD', ...] } — paused dates, working state while modal is open
window.openAssignUsersModal = function(clientId) {
  _assignUsersTargetClientId = clientId;
  const client = (window.hrmClients||[]).find(c=>c.id===clientId);
  const users = (window.hrmEmployees||[]).filter(e=>e.crmAssignable && e.status==='active');
  window._auSup = {};
  window._auPaused = {};
  const scheduleEl = document.getElementById('assignUsersSchedule');
  if (scheduleEl) {
    scheduleEl.innerHTML = formatClientSchedule(client?.tuitionDays) + (client?.tuitionDays?.length ? ` <span class="muted-note">(${clientWeeklyHours(client.tuitionDays)} hrs/week — regular assignee's expected hours)</span>` : '');
  }
  const checklist = document.getElementById('assignUsersChecklist');
  checklist.innerHTML = users.length === 0
    ? '<p style="font-size:.8rem;color:var(--text-3);">No CRM-assignable employees yet — check "Can be assigned to CRM clients" on an employee\'s record first.</p>'
    : users.map(u=>{
        const checked = (client?.assignedUserIds||[]).includes(u.uid);
        const at = getClientAssignmentType(client||{}, u.uid);
        window._auSup[u.uid] = [...at.supplementaryDates];
        window._auPaused[u.uid] = [...at.pausedDates];
        return `<div class="assign-user-row" style="margin-bottom:.5rem;">
          <label><input type="checkbox" class="au-check" value="${u.uid}" ${checked?'checked':''} onchange="toggleAuRow('${u.uid}')"> ${escHtml(u.name)} <span style="color:var(--text-3);font-size:.76rem;">(${escHtml(u.email)})</span></label>
          <div class="au-detail" id="auDetail_${u.uid}" style="display:${checked?'block':'none'};margin:.4rem 0 0 1.7rem;padding:.6rem .7rem;background:var(--surface-2);border:1px solid var(--border-2);border-radius:var(--r-sm);">
            <label style="font-size:.78rem;display:flex;align-items:center;gap:.4rem;margin-bottom:.6rem;"><input type="checkbox" id="auRegular_${u.uid}" ${at.regular?'checked':''}> Regular — follows the client's weekly schedule above</label>

            <div style="font-size:.72rem;text-transform:uppercase;color:var(--text-3);font-weight:700;margin-bottom:.3rem;">Supplementary sessions <span style="text-transform:none;font-weight:400;">(extra dates beyond the regular days)</span></div>
            <div style="display:flex;gap:.4rem;margin-bottom:.4rem;">
              <input type="date" class="input" id="auSupInput_${u.uid}" style="flex:1;">
              <button type="button" class="mini-btn" onclick="addAuDate('${u.uid}','sup')"><i class="fa-solid fa-plus"></i> Add</button>
            </div>
            <div class="au-date-chips" id="auSupChips_${u.uid}" style="display:flex;gap:.35rem;flex-wrap:wrap;margin-bottom:.7rem;"></div>

            <div style="font-size:.72rem;text-transform:uppercase;color:var(--text-3);font-weight:700;margin-bottom:.3rem;">Paused sessions <span style="text-transform:none;font-weight:400;">(dates excused for this person — e.g. someone else covered)</span></div>
            <div style="display:flex;gap:.4rem;margin-bottom:.4rem;">
              <input type="date" class="input" id="auPausedInput_${u.uid}" style="flex:1;">
              <button type="button" class="mini-btn" onclick="addAuDate('${u.uid}','paused')"><i class="fa-solid fa-plus"></i> Add</button>
            </div>
            <div class="au-date-chips" id="auPausedChips_${u.uid}" style="display:flex;gap:.35rem;flex-wrap:wrap;"></div>
          </div>
        </div>`;
      }).join('');
  users.forEach(u => { renderAuDateChips(u.uid,'sup'); renderAuDateChips(u.uid,'paused'); });
  document.getElementById('assignUsersModal').classList.add('open');
};
window.toggleAuRow = function(uid) {
  const checked = document.querySelector(`.au-check[value="${uid}"]`)?.checked;
  const detail = document.getElementById('auDetail_'+uid);
  if (detail) detail.style.display = checked ? 'block' : 'none';
};
window.addAuDate = function(uid, kind) {
  const store = kind === 'paused' ? window._auPaused : window._auSup;
  const input = document.getElementById((kind==='paused'?'auPausedInput_':'auSupInput_')+uid);
  const val = input?.value;
  if (!val) return;
  store[uid] = store[uid] || [];
  if (!store[uid].includes(val)) { store[uid].push(val); store[uid].sort(); }
  input.value = '';
  renderAuDateChips(uid, kind);
};
window.removeAuDate = function(uid, date, kind) {
  const store = kind === 'paused' ? window._auPaused : window._auSup;
  store[uid] = (store[uid]||[]).filter(d=>d!==date);
  renderAuDateChips(uid, kind);
};
function renderAuDateChips(uid, kind) {
  const store = kind === 'paused' ? window._auPaused : window._auSup;
  const el = document.getElementById((kind==='paused'?'auPausedChips_':'auSupChips_')+uid);
  if (!el) return;
  const dates = store[uid]||[];
  const pillClass = kind === 'paused' ? 'pill-nowork' : 'pill-pending';
  el.innerHTML = dates.length === 0
    ? '<span style="font-size:.74rem;color:var(--text-3);">None added yet.</span>'
    : dates.map(d=>`<span class="pill ${pillClass}" style="display:inline-flex;align-items:center;gap:.3rem;">${new Date(d+'T00:00:00').toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'})} <i class="fa-solid fa-xmark" style="cursor:pointer;" onclick="removeAuDate('${uid}','${d}','${kind}')"></i></span>`).join('');
}
document.getElementById('saveAssignUsersBtn')?.addEventListener('click', async () => {
  if (!_assignUsersTargetClientId) return;
  const checked = Array.from(document.querySelectorAll('#assignUsersChecklist input.au-check:checked')).map(i=>i.value);
  const assignmentMeta = {};
  checked.forEach(uid => {
    assignmentMeta[uid] = {
      regular: !!document.getElementById('auRegular_'+uid)?.checked,
      supplementaryDates: window._auSup[uid] || [],
      pausedDates: window._auPaused[uid] || []
    };
  });
  try {
    await setDoc(doc(db,'clients',_assignUsersTargetClientId), { assignedUserIds: checked, assignmentMeta }, { merge:true });
    showToast('Assignment saved.');
    document.getElementById('assignUsersModal').classList.remove('open');
  } catch(e) { showToast('Could not save assignment: '+e.message, true); }
});

let _assignClientsTargetUserId = null;
let _assignClientsVisibleClients = [];
window.openAssignClientsModal = function(userId) {
  _assignClientsTargetUserId = userId;
  // Inactive clients are hidden here — no point assigning staff to a paused/closed
  // account. Their existing assignments (if any) are left untouched on save.
  const clients = (window.hrmClients || []).filter(c => String(c.status||'Active').toLowerCase()==='active');
  _assignClientsVisibleClients = clients;
  const checklist = document.getElementById('assignClientsChecklist');
  checklist.innerHTML = clients.length === 0
    ? '<p style="font-size:.8rem;color:var(--text-3);">No active clients yet.</p>'
    : clients.map(c=>`<label><input type="checkbox" value="${c.id}" ${(c.assignedUserIds||[]).includes(userId)?'checked':''}> ${escHtml(c.clientNumber)} — ${escHtml(c.studentName)} <span style="color:var(--text-3);font-size:.76rem;">(${clientWeeklyHours(c.tuitionDays)} hrs/wk)</span></label>`).join('');
  document.getElementById('assignClientsModal').classList.add('open');
};
document.getElementById('saveAssignClientsBtn')?.addEventListener('click', async () => {
  if (!_assignClientsTargetUserId) return;
  const uid = _assignClientsTargetUserId;
  const checkedIds = new Set(Array.from(document.querySelectorAll('#assignClientsChecklist input:checked')).map(i=>i.value));
  try {
    const clients = _assignClientsVisibleClients; // only the active clients actually shown in the checklist — inactive clients' existing assignments are left untouched
    const writes = clients.map(c=>{
      const has = (c.assignedUserIds||[]).includes(uid);
      const should = checkedIds.has(c.id);
      if (has === should) return null;
      const next = should ? [...(c.assignedUserIds||[]), uid] : (c.assignedUserIds||[]).filter(x=>x!==uid);
      const meta = {...(c.assignmentMeta||{})};
      if (should && !has) meta[uid] = meta[uid] || {regular:true, supplementaryDates:[], pausedDates:[]}; // new assignment defaults to regular — use "Assign Users" on the client for supplementary/paused dates
      if (!should && has) delete meta[uid];
      return setDoc(doc(db,'clients',c.id), { assignedUserIds: next, assignmentMeta: meta }, { merge:true });
    }).filter(Boolean);
    await Promise.all(writes);
    showToast('Assignment saved.');
    document.getElementById('assignClientsModal').classList.remove('open');
  } catch(e) { showToast('Could not save assignment: '+e.message, true); }
});

// ─── CRM USERS ───
function renderCrmUsersPage() {
  const wrap = document.getElementById('crmUsersTableWrap');
  const users = (window.hrmEmployees||[]).filter(e=>e.crmAssignable);
  if (users.length === 0) {
    wrap.innerHTML = `<div class="empty"><div class="empty-icon">🔑</div><h3>No CRM-assignable employees yet.</h3><p style="font-size:.8rem;margin-top:.3rem;">Check "Can be assigned to CRM clients" on an employee's record to add them here.</p></div>`;
  } else {
    wrap.innerHTML = `<table><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Assigned Clients</th><th>Status</th><th>Actions</th></tr></thead><tbody>
      ${users.map(u=>{
        const count = (window.hrmClients||[]).filter(c=>(c.assignedUserIds||[]).includes(u.uid)).length;
        const isInactive = u.status === 'inactive';
        return `<tr${isInactive?' style="opacity:.55;"':''}>
          <td><strong>${escHtml(u.name)}</strong></td>
          <td>${escHtml(u.email)}</td>
          <td><span class="pill pill-${u.role||'employee'}">${escHtml(u.role||'employee')}</span></td>
          <td>${count} client${count===1?'':'s'}</td>
          <td><span class="pill pill-${isInactive?'inactive':'active'}">${isInactive?'Inactive':'Active'}</span></td>
          <td class="row-actions">
            <button class="btn-icon" title="Assign clients" onclick="openAssignClientsModal('${u.uid}')"><i class="fa-solid fa-user-group"></i></button>
            <button class="btn-icon" title="Remove from CRM" onclick="removeCrmAssignable('${u.id}')"><i class="fa-solid fa-user-slash"></i></button>
          </td>
        </tr>`;
      }).join('')}
    </tbody></table>`;
  }
}

window.removeCrmAssignable = async function(empDocId) {
  const e = (window.hrmEmployees||[]).find(x=>x.id===empDocId);
  if (!e) return;
  if (!confirm(`Remove ${e.name} from the CRM-assignable list? Their employee record and login are unaffected — this just means they can no longer be assigned to clients.`)) return;
  try {
    await setDoc(doc(db,'hrm_employees',empDocId), { crmAssignable:false }, { merge:true });
    if (e.uid) await setDoc(doc(db,'hrm_users',e.uid), { crmAssignable:false }, { merge:true });
    showToast(`${e.name} removed from CRM.`);
  } catch(err) { showToast('Could not update: '+err.message, true); }
};

// ─── ADMIN PAGE NAV ───
window.toggleAdminSidebar = function() {
  const sidebar = document.querySelector('#appContent .sidebar');
  const backdrop = document.querySelector('#appContent .sidebar-backdrop');
  const opening = !sidebar.classList.contains('mobile-open');
  sidebar.classList.toggle('mobile-open', opening);
  if (backdrop) backdrop.classList.toggle('show', opening);
};
window.closeAdminSidebar = function() {
  document.querySelector('#appContent .sidebar')?.classList.remove('mobile-open');
  document.querySelector('#appContent .sidebar-backdrop')?.classList.remove('show');
};

window.showAdminPage = function(name) {
  document.querySelectorAll('.page').forEach(p=>{p.classList.remove('active');p.style.display='none';});
  const tgt = document.getElementById('page'+name.charAt(0).toUpperCase()+name.slice(1));
  if (tgt) {tgt.classList.add('active');tgt.style.display='block';}
  document.querySelectorAll('.nav-item[data-page]').forEach(b=>b.classList.remove('active'));
  const ab = document.querySelector(`.nav-item[data-page="${name}"]`);
  if (ab) ab.classList.add('active');
  if (pageConfig[name]) {
    document.getElementById('pageHeadTitle').textContent = pageConfig[name].t;
    document.getElementById('pageHeadSub').textContent = pageConfig[name].s;
  }
  renderCurrentAdminPage();
  closeAdminSidebar();
};

document.querySelectorAll('.nav-item[data-page]').forEach(btn=>{
  btn.addEventListener('click',()=>showAdminPage(btn.dataset.page));
});

function renderCurrentAdminPage() {
  if (document.getElementById('pageDashboard')?.classList.contains('active')) renderDashboard();
  if (document.getElementById('pageEmployees')?.classList.contains('active')) renderEmployeeList();
  if (document.getElementById('pageAttendance')?.classList.contains('active')) loadAttendance();
  if (document.getElementById('pageLeaves')?.classList.contains('active')) loadLeaves();
  if (document.getElementById('pageRoles')?.classList.contains('active')) renderRolesTable();
  if (document.getElementById('pageEditRequests')?.classList.contains('active')) loadEditRequests();
  if (document.getElementById('pageAdminDocs')?.classList.contains('active')) loadAdminDocs();
  if (document.getElementById('pageRegularization')?.classList.contains('active')) loadRegularizations();
  if (document.getElementById('pageSalarySlips')?.classList.contains('active')) loadAdminSlips();
  if (document.getElementById('pageHrTeam')?.classList.contains('active')) loadHRTeam();
  if (document.getElementById('pageLeads')?.classList.contains('active')) renderLeadsPage();
  if (document.getElementById('pageClients')?.classList.contains('active')) renderClientsPage();
  if (document.getElementById('pageCrmUsers')?.classList.contains('active')) renderCrmUsersPage();
  if (document.getElementById('pageAddEmployee')?.classList.contains('active')) prefillNextEmployeeId('empId');
}

// ─── DASHBOARD ───
function renderDashboard() {
  const emps = window.hrmEmployees;
  const clients = window.hrmClients || [];
  const leads = window.hrmLeads || [];
  const activeClients = clients.filter(c=>String(c.status||'Active').toLowerCase()==='active').length;
  const newLeads = leads.filter(l=>String(l.status||'New').toLowerCase()==='new').length;
  document.getElementById('dashStats').innerHTML = `
    <div class="stat-card"><div class="stat-label">Total Clients</div><div class="stat-value">${clients.length}</div><div class="stat-help">On record</div></div>
    <div class="stat-card"><div class="stat-label">Total Leads</div><div class="stat-value" style="color:var(--info);">${leads.length}</div><div class="stat-help">All enquiries</div></div>
    <div class="stat-card"><div class="stat-label">Active Clients</div><div class="stat-value" style="color:var(--success);">${activeClients}</div><div class="stat-help">Currently active</div></div>
    <div class="stat-card"><div class="stat-label">New Leads</div><div class="stat-value" style="color:var(--warn);">${newLeads}</div><div class="stat-help">Awaiting contact</div></div>
  `;
  const recent = [...emps].sort((a,b)=>(b.dateOfHiring||'').localeCompare(a.dateOfHiring||'')).slice(0,5);
  document.getElementById('dashRecentEmp').innerHTML = recent.length
    ? `<div class="table-wrap"><table><thead><tr><th>Name</th><th>Title</th><th>Joined</th><th>Role</th></tr></thead><tbody>
        ${recent.map(e=>`<tr><td><strong>${escHtml(e.name)}</strong></td><td>${escHtml(e.title||'')}</td><td>${formatDate(e.dateOfHiring)}</td><td><span class="pill pill-${e.role||'employee'}">${escHtml(e.role||'employee')}</span></td></tr>`).join('')}
      </tbody></table></div>`
    : `<div class="empty"><div class="empty-icon">👥</div><h3>No employees yet.</h3></div>`;

  // Pending leaves
  getDocs(query(collection(db,'hrm_leaves'),where('status','==','pending'))).then(snap=>{
    const pl = snap.docs.map(d=>({id:d.id,...d.data()}));
    document.getElementById('dashPendingLeaves').innerHTML = pl.length
      ? `<div class="table-wrap"><table><thead><tr><th>Employee</th><th>Type</th><th>Days</th><th>Actions</th></tr></thead><tbody>
          ${pl.map(l=>`<tr>
            <td><strong>${escHtml(l.empName||'')}</strong></td>
            <td><span class="pill ${leavePillClass(l.leaveType)}">${escHtml(leaveLabel(l.leaveType))}</span></td>
            <td>${escHtml(String(l.days??1))}</td>
            <td style="display:flex;gap:.3rem;">
              <button class="mini-btn mini-btn-success" onclick="actionLeave('${l.id}','approved','${l.empUID}','${l.leaveType}',${l.days??1})">✓ Approve</button>
              <button class="mini-btn mini-btn-danger" onclick="actionLeave('${l.id}','rejected','${l.empUID}','${l.leaveType}',${l.days??1})">✕ Reject</button>
            </td></tr>`).join('')}
        </tbody></table></div>`
      : `<div style="padding:1rem;font-size:.84rem;color:var(--text-3);"><i class="fa-solid fa-check-circle" style="color:var(--success);"></i> No pending requests.</div>`;
  });
}

// ─── AUTOMATED EMPLOYEE ID ───
const EMP_ID_PREFIX = 'SJ-EMP-';
const EMP_ID_START  = 5;
function computeNextEmployeeId() {
  const pools = [window.hrmEmployees||[], window._hrEmps||[], window._hrTeamMembers||[]];
  let max = 0;
  pools.forEach(list => (list||[]).forEach(e => {
    const m = /^SJ-EMP-(\d+)$/i.exec(String(e.employeeId||'').trim());
    if (m) max = Math.max(max, parseInt(m[1],10));
  }));
  const next = Math.max(max+1, EMP_ID_START);
  return EMP_ID_PREFIX + String(next).padStart(3,'0');
}
window.prefillNextEmployeeId = function(inputId) {
  const el = document.getElementById(inputId);
  if (!el) return;
  el.value = computeNextEmployeeId();
  el.readOnly = true;
  el.style.background = 'var(--surface-2)';
  el.style.cursor = 'not-allowed';
};
window.unlockEmpIdField = function(inputId) {
  const el = document.getElementById(inputId);
  if (!el) return;
  el.readOnly = false;
  el.style.background = '';
  el.style.cursor = '';
  el.focus();
  el.select();
};

// Toggles the Salary field's label/placeholder between Annual and Monthly.
// The value entered is converted to an annual figure on submit (see the
// addEmpForm / hrAddEmpForm submit handlers) since salary is stored as
// annual CTC everywhere else in the app (payroll math, reports, etc.).
window.updateSalaryLabel = function(prefix) {
  const type = document.getElementById(prefix+'SalaryType').value;
  const label = document.getElementById(prefix+'SalaryLabel');
  const input = document.getElementById(prefix+'Salary');
  if (!label || !input) return;
  if (type === 'monthly') {
    label.innerHTML = 'Monthly Salary (₹) <span class="req">*</span>';
    input.placeholder = 'e.g. 40000';
  } else {
    label.innerHTML = 'Annual Salary (₹) <span class="req">*</span>';
    input.placeholder = 'e.g. 480000';
  }
};

// ─── ADD EMPLOYEE ───
async function populateManagerDropdowns() {
  const managers = window.hrmEmployees.filter(e=>e.role==='manager' && e.status==='active');
  const opts = `<option value="">— No Manager —</option>`+managers.map(m=>`<option value="${escHtml(m.uid)}">${escHtml(m.name)} (${escHtml(m.employeeId||'')})</option>`).join('');
  ['empManagerAssign','editEmpManager'].forEach(id=>{
    const el = document.getElementById(id);
    if(el) el.innerHTML = opts;
  });
}

document.getElementById('addEmpForm').addEventListener('submit', async e => {
  e.preventDefault();
  const btn = document.getElementById('addEmpBtn');
  btn.innerHTML='<i class="fa-solid fa-spinner fa-spin"></i> Creating...';
  btn.disabled=true;

  const email = document.getElementById('empLoginEmail').value.trim();
  const pass = document.getElementById('empLoginPass').value;
  const name = document.getElementById('empName').value.trim();
  const empId = document.getElementById('empId').value.trim();
  const role = document.getElementById('empRole').value;
  const salaryType = document.getElementById('empSalaryType').value;
  const salaryInput = Number(document.getElementById('empSalary').value||0);
  const annualSalary = salaryType === 'monthly' ? salaryInput * 12 : salaryInput;

  try {
    // Create firebase auth account
    const cred = await createUserWithEmailAndPassword(secondaryAuth, email, pass);
    await signOut(secondaryAuth);
    const uid = cred.user.uid;

    const empData = {
      uid, name, employeeId: empId,
      phone: document.getElementById('empPhone').value.trim(),
      gender: document.getElementById('empGender').value,
      dateOfHiring: document.getElementById('empDOH').value,
      title: document.getElementById('empTitle').value.trim(),
      role,
      employmentType: document.getElementById('empEmploymentType').value,
      salary: annualSalary, // always stored as annual CTC — reports/payroll math elsewhere assume this
      salaryType, salaryInput,
      managerId: document.getElementById('empManagerAssign').value || null,
      pan: document.getElementById('empPan').value.trim().toUpperCase(),
      aadhaar: document.getElementById('empAadhaar').value.trim(),
      bankAccount: document.getElementById('empBankAcc').value.trim(),
      ifsc: document.getElementById('empIFSC').value.trim().toUpperCase(),
      bankName: document.getElementById('empBankName').value.trim(),
      bankHolder: document.getElementById('empBankHolder').value.trim(),
      pfOptIn: document.getElementById('empPfOptIn').checked,
      uan: document.getElementById('empPfOptIn').checked ? document.getElementById('empUAN').value.trim() : '',
      crmAssignable: document.getElementById('empCrmAssignable').checked,
      email,
      status: 'active',
      createdAt: new Date().toISOString()
    };

    const docId = 'emp_'+uid;
    await setDoc(doc(db,'hrm_employees',docId), empData);
    await setDoc(doc(db,'hrm_users',uid), {
      role, name, email, status:'active',
      managerId: empData.managerId,
      crmAssignable: empData.crmAssignable
    });

    document.getElementById('addEmpForm').reset();
    updateSalaryLabel('emp');
    showToast(`Employee "${name}" created with login!`);
    showAdminPage('employees');
  } catch(err) {
    showToast('Error: '+err.message, true);
  } finally {
    btn.innerHTML='<i class="fa-solid fa-user-plus"></i> Create Employee';
    btn.disabled=false;
  }
});

// ─── EMPLOYEE LIST ───
function renderEmployeeList() {
  populateManagerDropdowns();
  const q = document.getElementById('empSearch').value.trim().toLowerCase();
  const fRole = document.getElementById('empFilterRole').value;
  const fStatus = document.getElementById('empFilterStatus').value;
  const filtered = window.hrmEmployees.filter(e => {
    const hay = [e.name,e.employeeId,e.title,e.email,e.phone].join(' ').toLowerCase();
    let ok = !q || hay.includes(q);
    if (fRole !== 'all') ok = ok && e.role === fRole;
    if (fStatus !== 'all') ok = ok && e.status === fStatus;
    return ok;
  });
  const container = document.getElementById('empList');
  if (!filtered.length) {
    container.innerHTML=`<div class="empty"><div class="empty-icon">👥</div><h3>No employees found.</h3></div>`;
    return;
  }
  const mgMap = {};
  window.hrmEmployees.filter(e=>e.role==='manager').forEach(m=>mgMap[m.uid]=m.name);
  container.innerHTML = filtered.map(e => {
    const initials = e.name.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();
    const avatarHtml = e.photoURL
      ? `<img class="emp-avatar-photo" src="${escHtml(e.photoURL)}" alt="${escHtml(e.name)}">`
      : `<div class="emp-avatar">${initials}</div>`;
    return `<div class="emp-card">
      <div class="emp-card-top">
        ${avatarHtml}
        <div style="min-width:0;">
          <div class="emp-name">${escHtml(e.name)}</div>
          <div class="emp-title">${escHtml(e.title||'')} &nbsp;·&nbsp; <span class="pill pill-${e.role||'employee'}" style="font-size:.65rem;">${escHtml(e.role||'employee')}</span> <span class="pill pill-checkedin" style="font-size:.65rem;">${e.employmentType==='part-time'?'Part-time':'Full-time'}</span></div>
        </div>
        <span class="pill ${e.status==='active'?'pill-active':'pill-inactive'}" style="margin-left:auto;flex-shrink:0;">${escHtml(e.status)}</span>
      </div>
      <div class="emp-meta">
        <div class="emp-meta-item"><div class="emp-meta-label">Employee ID</div><div class="emp-meta-value">${escHtml(e.employeeId||'—')}</div></div>
        <div class="emp-meta-item"><div class="emp-meta-label">Salary</div><div class="emp-meta-value">${formatCurrency(e.salary||0)}/yr</div></div>
        <div class="emp-meta-item"><div class="emp-meta-label">Manager</div><div class="emp-meta-value">${escHtml(e.managerId ? (mgMap[e.managerId]||e.managerId) : '—')}</div></div>
        <div class="emp-meta-item"><div class="emp-meta-label">Joined</div><div class="emp-meta-value">${formatDate(e.dateOfHiring)}</div></div>

        <div class="emp-meta-item"><div class="emp-meta-label">Email</div><div class="emp-meta-value" style="font-size:.69rem;overflow:hidden;text-overflow:ellipsis;">${escHtml(e.email||'—')}</div></div>
      </div>
      <div class="emp-actions">
        <button class="mini-btn" onclick="openEditEmpModal('${e.id}')"><i class="fa-solid fa-pen"></i> Edit</button>
        <button class="mini-btn" onclick="toggleEmpStatus('${e.id}')">${e.status==='active'?'<i class="fa-solid fa-ban"></i> Deactivate':'<i class="fa-solid fa-check"></i> Activate'}</button>
        <button class="mini-btn mini-btn-danger" onclick="dismissEmployee('${e.id}')"><i class="fa-solid fa-user-slash"></i> Dismiss</button>
      </div>
    </div>`;
  }).join('');
}

['empSearch','empFilterRole','empFilterStatus'].forEach(id=>{
  document.getElementById(id).addEventListener('input', renderEmployeeList);
  document.getElementById(id).addEventListener('change', renderEmployeeList);
});

window.toggleEmpStatus = async function(id) {
  const e = window.hrmEmployees.find(x=>x.id===id);
  if (!e) return;
  const newStatus = e.status==='active'?'inactive':'active';
  await setDoc(doc(db,'hrm_employees',id), {status:newStatus}, {merge:true});
  if (e.uid) await setDoc(doc(db,'hrm_users',e.uid), {status:newStatus}, {merge:true});
  showToast(`Employee marked ${newStatus}.`);
};

// Role changes now happen via Edit Employee or the Roles & Assign page's
// role dropdown (setEmployeeRole), which also supports Admin.

window.dismissEmployee = async function(id) {
  const e = window.hrmEmployees.find(x=>x.id===id);
  if (!e) return;
  if (!confirm(`Dismiss ${e.name}? This will deactivate their account and remove manager assignment.`)) return;
  await setDoc(doc(db,'hrm_employees',id), {status:'inactive',managerId:null}, {merge:true});
  if (e.uid) await setDoc(doc(db,'hrm_users',e.uid), {status:'inactive'}, {merge:true});
  showToast(`${e.name} has been dismissed.`);
};

// ─── EDIT MODAL ───
window.openEditEmpModal = function(id) {
  const e = window.hrmEmployees.find(x=>x.id===id);
  if (!e) return;
  populateManagerDropdowns();
  document.getElementById('editEmpUID').value = id;
  document.getElementById('editEmpName').value = e.name||'';
  document.getElementById('editEmpId').value = e.employeeId||'';
  document.getElementById('editEmpPhone').value = e.phone||'';
  document.getElementById('editEmpGender').value = e.gender||'';
  document.getElementById('editEmpTitle').value = e.title||'';
  document.getElementById('editEmpSalary').value = e.salary||'';
  document.getElementById('editEmpDOH').value = e.dateOfHiring||'';
  document.getElementById('editEmpEmploymentType').value = e.employmentType||'full-time';
  document.getElementById('editEmpStatus').value = e.status||'active';
  document.getElementById('editEmpPan').value = e.pan||'';
  document.getElementById('editEmpAadhaar').value = e.aadhaar||'';
  document.getElementById('editEmpBankAcc').value = e.bankAccount||'';
  document.getElementById('editEmpIFSC').value = e.ifsc||'';
  document.getElementById('editEmpBankName').value = e.bankName||'';
  document.getElementById('editEmpBankHolder').value = e.bankHolder||'';
  document.getElementById('editEmpCrmAssignable').checked = !!e.crmAssignable;
  document.getElementById('editEmpRole').value = e.role||'employee';
  document.getElementById('editEmpRoleWarning').style.display = e.role==='admin' ? 'block' : 'none';
  setTimeout(()=>{ document.getElementById('editEmpManager').value = e.managerId||''; }, 100);
  document.getElementById('editEmpModal').classList.add('open');
};
window.closeEditModal = function() { document.getElementById('editEmpModal').classList.remove('open'); };

document.getElementById('editEmpForm').addEventListener('submit', async e => {
  e.preventDefault();
  const id = document.getElementById('editEmpUID').value;
  const emp = window.hrmEmployees.find(x=>x.id===id);
  if (!emp) return;
  const newRole = document.getElementById('editEmpRole').value;
  if (newRole === 'admin' && emp.role !== 'admin') {
    if (!confirm(`Make ${emp.name} an Admin? They will get full access to this Workspace, including payroll, employee records, and the CRM.`)) return;
  }
  const updates = {
    name: document.getElementById('editEmpName').value.trim(),
    employeeId: document.getElementById('editEmpId').value.trim(),
    phone: document.getElementById('editEmpPhone').value.trim(),
    gender: document.getElementById('editEmpGender').value,
    title: document.getElementById('editEmpTitle').value.trim(),
    salary: Number(document.getElementById('editEmpSalary').value||0),
    dateOfHiring: document.getElementById('editEmpDOH').value,
    employmentType: document.getElementById('editEmpEmploymentType').value,
    status: document.getElementById('editEmpStatus').value,
    role: newRole,
    managerId: document.getElementById('editEmpManager').value||null,
    pan: document.getElementById('editEmpPan').value.trim().toUpperCase(),
    aadhaar: document.getElementById('editEmpAadhaar').value.trim(),
    bankAccount: document.getElementById('editEmpBankAcc').value.trim(),
    ifsc: document.getElementById('editEmpIFSC').value.trim().toUpperCase(),
    bankName: document.getElementById('editEmpBankName').value.trim(),
    bankHolder: document.getElementById('editEmpBankHolder').value.trim(),
    crmAssignable: document.getElementById('editEmpCrmAssignable').checked
  };
  await setDoc(doc(db,'hrm_employees',id), updates, {merge:true});
  if (emp.uid) await setDoc(doc(db,'hrm_users',emp.uid), {name:updates.name,role:updates.role,managerId:updates.managerId,status:updates.status,crmAssignable:updates.crmAssignable}, {merge:true});
  closeEditModal();
  showToast('Employee updated.');
  if (document.getElementById('pageCrmUsers')?.classList.contains('active')) renderCrmUsersPage();
});

// ─── ATTENDANCE ───
window.loadAttendance = async function() {
  const wrap = document.getElementById('attTableWrap');
  if (!wrap) return;
  wrap.innerHTML=`<div class="empty"><h3><i class="fa-solid fa-spinner fa-spin"></i> Loading...</h3></div>`;

  // Populate employee filter
  const filterEl = document.getElementById('attFilterEmp');
  filterEl.innerHTML = `<option value="all">All Employees</option>`+window.hrmEmployees.map(e=>`<option value="${escHtml(e.uid)}">${escHtml(e.name)}</option>`).join('');

  try {
    let q2 = collection(db,'hrm_attendance');
    const snap = await getDocs(q2);
    let recs = snap.docs.map(d=>({id:d.id,...d.data()}));

    // Approved regularizations count as Present (and are paid) even when the raw
    // check-in/check-out is missing or incomplete — fold them into this list too,
    // rather than leaving them visible only on the separate Regularization page.
    let regByKey = {};
    try {
      const regSnap = await getDocs(query(collection(db,'hrm_regularizations'),where('status','==','approved')));
      regSnap.docs.forEach(d=>{ const r=d.data(); if (r.empUID && r.date) regByKey[r.empUID+'_'+r.date] = r; });
    } catch(e) { /* ignore — attendance still loads without the regularization overlay */ }

    recs = recs.map(r=>{
      const key = r.empUID+'_'+r.date;
      if (regByKey[key]) { const reg = regByKey[key]; delete regByKey[key]; return {...r, regularized:true, regHours:reg.hours, regReason:reg.reason}; }
      return r;
    });
    Object.values(regByKey).forEach(reg=>{
      recs.push({
        id: 'reg_'+reg.empUID+'_'+reg.date,
        empUID: reg.empUID, date: reg.date, clientId: reg.clientId, clientLabel: reg.clientLabel,
        scheduledHours: reg.hours, regularized: true, regHours: reg.hours, regReason: reg.reason,
        checkIn: null, checkOut: null, synthesized: true
      });
    });

    const dateFilter = document.getElementById('attFilterDate').value;
    const empFilter = document.getElementById('attFilterEmp').value;
    if (dateFilter) recs = recs.filter(r=>r.date===dateFilter);
    if (empFilter !== 'all') recs = recs.filter(r=>r.empUID===empFilter);

    recs.sort((a,b)=>b.date.localeCompare(a.date)||(b.checkIn||'').localeCompare(a.checkIn||''));

    const empMap={};
    window.hrmEmployees.forEach(e=>empMap[e.uid]=e);
    window._attRecordsById = {};
    recs.forEach(r=>{ window._attRecordsById[r.id]=r; });

    if (!recs.length) { wrap.innerHTML=`<div class="empty"><div class="empty-icon">📋</div><h3>No records found.</h3></div>`; return; }

    wrap.innerHTML = `<table><thead><tr><th>Employee</th><th>Title</th><th>Date</th><th>Client</th><th>Check In</th><th>Check Out</th><th>Logged</th><th>Scheduled</th><th>Notes</th><th>Status</th><th></th></tr></thead><tbody>
      ${recs.map(r=>{
        const emp = empMap[r.empUID]||{};
        const clientCell = r.clientNumber
          ? `${escHtml(r.clientNumber)}<div style="font-size:.72rem;color:var(--text-3);">${escHtml(r.studentName)}</div>`
          : (r.clientLabel ? escHtml(r.clientLabel) : '<span style="color:var(--text-3);">—</span>');
        if (r.regularized) {
          return `<tr>
          <td><strong>${escHtml(emp.name||r.empUID)}</strong></td>
          <td>${escHtml(emp.title||'')}</td>
          <td>${escHtml(r.date)}</td>
          <td>${clientCell}</td>
          <td>${escHtml(r.checkIn||'—')}</td>
          <td>${escHtml(r.checkOut||'—')}</td>
          <td>${r.regHours||0}h</td>
          <td>${r.scheduledHours?`${r.scheduledHours}h`:'—'}</td>
          <td style="max-width:200px;font-size:.78rem;">${escHtml(r.checkOutNotes||r.regReason)||'<span style="color:var(--text-3);">—</span>'}</td>
          <td><span class="pill pill-present">Present <span style="opacity:.75;font-size:.68rem;">(Regularized)</span></span></td>
          <td>${r.synthesized?'':`<button class="mini-btn" onclick="editAdminAttendance('${r.id}')"><i class="fa-solid fa-pen"></i> Edit</button>`}</td>
        </tr>`;
        }
        const dur = calcDuration(r.checkIn, r.checkOut);
        const mins = calcDurationMinutes(r.checkIn, r.checkOut);
        let status;
        if (!r.checkIn) status = 'Absent';
        else if (!r.checkOut) status = 'Checked In';
        else if (r.scheduledHours) status = mins >= r.scheduledHours*60 ? 'Present' : 'Short';
        else status = 'Present';
        const pillClass = status==='Present'?'pill-present':(status==='Checked In'?'pill-checkedin':(status==='Short'?'pill-pending':'pill-absent'));
        return `<tr>
          <td><strong>${escHtml(emp.name||r.empUID)}</strong></td>
          <td>${escHtml(emp.title||'')}</td>
          <td>${escHtml(r.date)}</td>
          <td>${clientCell}</td>
          <td>${escHtml(r.checkIn||'—')}</td>
          <td>${escHtml(r.checkOut||'—')}</td>
          <td>${dur}</td>
          <td>${r.scheduledHours?`${r.scheduledHours}h`:'—'}</td>
          <td style="max-width:200px;font-size:.78rem;">${escHtml(r.checkOutNotes)||'<span style="color:var(--text-3);">—</span>'}</td>
          <td><span class="pill ${pillClass}">${status}</span></td>
          <td><button class="mini-btn" onclick="editAdminAttendance('${r.id}')"><i class="fa-solid fa-pen"></i> Edit</button></td>
        </tr>`;
      }).join('')}
    </tbody></table>`;
  } catch(err) { wrap.innerHTML=`<div class="empty"><h3>Error: ${escHtml(err.message)}</h3></div>`; }
};

['attFilterDate','attFilterEmp'].forEach(id=>{
  const el = document.getElementById(id);
  if(el) el.addEventListener('change', loadAttendance);
});

// ─── ADMIN: ADD / EDIT ATTENDANCE ───
// Lets the admin create an attendance record by hand (e.g. a session the
// employee forgot to check in/out for) or correct the times on an existing
// one. Reuses the same doc-id scheme as the normal check-in flow
// ({uid}_{date}_{clientId}, or {uid}_{date} with no client) so it plugs
// straight into the existing attendance/report calculations.
window._aaClients = []; // clients assigned to the currently-selected employee, loaded on demand
window.openAdminAttModal = function(existingRec) {
  document.getElementById('adminAttForm').reset();
  window._aaEditing = !!existingRec;
  document.getElementById('aaDocId').value = existingRec ? existingRec.id : '';
  const empSel = document.getElementById('aaEmp');
  // Only active employees — an inactive employee shouldn't be pickable for new attendance.
  const activeEmps = window.hrmEmployees.filter(e=>e.status==='active');
  empSel.innerHTML = `<option value="" disabled ${!existingRec?'selected':''}>Select employee…</option>` +
    activeEmps.map(e=>`<option value="${escHtml(e.uid)}" data-docid="${escHtml(e.id)}">${escHtml(e.name)}</option>`).join('');
  document.getElementById('adminAttModalTitle').innerHTML = existingRec
    ? '<i class="fa-solid fa-pen" style="color:var(--gold);font-size:1rem;"></i> Edit Attendance'
    : '<i class="fa-solid fa-clock" style="color:var(--gold);font-size:1rem;"></i> Add Attendance';
  document.getElementById('aaSubmitBtn').innerHTML = existingRec
    ? '<i class="fa-solid fa-floppy-disk"></i> Save Changes'
    : '<i class="fa-solid fa-floppy-disk"></i> Add Record';
  const dateInput = document.getElementById('aaDate');
  const clientSel = document.getElementById('aaClient');
  document.getElementById('aaSessionTypeWrap').style.display = 'none';
  if (existingRec) {
    // If the employee isn't active (or was removed), still show them in edit mode
    // so the record remains editable — just add them to the list if missing.
    if (!activeEmps.some(e=>e.uid===existingRec.empUID)) {
      const emp = window.hrmEmployees.find(e=>e.uid===existingRec.empUID);
      if (emp) empSel.insertAdjacentHTML('beforeend', `<option value="${escHtml(emp.uid)}" data-docid="${escHtml(emp.id)}">${escHtml(emp.name)} (inactive)</option>`);
    }
    empSel.value = existingRec.empUID;
    empSel.disabled = true;
    dateInput.value = existingRec.date;
    dateInput.disabled = true;
    document.getElementById('aaSchedHours').value = existingRec.scheduledHours || '';
    document.getElementById('aaCheckIn').value = existingRec.checkIn || '';
    document.getElementById('aaCheckOut').value = existingRec.checkOut || '';
    document.getElementById('aaNotes').value = existingRec.checkOutNotes || '';
    onAdminAttEmpChange(existingRec.clientId || '');
  } else {
    empSel.disabled = false;
    dateInput.disabled = false;
    dateInput.value = todayISO();
    clientSel.innerHTML = `<option value="">— No client / general attendance —</option>`;
    clientSel.disabled = true;
  }
  document.getElementById('adminAttModal').classList.add('open');
};

window.editAdminAttendance = function(recId) {
  const rec = window._attRecordsById?.[recId];
  if (!rec) return;
  openAdminAttModal(rec);
};

window.onAdminAttEmpChange = async function(preselectClientId) {
  const uid = document.getElementById('aaEmp').value;
  const clientSel = document.getElementById('aaClient');
  document.getElementById('aaSessionTypeWrap').style.display = 'none';
  if (!uid) { clientSel.innerHTML = `<option value="">— No client / general attendance —</option>`; clientSel.disabled = true; window._aaClients = []; return; }
  clientSel.innerHTML = `<option value="">Loading…</option>`;
  clientSel.disabled = true;
  try {
    const snap = await getDocs(query(collection(db,'clients'),where('assignedUserIds','array-contains',uid)));
    const clients = snap.docs.map(d=>({id:d.id,...d.data()}));
    window._aaClients = clients;
    clientSel.innerHTML = `<option value="">— No client / general attendance —</option>` +
      clients.map(c=>`<option value="${c.id}" data-name="${escHtml(c.studentName)}" data-num="${escHtml(c.clientNumber)}">${escHtml(c.clientNumber)} — ${escHtml(c.studentName)}</option>`).join('');
    if (preselectClientId) clientSel.value = preselectClientId;
    clientSel.disabled = !!window._aaEditing; // can't move an existing record to a different client — its doc id is keyed on it
    onAdminAttClientChange();
  } catch(e) { clientSel.innerHTML = `<option value="">— No client / general attendance —</option>`; }
};

// Shows the Regular/Supplementary choice only when this employee actually has
// supplementary sessions assigned for the selected client — otherwise there's
// nothing to ask, it's just their regular schedule.
window.onAdminAttClientChange = function() {
  const uid = document.getElementById('aaEmp').value;
  const clientId = document.getElementById('aaClient').value;
  const wrap = document.getElementById('aaSessionTypeWrap');
  const client = (window._aaClients||[]).find(c=>c.id===clientId);
  const hasSup = !!(client && uid && getClientAssignmentType(client, uid).supplementaryDates.length > 0);
  wrap.style.display = hasSup ? 'block' : 'none';
  if (!hasSup) document.querySelectorAll('input[name="aaSessionType"]').forEach(r=>r.checked = r.value==='regular');
};

document.getElementById('adminAttForm')?.addEventListener('submit', async ev => {
  ev.preventDefault();
  const btn = document.getElementById('aaSubmitBtn');
  btn.disabled = true;
  const docId = document.getElementById('aaDocId').value;
  const empSel = document.getElementById('aaEmp');
  const uid = empSel.value;
  const empDocId = empSel.options[empSel.selectedIndex]?.dataset.docid || '';
  const clientSel = document.getElementById('aaClient');
  const clientId = clientSel.value;
  const clientOpt = clientSel.options[clientSel.selectedIndex];
  const clientNumber = clientOpt?.dataset.num || '';
  const studentName = clientOpt?.dataset.name || '';
  const date = document.getElementById('aaDate').value;
  const scheduledHours = Number(document.getElementById('aaSchedHours').value)||0;
  const checkIn = document.getElementById('aaCheckIn').value || null;
  const checkOut = document.getElementById('aaCheckOut').value || null;
  const notes = document.getElementById('aaNotes').value.trim();
  const sessionType = document.querySelector('input[name="aaSessionType"]:checked')?.value || 'regular';
  if (!uid || !date) { showToast('Employee and date are required.', true); btn.disabled = false; return; }
  const attId = docId || (clientId ? `${uid}_${date}_${clientId}` : `${uid}_${date}`);
  try {
    // If this is logged as a Supplementary session and that date isn't already
    // in the employee's supplementary dates for this client, register it there
    // too — otherwise the schedule-driven monthly report wouldn't recognize
    // this date as an expected session at all and would show it as No Work.
    if (clientId && sessionType === 'supplementary') {
      const client = (window._aaClients||[]).find(c=>c.id===clientId);
      if (client) {
        const at = getClientAssignmentType(client, uid);
        if (!at.supplementaryDates.includes(date)) {
          const meta = {...(client.assignmentMeta||{})};
          meta[uid] = { regular: at.regular, supplementaryDates: [...at.supplementaryDates, date].sort(), pausedDates: at.pausedDates };
          await setDoc(doc(db,'clients',clientId), { assignmentMeta: meta }, { merge:true });
        }
      }
    }
    const payload = { empUID: uid, empDocId, date, checkIn, checkOut, adminEdited: true };
    if (!docId) payload.createdAt = new Date().toISOString();
    if (clientId) { payload.clientId = clientId; payload.clientNumber = clientNumber; payload.studentName = studentName; payload.scheduledHours = scheduledHours; }
    else if (scheduledHours) { payload.scheduledHours = scheduledHours; }
    if (notes) payload.checkOutNotes = notes;
    await setDoc(doc(db,'hrm_attendance', attId), payload, {merge:true});
    showToast(docId ? 'Attendance updated.' : 'Attendance added.');
    document.getElementById('adminAttModal').classList.remove('open');
    loadAttendance();
  } catch(err) { showToast('Error: '+err.message, true); }
  finally { btn.disabled = false; }

});

// ─── LEAVES (ADMIN VIEW) ───
async function loadLeaves() {
  const wrap = document.getElementById('leavesTableWrap');
  if (!wrap) return;
  wrap.innerHTML=`<div class="empty"><h3><i class="fa-solid fa-spinner fa-spin"></i> Loading...</h3></div>`;
  const statusFilter = document.getElementById('leaveFilterStatus').value;
  try {
    const snap = await getDocs(collection(db,'hrm_leaves'));
    let leaves = snap.docs.map(d=>({id:d.id,...d.data()}));
    if (statusFilter !== 'all') leaves = leaves.filter(l=>l.status===statusFilter);
    leaves.sort((a,b)=>(b.appliedAt||'').localeCompare(a.appliedAt||''));

    if (!leaves.length) { wrap.innerHTML=`<div class="empty"><div class="empty-icon">📅</div><h3>No leave requests.</h3></div>`; return; }
    wrap.innerHTML = `<table><thead><tr><th>Employee</th><th>Type</th><th>From</th><th>To</th><th>Days</th><th>Reason</th><th>Applied</th><th>Status</th><th>Actions</th></tr></thead><tbody>
      ${leaves.map(l=>`<tr>
        <td><strong>${escHtml(l.empName||'')}</strong></td>
        <td><span class="pill ${leavePillClass(l.leaveType)}">${escHtml(leaveLabel(l.leaveType))}</span></td>
        <td>${escHtml(l.fromDate)}</td><td>${escHtml(l.toDate)}</td>
        <td>${escHtml(String(l.days??1))}</td>
        <td>${escHtml(l.reason||'—')}</td>
        <td style="font-size:.74rem;">${escHtml(l.appliedAt ? new Date(l.appliedAt).toLocaleDateString('en-IN') : '—')}</td>
        <td><span class="pill pill-${l.status||'pending'}">${l.status||'pending'}</span></td>
        <td style="display:flex;gap:.3rem;flex-wrap:wrap;">
          ${l.status==='pending'?`
            <button class="mini-btn mini-btn-success" onclick="actionLeave('${l.id}','approved','${l.empUID}','${l.leaveType}',${l.days??1})">✓</button>
            <button class="mini-btn mini-btn-danger" onclick="actionLeave('${l.id}','rejected','${l.empUID}','${l.leaveType}',${l.days??1})">✕</button>
          ` : ''}
          <button class="mini-btn mini-btn-danger" onclick="deleteLeave('${l.id}')"><i class="fa-solid fa-trash"></i></button>
        </td>
      </tr>`).join('')}
    </tbody></table>`;
  } catch(err) { wrap.innerHTML=`<div class="empty"><h3>Error: ${escHtml(err.message)}</h3></div>`; }
}
document.getElementById('leaveFilterStatus').addEventListener('change', loadLeaves);

// ─── ROLES TABLE ───
function renderRolesTable() {
  populateManagerDropdowns();
  const wrap = document.getElementById('rolesTableWrap');
  if (!wrap) return;
  const mgMap={};
  window.hrmEmployees.filter(e=>e.role==='manager').forEach(m=>mgMap[m.uid]=m.name);
  if (!window.hrmEmployees.length) { wrap.innerHTML=`<div class="empty"><h3>No employees.</h3></div>`; return; }
  wrap.innerHTML = `<table><thead><tr><th>Name</th><th>ID</th><th>Role</th><th>Assigned Manager</th><th>Status</th><th>Actions</th></tr></thead><tbody>
    ${window.hrmEmployees.map(e=>`<tr>
      <td><strong>${escHtml(e.name)}</strong></td>
      <td><span style="font-family:var(--font-mono);font-size:.75rem;">${escHtml(e.employeeId||'')}</span></td>
      <td>
        <select class="select-filter" style="padding:.3rem .6rem;font-size:.79rem;" onchange="setEmployeeRole('${e.id}',this.value)">
          <option value="employee" ${(e.role||'employee')==='employee'?'selected':''}>Employee</option>
          <option value="manager" ${e.role==='manager'?'selected':''}>Manager</option>
          <option value="admin" ${e.role==='admin'?'selected':''}>Admin</option>
        </select>
      </td>
      <td>
        <select class="select-filter" style="padding:.3rem .6rem;font-size:.79rem;" onchange="reassignManager('${e.id}',this.value)">
          <option value="">— No Manager —</option>
          ${window.hrmEmployees.filter(m=>m.role==='manager'&&m.uid!==e.uid).map(m=>`<option value="${escHtml(m.uid)}" ${e.managerId===m.uid?'selected':''}>${escHtml(m.name)}</option>`).join('')}
        </select>
      </td>
      <td><span class="pill ${e.status==='active'?'pill-active':'pill-inactive'}">${escHtml(e.status)}</span></td>
      <td style="display:flex;gap:.3rem;flex-wrap:wrap;">
        <button class="mini-btn ${e.status==='active'?'mini-btn-danger':''}" onclick="toggleEmpStatus('${e.id}')">${e.status==='active'?'Deactivate':'Activate'}</button>
      </td>
    </tr>`).join('')}
  </tbody></table>`;
}

window.setEmployeeRole = async function(id, newRole) {
  const e = window.hrmEmployees.find(x=>x.id===id);
  if (!e) return;
  const oldRole = e.role || 'employee';
  if (newRole === oldRole) return;
  const msg = newRole === 'admin'
    ? `Make ${e.name} an Admin? They will get full access to this Workspace, including payroll, employee records, and the CRM.`
    : `Change ${e.name}'s role from ${oldRole} to ${newRole}?`;
  if (!confirm(msg)) { renderCurrentAdminPage(); return; }
  try {
    await setDoc(doc(db,'hrm_employees',id), {role:newRole}, {merge:true});
    if (e.uid) await setDoc(doc(db,'hrm_users',e.uid), {role:newRole}, {merge:true});
    showToast(`${e.name} is now ${newRole==='admin'?'an':'a'} ${newRole}.`);
  } catch(err) { showToast('Could not update role: '+err.message, true); }
};

window.reassignManager = async function(empId, managerUID) {
  await setDoc(doc(db,'hrm_employees',empId), {managerId: managerUID||null}, {merge:true});
  const e = window.hrmEmployees.find(x=>x.id===empId);
  if (e?.uid) await setDoc(doc(db,'hrm_users',e.uid), {managerId: managerUID||null}, {merge:true});
  showToast('Manager assignment updated.');
};

// ─── EXPORT ───
window.exportAttendanceExcel = async function() {
  try {
    const snap = await getDocs(collection(db,'hrm_attendance'));
    const recs = snap.docs.map(d=>d.data());
    const empMap={};
    window.hrmEmployees.forEach(e=>empMap[e.uid]=e);
    const rows = recs.map(r=>{
      const e = empMap[r.empUID]||{};
      return {
        'Employee Name': e.name||r.empUID,
        'Employee ID': e.employeeId||'',
        'Date': r.date,
        'Client': r.clientNumber||'',
        'Student': r.studentName||'',
        'Check In': r.checkIn||'',
        'Check Out': r.checkOut||'',
        'Duration': calcDuration(r.checkIn,r.checkOut),
        'Scheduled Hours': r.scheduledHours||'',
        'Bank Account': e.bankAccount||'',
        'IFSC': e.ifsc||'',
        'Bank Name': e.bankName||'',
        'Account Holder': e.bankHolder||''
      };
    }).sort((a,b)=>b.Date.localeCompare(a.Date));
    if (!rows.length) { showToast('No attendance records.', true); return; }
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Attendance');
    XLSX.writeFile(wb,'HRM_Attendance_Export.xlsx');
    showToast('Exported successfully!');
  } catch(err) { showToast('Export error: '+err.message, true); }
};

// ─── EMPLOYEE: OPEN EDIT REQUEST MODAL ───
window.openEmpEditReqModal = function(empDocId, currentDataJson) {
  let cur = {};
  try { cur = JSON.parse(currentDataJson); } catch(e) {}
  document.getElementById('eerEmpDocId').value = empDocId;
  document.getElementById('eerPhone').value = '';
  document.getElementById('eerGender').value = '';
  document.getElementById('eerPan').value = '';
  document.getElementById('eerAadhaar').value = '';
  document.getElementById('eerBankAcc').value = '';
  document.getElementById('eerIFSC').value = '';
  document.getElementById('eerBankName').value = '';
  document.getElementById('eerBankHolder').value = '';
  document.getElementById('eerNote').value = '';
  window._eerCurrentData = cur;
  document.getElementById('empEditReqModal').classList.add('open');
};

document.getElementById('empEditReqForm').addEventListener('submit', async e => {
  e.preventDefault();
  const btn = document.getElementById('eerSubmitBtn');
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Submitting...'; btn.disabled = true;
  const empDocId = document.getElementById('eerEmpDocId').value;
  const cur = window._eerCurrentData || {};
  const requested = {};
  const fields = [
    {id:'eerPhone', key:'phone'},
    {id:'eerGender', key:'gender'},
    {id:'eerPan', key:'pan', transform: v => v.toUpperCase()},
    {id:'eerAadhaar', key:'aadhaar'},
    {id:'eerBankAcc', key:'bankAccount'},
    {id:'eerIFSC', key:'ifsc', transform: v => v.toUpperCase()},
    {id:'eerBankName', key:'bankName'},
    {id:'eerBankHolder', key:'bankHolder'},
  ];
  fields.forEach(f => {
    const val = document.getElementById(f.id).value.trim();
    if (val) requested[f.key] = f.transform ? f.transform(val) : val;
  });
  if (!Object.keys(requested).length) {
    showToast('Please fill at least one field to change.', true);
    btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Submit for Approval'; btn.disabled = false;
    return;
  }
  // Build "current values" snapshot for admin comparison
  const currentSnapshot = {};
  Object.keys(requested).forEach(k => { currentSnapshot[k] = cur[k] || ''; });
  const note = document.getElementById('eerNote').value.trim();
  try {
    const uid = window.hrmCurrentUser.uid;
    const empSnap = await getDocs(query(collection(db,'hrm_employees'),where('uid','==',uid)));
    const empName = empSnap.empty ? '' : empSnap.docs[0].data().name;
    const reqId = 'er_'+Date.now();
    await setDoc(doc(db,'hrm_edit_requests',reqId), {
      empUID: uid, empDocId, empName,
      requested, currentSnapshot,
      note, status: 'pending',
      submittedAt: new Date().toISOString()
    });
    document.getElementById('empEditReqModal').classList.remove('open');
    showToast('Edit request submitted! Admin will review it.');
    loadMyEditRequests(uid);
    epSwitchTab('editreq', document.querySelector('#empPortalScreen .nav-item[onclick*="editreq"]'));
  } catch(err) { showToast('Error: '+err.message, true); }
  finally { btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Submit for Approval'; btn.disabled = false; }
});

async function loadMyEditRequests(uid) {
  const el = document.getElementById('ep-my-edit-reqs');
  if (!el) return;
  try {
    const snap = await getDocs(query(collection(db,'hrm_edit_requests'),where('empUID','==',uid)));
    const reqs = snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(b.submittedAt||'').localeCompare(a.submittedAt||''));
    if (!reqs.length) { el.innerHTML=`<div class="empty" style="border:none;"><h3>No edit requests yet.</h3></div>`; return; }
    const fieldLabels = {phone:'Phone',gender:'Gender',pan:'PAN',aadhaar:'Aadhaar',bankAccount:'Bank Account',ifsc:'IFSC',bankName:'Bank Name',bankHolder:'Account Holder'};
    el.innerHTML = `<table><thead><tr><th>Fields Requested</th><th>Submitted</th><th>Note</th><th>Status</th></tr></thead><tbody>
      ${reqs.map(r=>{
        const fields = Object.keys(r.requested||{}).map(k=>fieldLabels[k]||k).join(', ');
        return `<tr>
          <td>${escHtml(fields)}</td>
          <td style="font-size:.74rem;">${escHtml(r.submittedAt ? new Date(r.submittedAt).toLocaleDateString('en-IN') : '—')}</td>
          <td style="font-size:.78rem;">${escHtml(r.note||'—')}</td>
          <td><span class="pill pill-${r.status||'pending'}">${r.status||'pending'}</span></td>
        </tr>`;
      }).join('')}
    </tbody></table>`;
  } catch(e) { el.innerHTML=`<div class="empty"><h3>Error loading requests.</h3></div>`; }
}

// ─── ADMIN: LOAD EDIT REQUESTS ───
window.loadEditRequests = async function() {
  const wrap = document.getElementById('editReqTableWrap');
  if (!wrap) return;
  wrap.innerHTML=`<div class="empty"><h3><i class="fa-solid fa-spinner fa-spin"></i> Loading...</h3></div>`;
  const statusFilter = document.getElementById('editReqFilterStatus').value;
  try {
    const snap = await getDocs(collection(db,'hrm_edit_requests'));
    let reqs = snap.docs.map(d=>({id:d.id,...d.data()}));
    if (statusFilter !== 'all') reqs = reqs.filter(r=>r.status===statusFilter);
    reqs.sort((a,b)=>(b.submittedAt||'').localeCompare(a.submittedAt||''));
    // Update badge
    const pendingCount = snap.docs.filter(d=>d.data().status==='pending').length;
    const badge = document.getElementById('editReqBadge');
    if (badge) { badge.textContent = pendingCount; badge.style.display = pendingCount ? 'inline' : 'none'; }
    if (!reqs.length) { wrap.innerHTML=`<div class="empty"><div class="empty-icon">✏️</div><h3>No edit requests found.</h3></div>`; return; }
    const fieldLabels = {phone:'Phone',gender:'Gender',pan:'PAN',aadhaar:'Aadhaar',bankAccount:'Bank Account',ifsc:'IFSC',bankName:'Bank Name',bankHolder:'Account Holder'};
    wrap.innerHTML = `<table><thead><tr><th>Employee</th><th>Fields</th><th>Submitted</th><th>Note</th><th>Status</th><th>Actions</th></tr></thead><tbody>
      ${reqs.map(r=>{
        const fields = Object.keys(r.requested||{}).map(k=>fieldLabels[k]||k).join(', ');
        return `<tr>
          <td><strong>${escHtml(r.empName||'')}</strong></td>
          <td style="font-size:.78rem;">${escHtml(fields)}</td>
          <td style="font-size:.74rem;">${escHtml(r.submittedAt ? new Date(r.submittedAt).toLocaleDateString('en-IN') : '—')}</td>
          <td style="font-size:.78rem;">${escHtml(r.note||'—')}</td>
          <td><span class="pill pill-${r.status||'pending'}">${r.status||'pending'}</span></td>
          <td style="display:flex;gap:.3rem;flex-wrap:wrap;">
            <button class="mini-btn" onclick="openAdminEditReview('${r.id}')"><i class="fa-solid fa-eye"></i> Review</button>
            ${r.status==='pending'?`
              <button class="mini-btn mini-btn-success" onclick="actionEditRequest('${r.id}','approved')">✓</button>
              <button class="mini-btn mini-btn-danger" onclick="actionEditRequest('${r.id}','rejected')">✕</button>
            `:''}
          </td>
        </tr>`;
      }).join('')}
    </tbody></table>`;
  } catch(err) { wrap.innerHTML=`<div class="empty"><h3>Error: ${escHtml(err.message)}</h3></div>`; }
};

document.getElementById('editReqFilterStatus').addEventListener('change', loadEditRequests);

window.openAdminEditReview = async function(reqId) {
  const snap = await getDoc(doc(db,'hrm_edit_requests',reqId));
  if (!snap.exists()) return;
  const r = {id:snap.id,...snap.data()};
  const fieldLabels = {phone:'Phone',gender:'Gender',pan:'PAN',aadhaar:'Aadhaar',bankAccount:'Bank Account',ifsc:'IFSC',bankName:'Bank Name',bankHolder:'Account Holder'};
  const rows = Object.keys(r.requested||{}).map(k=>`
    <tr>
      <td><strong>${escHtml(fieldLabels[k]||k)}</strong></td>
      <td style="color:var(--error);text-decoration:line-through;">${escHtml(r.currentSnapshot?.[k]||'—')}</td>
      <td style="color:var(--success);font-weight:600;">${escHtml(r.requested[k]||'—')}</td>
    </tr>`).join('');
  document.getElementById('adminEditReviewBody').innerHTML = `
    <div style="margin-bottom:1rem;">
      <div style="font-size:.8rem;color:var(--text-3);">Employee: <strong style="color:var(--text);">${escHtml(r.empName||'')}</strong> &nbsp;·&nbsp; Submitted: ${escHtml(r.submittedAt ? new Date(r.submittedAt).toLocaleString('en-IN') : '—')}</div>
      ${r.note ? `<div class="info-box" style="margin-top:.6rem;"><i class="fa-solid fa-comment"></i> ${escHtml(r.note)}</div>` : ''}
    </div>
    <div class="table-wrap" style="margin-bottom:1.2rem;">
      <table><thead><tr><th>Field</th><th>Current Value</th><th>Requested Value</th></tr></thead>
      <tbody>${rows}</tbody></table>
    </div>
    <div style="display:flex;gap:.7rem;justify-content:flex-end;flex-wrap:wrap;">
      <button class="btn btn-secondary" onclick="document.getElementById('adminEditReviewModal').classList.remove('open')">Close</button>
      ${r.status==='pending'?`
        <button class="btn btn-danger" onclick="actionEditRequest('${r.id}','rejected');document.getElementById('adminEditReviewModal').classList.remove('open')"><i class="fa-solid fa-xmark"></i> Reject</button>
        <button class="btn btn-gold" onclick="actionEditRequest('${r.id}','approved');document.getElementById('adminEditReviewModal').classList.remove('open')"><i class="fa-solid fa-check"></i> Approve & Apply</button>
      `:``}
    </div>`;
  document.getElementById('adminEditReviewModal').classList.add('open');
};

window.actionEditRequest = async function(reqId, action) {
  try {
    const rSnap = await getDoc(doc(db,'hrm_edit_requests',reqId));
    if (!rSnap.exists()) return;
    const r = rSnap.data();
    await setDoc(doc(db,'hrm_edit_requests',reqId), {status:action, actionedAt:new Date().toISOString()}, {merge:true});
    if (action === 'approved' && r.empDocId && r.requested) {
      await setDoc(doc(db,'hrm_employees',r.empDocId), r.requested, {merge:true});
      if (r.empUID) await setDoc(doc(db,'hrm_users',r.empUID), r.requested, {merge:true});
    }
    showToast(`Edit request ${action}!`);
    loadEditRequests();
    // refresh badge
    const pendingSnap = await getDocs(collection(db,'hrm_edit_requests'));
    const cnt = pendingSnap.docs.filter(d=>d.data().status==='pending').length;
    const badge = document.getElementById('editReqBadge');
    if (badge) { badge.textContent = cnt; badge.style.display = cnt ? 'inline' : 'none'; }
  } catch(err) { showToast('Error: '+err.message, true); }
};

// Init (update badge on load)
async function initEditReqBadge() {
  try {
    const snap = await getDocs(collection(db,'hrm_edit_requests'));
    const cnt = snap.docs.filter(d=>d.data().status==='pending').length;
    const badge = document.getElementById('editReqBadge');
    if (badge) { badge.textContent = cnt; badge.style.display = cnt ? 'inline' : 'none'; }
  } catch(e){}
}

// ─── DOCUMENTS ───
const DOC_TYPE_LABELS = {
  pan:'PAN Card', aadhaar:'Aadhaar Card',
  marksheet_10:'10th Mark Sheet', marksheet_12:'12th Mark Sheet',
  degree:'Degree Certificate', offer_letter:'Offer Letter',
  relieving:'Relieving Letter', experience:'Experience Certificate', other:'Other'
};
const DOC_TYPE_ICONS = {
  pan:'🪪', aadhaar:'🪪', marksheet_10:'📄', marksheet_12:'📄',
  degree:'🎓', offer_letter:'📝', relieving:'📝', experience:'📝', other:'📎'
};

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

window.handleDocDrop = function(event, uid) {
  event.preventDefault();
  document.getElementById('docDropZone').classList.remove('drag-over');
  const files = Array.from(event.dataTransfer.files);
  uploadDocFiles(files, uid);
};

window.handleDocFileSelect = function(event, uid) {
  const files = Array.from(event.target.files);
  uploadDocFiles(files, uid);
  event.target.value = '';
};

async function uploadDocFiles(files, uid) {
  const statusEl = document.getElementById('docUploadStatus');
  const validTypes = ['application/pdf','image/jpeg','image/jpg','image/png'];
  const maxSize = 5 * 1024 * 1024;
  for (const file of files) {
    if (!validTypes.includes(file.type)) {
      showToast(`${file.name}: unsupported type.`, true); continue;
    }
    if (file.size > maxSize) {
      showToast(`${file.name}: exceeds 5 MB limit.`, true); continue;
    }
    const docType = document.getElementById('docTypeSelect')?.value || 'other';
    statusEl.innerHTML = `<div class="upload-progress"><div class="upload-progress-bar" id="upBar" style="width:20%"></div></div><div style="font-size:.78rem;color:var(--text-3);margin-top:.3rem;">Uploading ${escHtml(file.name)}...</div>`;
    try {
      const bar = document.getElementById('upBar');
      if (bar) bar.style.width = '50%';
      const base64 = await fileToBase64(file);
      if (bar) bar.style.width = '80%';
      const docId = 'doc_' + uid + '_' + Date.now();
      await setDoc(doc(db,'hrm_documents',docId), {
        uid, docType, fileName: file.name,
        fileType: file.type, fileSize: file.size,
        base64Data: base64,
        uploadedAt: new Date().toISOString()
      });
      if (bar) bar.style.width = '100%';
      setTimeout(() => { statusEl.innerHTML = ''; }, 800);
      showToast(`${file.name} uploaded!`);
      loadMyDocuments(uid);
    } catch(err) {
      statusEl.innerHTML = '';
      showToast('Upload failed: ' + err.message, true);
    }
  }
}

window.loadMyDocuments = async function(uid) {
  const grid = document.getElementById('docGrid');
  if (!grid) return;
  grid.innerHTML = `<div class="empty" style="grid-column:1/-1;border:none;"><h3><i class="fa-solid fa-spinner fa-spin"></i> Loading...</h3></div>`;
  try {
    const snap = await getDocs(query(collection(db,'hrm_documents'),where('uid','==',uid)));
    const docs = snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(b.uploadedAt||'').localeCompare(a.uploadedAt||''));
    if (!docs.length) {
      grid.innerHTML = `<div class="empty" style="grid-column:1/-1;border:none;"><div class="empty-icon">📂</div><h3>No documents uploaded yet.</h3></div>`;
      return;
    }
    grid.innerHTML = docs.map(d => {
      const icon = DOC_TYPE_ICONS[d.docType] || '📎';
      const label = DOC_TYPE_LABELS[d.docType] || d.docType;
      const sizeKB = d.fileSize ? (d.fileSize/1024).toFixed(1) + ' KB' : '';
      const date = d.uploadedAt ? new Date(d.uploadedAt).toLocaleDateString('en-IN') : '';
      return `<div class="doc-card">
        <div style="display:flex;align-items:center;gap:.6rem;">
          <div class="doc-card-icon">${icon}</div>
          <div style="min-width:0;">
            <div class="doc-card-name" title="${escHtml(d.fileName)}">${escHtml(d.fileName)}</div>
            <div class="doc-card-meta">${escHtml(label)}</div>
          </div>
        </div>
        <div class="doc-card-meta">${sizeKB}${sizeKB && date?' · ':''}${date}</div>
        <div class="doc-card-actions">
          <button class="mini-btn" onclick="previewDoc('${d.id}')"><i class="fa-solid fa-eye"></i> View</button>
          <button class="mini-btn mini-btn-danger" onclick="deleteDoc_('${d.id}','${uid}')"><i class="fa-solid fa-trash"></i></button>
        </div>
      </div>`;
    }).join('');
  } catch(err) {
    grid.innerHTML = `<div class="empty" style="grid-column:1/-1;"><h3>Error loading documents.</h3></div>`;
  }
};

window.previewDoc = async function(docId) {
  try {
    const snap = await getDoc(doc(db,'hrm_documents',docId));
    if (!snap.exists()) return;
    const d = snap.data();
    const win = window.open('', '_blank');
    if (d.fileType === 'application/pdf') {
      win.document.write(`<html><body style="margin:0"><embed src="${d.base64Data}" type="application/pdf" width="100%" height="100%"></body></html>`);
    } else {
      win.document.write(`<html><body style="margin:0;background:#000;display:flex;align-items:center;justify-content:center;min-height:100vh"><img src="${d.base64Data}" style="max-width:100%;max-height:100vh;object-fit:contain"></body></html>`);
    }
  } catch(err) { showToast('Preview error: '+err.message, true); }
};

window.deleteDoc_ = async function(docId, uid) {
  if (!confirm('Delete this document? This cannot be undone.')) return;
  try {
    await deleteDoc(doc(db,'hrm_documents',docId));
    showToast('Document deleted.');
    loadMyDocuments(uid);
  } catch(err) { showToast('Delete error: '+err.message, true); }
};

// ─── STUDY MATERIALS (per-student, uploaded by assigned staff) ───
window.handleStudyMaterialSelect = function(event) {
  const files = Array.from(event.target.files);
  const sel = document.getElementById('smClientSelect');
  const opt = sel.options[sel.selectedIndex];
  if (!sel.value) { showToast('Select a student first.', true); event.target.value=''; return; }
  uploadStudyMaterialFiles(files, {
    clientId: sel.value, clientNumber: opt.dataset.number, studentName: opt.dataset.student
  });
  event.target.value = '';
};

async function uploadStudyMaterialFiles(files, client) {
  const statusEl = document.getElementById('smUploadStatus');
  const validTypes = ['application/pdf','image/jpeg','image/jpg','image/png','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
  const maxSize = 5 * 1024 * 1024;
  const title = document.getElementById('smTitle').value.trim();
  for (const file of files) {
    if (!validTypes.includes(file.type)) { showToast(`${file.name}: unsupported type.`, true); continue; }
    if (file.size > maxSize) { showToast(`${file.name}: exceeds 5 MB limit.`, true); continue; }
    statusEl.innerHTML = `<div class="upload-progress"><div class="upload-progress-bar" id="smUpBar" style="width:20%"></div></div><div style="font-size:.78rem;color:var(--text-3);margin-top:.3rem;">Uploading ${escHtml(file.name)}...</div>`;
    try {
      const bar = document.getElementById('smUpBar');
      if (bar) bar.style.width = '50%';
      const base64 = await fileToBase64(file);
      if (bar) bar.style.width = '80%';
      const matId = 'sm_' + client.clientId + '_' + Date.now();
      await setDoc(doc(db,'hrm_study_materials',matId), {
        clientId: client.clientId, clientNumber: client.clientNumber, studentName: client.studentName,
        title, fileName: file.name, fileType: file.type, fileSize: file.size,
        base64Data: base64,
        uploadedByUid: window.hrmCurrentUser.uid,
        uploadedByName: (window.hrmEmployees||[]).find(e=>e.uid===window.hrmCurrentUser.uid)?.name || window.hrmCurrentUser.email,
        uploadedAt: new Date().toISOString()
      });
      if (bar) bar.style.width = '100%';
      setTimeout(() => { statusEl.innerHTML = ''; }, 800);
      showToast(`${file.name} uploaded!`);
      document.getElementById('smTitle').value = '';
      loadStudyMaterials(client.clientId);
    } catch(err) {
      statusEl.innerHTML = '';
      showToast('Upload failed: ' + err.message, true);
    }
  }
}

window.loadStudyMaterials = async function(clientId) {
  const uploadWrap = document.getElementById('smUploadWrap');
  const grid = document.getElementById('smGrid');
  if (!clientId) {
    uploadWrap.style.display = 'none';
    grid.innerHTML = `<div class="empty" style="grid-column:1/-1;border:none;"><h3>Select a student to see their materials.</h3></div>`;
    return;
  }
  uploadWrap.style.display = 'block';
  grid.innerHTML = `<div class="empty" style="grid-column:1/-1;border:none;"><h3><i class="fa-solid fa-spinner fa-spin"></i> Loading...</h3></div>`;
  try {
    const snap = await getDocs(query(collection(db,'hrm_study_materials'),where('clientId','==',clientId)));
    const mats = snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(b.uploadedAt||'').localeCompare(a.uploadedAt||''));
    if (!mats.length) {
      grid.innerHTML = `<div class="empty" style="grid-column:1/-1;border:none;"><div class="empty-icon">📚</div><h3>No study materials uploaded yet for this student.</h3></div>`;
      return;
    }
    grid.innerHTML = mats.map(m => {
      const icon = m.fileType === 'application/pdf' ? '📄' : (m.fileType && m.fileType.startsWith('image/') ? '🖼️' : '📎');
      const sizeKB = m.fileSize ? (m.fileSize/1024).toFixed(1) + ' KB' : '';
      const date = m.uploadedAt ? new Date(m.uploadedAt).toLocaleDateString('en-IN') : '';
      return `<div class="doc-card">
        <div style="display:flex;align-items:center;gap:.6rem;">
          <div class="doc-card-icon">${icon}</div>
          <div style="min-width:0;">
            <div class="doc-card-name" title="${escHtml(m.fileName)}">${escHtml(m.title)||escHtml(m.fileName)}</div>
            <div class="doc-card-meta">by ${escHtml(m.uploadedByName)}</div>
          </div>
        </div>
        <div class="doc-card-meta">${sizeKB}${sizeKB && date?' · ':''}${date}</div>
        <div class="doc-card-actions">
          <button class="mini-btn" onclick="previewStudyMaterial('${m.id}')"><i class="fa-solid fa-eye"></i> View</button>
          <button class="mini-btn mini-btn-danger" onclick="deleteStudyMaterial('${m.id}','${clientId}')"><i class="fa-solid fa-trash"></i></button>
        </div>
      </div>`;
    }).join('');
  } catch(err) {
    grid.innerHTML = `<div class="empty" style="grid-column:1/-1;"><h3>Error loading materials.</h3></div>`;
  }
};

window.previewStudyMaterial = async function(matId) {
  try {
    const snap = await getDoc(doc(db,'hrm_study_materials',matId));
    if (!snap.exists()) return;
    const d = snap.data();
    const win = window.open('', '_blank');
    if (d.fileType === 'application/pdf') {
      win.document.write(`<html><body style="margin:0"><embed src="${d.base64Data}" type="application/pdf" width="100%" height="100%"></body></html>`);
    } else if (d.fileType && d.fileType.startsWith('image/')) {
      win.document.write(`<html><body style="margin:0;background:#000;display:flex;align-items:center;justify-content:center;min-height:100vh"><img src="${d.base64Data}" style="max-width:100%;max-height:100vh;object-fit:contain"></body></html>`);
    } else {
      const a = win.document.createElement('a');
      a.href = d.base64Data; a.download = d.fileName; win.document.body.appendChild(a); a.click();
    }
  } catch(err) { showToast('Preview error: '+err.message, true); }
};

window.deleteStudyMaterial = async function(matId, clientId) {
  if (!confirm('Delete this study material? This cannot be undone.')) return;
  try {
    await deleteDoc(doc(db,'hrm_study_materials',matId));
    showToast('Study material deleted.');
    loadStudyMaterials(clientId);
  } catch(err) { showToast('Delete error: '+err.message, true); }
};

// ─── STUDENT PROGRESS (per-student notes, added by assigned staff/admin) ───
window.loadStudentProgress = async function(clientId) {
  const formWrap = document.getElementById('spFormWrap');
  const divider = document.getElementById('spDivider');
  const log = document.getElementById('spLog');
  if (!clientId) {
    formWrap.style.display = 'none';
    divider.style.display = 'none';
    log.innerHTML = `<p class="muted-note">Select a student to see their progress log.</p>`;
    return;
  }
  formWrap.style.display = 'block';
  divider.style.display = 'flex';
  document.getElementById('spAlert').className = 'modal-alert';
  log.innerHTML = `<p class="muted-note"><i class="fa-solid fa-spinner fa-spin"></i> Loading…</p>`;
  await renderStudentProgressLog(clientId);
};

async function renderStudentProgressLog(clientId) {
  const log = document.getElementById('spLog');
  try {
    const snap = await getDocs(query(collection(db,'hrm_student_progress'),where('clientId','==',clientId)));
    const entries = snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(b.createdAt||'').localeCompare(a.createdAt||''));
    if (!entries.length) {
      log.innerHTML = `<p class="muted-note">No progress updates yet.</p>`;
      return;
    }
    log.innerHTML = entries.map(e => `
      <div class="perf-entry">
        <div class="perf-entry-head">
          <span class="perf-entry-subject">${escHtml(e.subject)||'General update'}</span>
          <span class="perf-entry-date">${escHtml(e.date)||(e.createdAt?new Date(e.createdAt).toLocaleDateString('en-IN'):'')}</span>
        </div>
        <div class="perf-entry-note">${escHtml(e.note)}</div>
        <div class="perf-entry-meta">
          <span>Added by ${escHtml(e.addedByName)}</span>
          <button class="perf-entry-del" onclick="deleteStudentProgress('${e.id}','${clientId}')">Delete</button>
        </div>
      </div>
    `).join('');
  } catch(err) {
    log.innerHTML = `<p class="muted-note">Could not load progress history.</p>`;
  }
}

window.submitStudentProgress = async function() {
  const sel = document.getElementById('spClientSelect');
  if (!sel.value) { showToast('Select a student first.', true); return; }
  const note = document.getElementById('sp_note').value.trim();
  const alertEl = document.getElementById('spAlert');
  alertEl.className = 'modal-alert';
  if (!note) {
    alertEl.textContent = 'Progress notes are required.';
    alertEl.className = 'modal-alert show error';
    return;
  }
  const opt = sel.options[sel.selectedIndex];
  const subject = document.getElementById('sp_subject').value.trim();
  const date = document.getElementById('sp_date').value;
  const btn = document.getElementById('spSaveBtn');
  btn.disabled = true; btn.innerHTML = 'Saving…';
  try {
    await setDoc(doc(collection(db,'hrm_student_progress')), {
      clientId: sel.value, clientNumber: opt.dataset.number, studentName: opt.dataset.student,
      subject, note, date,
      addedByUid: window.hrmCurrentUser.uid,
      addedByName: (window.hrmEmployees||[]).find(e=>e.uid===window.hrmCurrentUser.uid)?.name || window.hrmCurrentUser.email,
      createdAt: new Date().toISOString()
    });
    showToast('Progress update added.');
    document.getElementById('sp_subject').value = '';
    document.getElementById('sp_date').value = '';
    document.getElementById('sp_note').value = '';
    await renderStudentProgressLog(sel.value);
  } catch(err) {
    alertEl.textContent = 'Could not save this update: ' + err.message;
    alertEl.className = 'modal-alert show error';
  } finally {
    btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-plus"></i> Add Progress Update';
  }
};

window.deleteStudentProgress = async function(entryId, clientId) {
  if (!confirm('Delete this progress update? This cannot be undone.')) return;
  try {
    await deleteDoc(doc(db,'hrm_student_progress',entryId));
    showToast('Progress update deleted.');
    if (document.getElementById('spLog')) renderStudentProgressLog(clientId);
    if (document.getElementById('clientDetailProgress')) loadClientDetailProgress(clientId);
  } catch(err) { showToast('Delete error: '+err.message, true); }
};

// ─── STUDENT TEST PERFORMANCE (per-student marks, added by assigned staff/admin) ───
let tpPendingFile = null;

window.handleTpFileSelect = function(event) {
  const file = event.target.files[0];
  const nameEl = document.getElementById('tpFileName');
  if (!file) { tpPendingFile = null; if (nameEl) nameEl.textContent = ''; return; }
  const validTypes = ['application/pdf','image/jpeg','image/jpg','image/png'];
  const maxSize = 5 * 1024 * 1024;
  if (!validTypes.includes(file.type)) { showToast(`${file.name}: unsupported type.`, true); event.target.value=''; tpPendingFile=null; if(nameEl) nameEl.textContent=''; return; }
  if (file.size > maxSize) { showToast(`${file.name}: exceeds 5 MB limit.`, true); event.target.value=''; tpPendingFile=null; if(nameEl) nameEl.textContent=''; return; }
  tpPendingFile = file;
  if (nameEl) nameEl.textContent = file.name;
};

window.loadTestPerformance = async function(clientId) {
  const formWrap = document.getElementById('tpFormWrap');
  const divider = document.getElementById('tpDivider');
  const log = document.getElementById('tpLog');
  tpPendingFile = null;
  const nameEl = document.getElementById('tpFileName');
  if (nameEl) nameEl.textContent = '';
  if (!clientId) {
    formWrap.style.display = 'none';
    divider.style.display = 'none';
    log.innerHTML = `<p class="muted-note">Select a student to see their test performance log.</p>`;
    return;
  }
  formWrap.style.display = 'block';
  divider.style.display = 'flex';
  document.getElementById('tpAlert').className = 'modal-alert';
  log.innerHTML = `<p class="muted-note"><i class="fa-solid fa-spinner fa-spin"></i> Loading…</p>`;
  await renderTestPerformanceLog(clientId);
};

function tpScoreColor(pct) {
  if (pct >= 75) return 'var(--success)';
  if (pct >= 40) return 'var(--warn)';
  return 'var(--error)';
}

async function renderTestPerformanceLog(clientId) {
  const log = document.getElementById('tpLog');
  try {
    const snap = await getDocs(query(collection(db,'hrm_test_performance'),where('clientId','==',clientId)));
    const entries = snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(b.date||b.createdAt||'').localeCompare(a.date||a.createdAt||''));
    if (!entries.length) {
      log.innerHTML = `<p class="muted-note">No test results recorded yet.</p>`;
      return;
    }
    log.innerHTML = entries.map(e => {
      const obtained = Number(e.marksObtained)||0;
      const total = Number(e.totalMarks)||0;
      const pct = total > 0 ? Math.round((obtained/total)*100) : 0;
      return `
      <div class="perf-entry">
        <div class="perf-entry-head">
          <span class="perf-entry-subject">${escHtml(e.subject)||'Test'}</span>
          <span class="perf-entry-date">${escHtml(e.date)||(e.createdAt?new Date(e.createdAt).toLocaleDateString('en-IN'):'')}</span>
        </div>
        <div style="display:flex;align-items:center;gap:.6rem;margin:.3rem 0;">
          <span style="font-family:var(--font-mono);font-weight:700;font-size:.95rem;color:${tpScoreColor(pct)};">${obtained} / ${total}</span>
          <span class="pill" style="background:transparent;border:1px solid ${tpScoreColor(pct)};color:${tpScoreColor(pct)};font-size:.72rem;">${pct}%</span>
        </div>
        ${e.remarks ? `<div class="perf-entry-note">${escHtml(e.remarks)}</div>` : ''}
        <div class="perf-entry-meta">
          <span>Added by ${escHtml(e.addedByName)}</span>
          <span style="display:flex;gap:.6rem;align-items:center;">
            ${e.fileName ? `<button class="mini-btn" onclick="previewTestPerformanceFile('${e.id}')"><i class="fa-solid fa-eye"></i> Answer Sheet</button>` : ''}
            <button class="perf-entry-del" onclick="deleteTestPerformance('${e.id}','${clientId}')">Delete</button>
          </span>
        </div>
      </div>
    `;}).join('');
  } catch(err) {
    log.innerHTML = `<p class="muted-note">Could not load test performance history.</p>`;
  }
}

window.submitTestPerformance = async function() {
  const sel = document.getElementById('tpClientSelect');
  if (!sel.value) { showToast('Select a student first.', true); return; }
  const subject = document.getElementById('tp_subject').value.trim();
  const date = document.getElementById('tp_date').value;
  const marksObtained = document.getElementById('tp_marksObtained').value;
  const totalMarks = document.getElementById('tp_totalMarks').value;
  const remarks = document.getElementById('tp_remarks').value.trim();
  const alertEl = document.getElementById('tpAlert');
  alertEl.className = 'modal-alert';
  if (!subject || !date || marksObtained === '' || totalMarks === '') {
    alertEl.textContent = 'Subject, test date, marks obtained and total marks are required.';
    alertEl.className = 'modal-alert show error';
    return;
  }
  if (Number(marksObtained) > Number(totalMarks)) {
    alertEl.textContent = 'Marks obtained cannot be greater than total marks.';
    alertEl.className = 'modal-alert show error';
    return;
  }
  const opt = sel.options[sel.selectedIndex];
  const btn = document.getElementById('tpSaveBtn');
  btn.disabled = true; btn.innerHTML = 'Saving…';
  try {
    const payload = {
      clientId: sel.value, clientNumber: opt.dataset.number, studentName: opt.dataset.student,
      subject, date, marksObtained: Number(marksObtained), totalMarks: Number(totalMarks), remarks,
      addedByUid: window.hrmCurrentUser.uid,
      addedByName: (window.hrmEmployees||[]).find(e=>e.uid===window.hrmCurrentUser.uid)?.name || window.hrmCurrentUser.email,
      createdAt: new Date().toISOString()
    };
    if (tpPendingFile) {
      const base64 = await fileToBase64(tpPendingFile);
      payload.fileName = tpPendingFile.name;
      payload.fileType = tpPendingFile.type;
      payload.fileSize = tpPendingFile.size;
      payload.base64Data = base64;
    }
    await setDoc(doc(collection(db,'hrm_test_performance')), payload);
    showToast('Test result added.');
    document.getElementById('tp_subject').value = '';
    document.getElementById('tp_date').value = '';
    document.getElementById('tp_marksObtained').value = '';
    document.getElementById('tp_totalMarks').value = '';
    document.getElementById('tp_remarks').value = '';
    tpPendingFile = null;
    const nameEl = document.getElementById('tpFileName');
    if (nameEl) nameEl.textContent = '';
    await renderTestPerformanceLog(sel.value);
  } catch(err) {
    alertEl.textContent = 'Could not save this result: ' + err.message;
    alertEl.className = 'modal-alert show error';
  } finally {
    btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-plus"></i> Add Test Result';
  }
};

window.previewTestPerformanceFile = async function(entryId) {
  try {
    const snap = await getDoc(doc(db,'hrm_test_performance',entryId));
    if (!snap.exists()) return;
    const e = snap.data();
    if (!e.base64Data) { showToast('No answer sheet attached.', true); return; }
    const win = window.open('', '_blank');
    if (e.fileType === 'application/pdf') {
      win.document.write(`<html><body style="margin:0"><embed src="${e.base64Data}" type="application/pdf" width="100%" height="100%"></body></html>`);
    } else {
      win.document.write(`<html><body style="margin:0;background:#000;display:flex;align-items:center;justify-content:center;min-height:100vh"><img src="${e.base64Data}" style="max-width:100%;max-height:100vh;object-fit:contain"></body></html>`);
    }
  } catch(err) { showToast('Preview error: '+err.message, true); }
};

window.deleteTestPerformance = async function(entryId, clientId) {
  if (!confirm('Delete this test result? This cannot be undone.')) return;
  try {
    await deleteDoc(doc(db,'hrm_test_performance',entryId));
    showToast('Test result deleted.');
    if (document.getElementById('tpLog')) renderTestPerformanceLog(clientId);
  } catch(err) { showToast('Delete error: '+err.message, true); }
};


// ─── ADMIN: EMPLOYEE DOCUMENTS ───
window.loadAdminDocs = async function() {
  const wrap = document.getElementById('adminDocTableWrap');
  if (!wrap) return;
  wrap.innerHTML = `<div class="empty"><h3><i class="fa-solid fa-spinner fa-spin"></i> Loading...</h3></div>`;

  // Populate employee filter dropdown
  const empFilter = document.getElementById('adminDocEmpFilter');
  if (empFilter) {
    const current = empFilter.value;
    empFilter.innerHTML = `<option value="all">All Employees</option>` +
      window.hrmEmployees.map(e=>`<option value="${escHtml(e.uid)}">${escHtml(e.name)} (${escHtml(e.employeeId||'')})</option>`).join('');
    empFilter.value = current;
  }

  const selectedEmp  = document.getElementById('adminDocEmpFilter')?.value  || 'all';
  const selectedType = document.getElementById('adminDocTypeFilter')?.value || 'all';

  try {
    const snap = await getDocs(collection(db,'hrm_documents'));
    let docs = snap.docs.map(d=>({id:d.id,...d.data()}));
    if (selectedEmp  !== 'all') docs = docs.filter(d=>d.uid === selectedEmp);
    if (selectedType !== 'all') docs = docs.filter(d=>d.docType === selectedType);
    docs.sort((a,b)=>(b.uploadedAt||'').localeCompare(a.uploadedAt||''));

    const empMap = {};
    window.hrmEmployees.forEach(e=>empMap[e.uid]=e);

    if (!docs.length) {
      wrap.innerHTML = `<div class="empty"><div class="empty-icon">📂</div><h3>No documents found.</h3></div>`;
      return;
    }

    const DOC_LABELS = {pan:'PAN Card',aadhaar:'Aadhaar Card',marksheet_10:'10th Mark Sheet',marksheet_12:'12th Mark Sheet',degree:'Degree Certificate',offer_letter:'Offer Letter',relieving:'Relieving Letter',experience:'Experience Certificate',other:'Other'};
    const DOC_ICONS  = {pan:'🪪',aadhaar:'🪪',marksheet_10:'📄',marksheet_12:'📄',degree:'🎓',offer_letter:'📝',relieving:'📝',experience:'📝',other:'📎'};

    wrap.innerHTML = `<div class="table-wrap" style="border:none;">
      <table><thead><tr><th>Employee</th><th>Role</th><th>Document Type</th><th>File Name</th><th>Size</th><th>Uploaded</th><th>Actions</th></tr></thead>
      <tbody>
      ${docs.map(d => {
        const emp  = empMap[d.uid] || {};
        const icon = DOC_ICONS[d.docType]  || '📎';
        const lbl  = DOC_LABELS[d.docType] || d.docType;
        const kb   = d.fileSize ? (d.fileSize/1024).toFixed(1)+' KB' : '—';
        const dt   = d.uploadedAt ? new Date(d.uploadedAt).toLocaleDateString('en-IN') : '—';
        return `<tr>
          <td><strong>${escHtml(emp.name||d.uid)}</strong><br><span style="font-size:.72rem;color:var(--text-3);">${escHtml(emp.employeeId||'')}</span></td>
          <td><span class="pill pill-${emp.role||'employee'}" style="font-size:.65rem;">${escHtml(emp.role||'—')}</span></td>
          <td><span style="font-size:1.1rem;">${icon}</span> ${escHtml(lbl)}</td>
          <td style="font-size:.78rem;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${escHtml(d.fileName)}">${escHtml(d.fileName)}</td>
          <td style="font-size:.76rem;">${kb}</td>
          <td style="font-size:.76rem;">${dt}</td>
          <td style="display:flex;gap:.3rem;">
            <button class="mini-btn" onclick="adminPreviewDoc('${d.id}','${escHtml(d.fileName)}')"><i class="fa-solid fa-eye"></i> View</button>
            <button class="mini-btn mini-btn-danger" onclick="adminDeleteDoc('${d.id}')"><i class="fa-solid fa-trash"></i></button>
          </td>
        </tr>`;
      }).join('')}
      </tbody></table>
    </div>`;
  } catch(err) {
    wrap.innerHTML = `<div class="empty"><h3>Error: ${escHtml(err.message)}</h3></div>`;
  }
};

['adminDocEmpFilter','adminDocTypeFilter'].forEach(id => {
  const el = document.getElementById(id);
  if (el) el.addEventListener('change', loadAdminDocs);
});

window.adminPreviewDoc = async function(docId, fileName) {
  document.getElementById('adminDocPreviewTitle').textContent = fileName || 'Document Preview';
  document.getElementById('adminDocPreviewBody').innerHTML =
    `<div style="padding:2rem;color:var(--text-3);"><i class="fa-solid fa-spinner fa-spin fa-2x"></i></div>`;
  document.getElementById('adminDocPreviewModal').classList.add('open');
  try {
    const snap = await getDoc(doc(db,'hrm_documents',docId));
    if (!snap.exists()) { document.getElementById('adminDocPreviewBody').innerHTML='<div class="empty"><h3>Document not found.</h3></div>'; return; }
    const d = snap.data();
    if (d.fileType === 'application/pdf') {
      document.getElementById('adminDocPreviewBody').innerHTML =
        `<embed src="${d.base64Data}" type="application/pdf" style="width:100%;height:600px;border-radius:var(--r-sm);">`;
    } else {
      document.getElementById('adminDocPreviewBody').innerHTML =
        `<img src="${d.base64Data}" style="max-width:100%;max-height:600px;object-fit:contain;border-radius:var(--r-sm);">`;
    }
  } catch(err) { document.getElementById('adminDocPreviewBody').innerHTML=`<div class="empty"><h3>Error: ${escHtml(err.message)}</h3></div>`; }
};

window.adminDeleteDoc = async function(docId) {
  if (!confirm('Delete this document permanently?')) return;
  try {
    await deleteDoc(doc(db,'hrm_documents',docId));
    showToast('Document deleted.');
    loadAdminDocs();
  } catch(err) { showToast('Delete error: '+err.message, true); }
};

// ─── PROFILE PHOTO ───
window._pendingPhotoData = null;
window._pendingPhotoUID  = null;

window.openPhotoUploadModal = function(uid, name) {
  window._pendingPhotoData = null;
  window._pendingPhotoUID  = uid;
  const prev = document.getElementById('photoPreviewEl');
  const initials = name.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();
  prev.innerHTML = `<span style="font-family:var(--font-head);font-size:2rem;color:var(--text-3);">${escHtml(initials)}</span>`;
  document.getElementById('photoSaveBtn').disabled = true;
  document.getElementById('photoFileInput').value  = '';
  document.getElementById('photoUploadModal').classList.add('open');
};

window.previewProfilePhoto = function(event) {
  const file = event.target.files[0];
  if (!file) return;
  if (file.size > 2*1024*1024) { showToast('Photo must be under 2 MB.', true); return; }
  const reader = new FileReader();
  reader.onload = e => {
    window._pendingPhotoData = e.target.result;
    const prev = document.getElementById('photoPreviewEl');
    prev.innerHTML = `<img src="${e.target.result}" style="width:120px;height:120px;object-fit:cover;border-radius:18px;">`;
    document.getElementById('photoSaveBtn').disabled = false;
  };
  reader.readAsDataURL(file);
};

window.saveProfilePhoto = async function() {
  const uid  = window._pendingPhotoUID;
  const data = window._pendingPhotoData;
  if (!uid || !data) return;
  const btn = document.getElementById('photoSaveBtn');
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...'; btn.disabled = true;
  try {
    const empSnap = await getDocs(query(collection(db,'hrm_employees'),where('uid','==',uid)));
    if (!empSnap.empty) {
      await setDoc(doc(db,'hrm_employees',empSnap.docs[0].id), {photoURL:data}, {merge:true});
    }
    await setDoc(doc(db,'hrm_users',uid), {photoURL:data}, {merge:true});
    document.getElementById('photoUploadModal').classList.remove('open');
    showToast('Profile photo updated!');
    // Reload portal
    const ud = await getDoc(doc(db,'hrm_users',uid));
    renderEmployeePortal(window.hrmCurrentUser, ud.data());
  } catch(err) { showToast('Error: '+err.message, true); }
  finally { btn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Save Photo'; btn.disabled = false; }
};

// ─── MONTHLY REPORT HELPERS ───
function calcDurationMinutes(checkIn, checkOut) {
  if (!checkIn || !checkOut) return 0;
  const [ih,im,is_=0] = checkIn.split(':').map(Number);
  const [oh,om,os_=0] = checkOut.split(':').map(Number);
  return ((oh*3600+om*60+os_) - (ih*3600+im*60+is_)) / 60;
}

function getDatesInMonth(ym) { // ym = "YYYY-MM"
  const [y,m] = ym.split('-').map(Number);
  const days = new Date(y,m,0).getDate();
  return Array.from({length:days},(_,i)=>`${ym}-${String(i+1).padStart(2,'0')}`);
}

function dateWeekdayName(dateStr) {
  return WEEK_DAYS[(new Date(dateStr+'T00:00:00').getDay()+6)%7]; // getDay(): Sun=0..Sat=6 → shift so Mon=0..Sun=6
}

// Expected minutes an employee should be logged in for on a given date, based on
// the tuition schedules of the clients assigned to them — minus any client-side
// leave for that date, minus any *approved* session-wise regularization for that
// specific client+date (which excuses just that session, not the whole day).
// Per-user assignment on a given client, normalized to a consistent shape:
//   regular            : follows the client's normal weekly tuitionDays schedule
//   supplementaryDates : extra one-off dates this person covers, on top of (or
//                        instead of) their regular days — e.g. a substitute session
//   pausedDates        : dates this person is specifically excused from — e.g.
//                        someone else covered their regular session that day
// Reads both the current {regular,supplementaryDates,pausedDates} shape and the
// older {type,dates} shape (from before staff could be both regular AND
// supplementary at once) for backward compatibility with existing client docs.
function getClientAssignmentType(client, uid) {
  const meta = client?.assignmentMeta?.[uid];
  if (!meta) return {regular:true, supplementaryDates:[], pausedDates:[]};
  if (meta.regular === undefined && meta.supplementaryDates === undefined && meta.type !== undefined) {
    // legacy shape
    return {
      regular: meta.type !== 'supplementary',
      supplementaryDates: meta.type === 'supplementary' ? (meta.dates||[]) : [],
      pausedDates: []
    };
  }
  return {
    regular: meta.regular !== false,
    supplementaryDates: meta.supplementaryDates || [],
    pausedDates: meta.pausedDates || []
  };
}
function computeExpectedMinutesForDate(dateStr, assignedClients, clientLeaveKeys, approvedRegKeys, uid, clientReductionMap) {
  clientReductionMap = clientReductionMap || new Map();
  const weekday = dateWeekdayName(dateStr);
  let minutes = 0;
  const sessions = [];
  assignedClients.forEach(c => {
    if (c.startDate && dateStr < c.startDate) return; // client hadn't started yet — no session expected
    const at = getClientAssignmentType(c, uid);
    if (at.pausedDates.includes(dateStr)) return; // this person specifically excused today (e.g. someone else covered) — nothing expected, not even shown as a session
    const sched = (c.tuitionDays||[]).find(d => d.day === weekday);
    const isRegularDay = at.regular && !!sched;
    const isSupplementaryDay = at.supplementaryDates.includes(dateStr);
    if (!isRegularDay && !isSupplementaryDay) return; // nothing expected from this person today
    const fullHours = sched ? sched.hours : 1; // fall back to 1h for a supplementary date outside the client's normal weekday schedule
    // Parent (or admin) can shorten a specific session instead of cancelling it — the
    // employee's attendance for that date+client is then measured against the reduced
    // time rather than the usual scheduled duration.
    const reducedHours = clientReductionMap.get(c.id+'_'+dateStr);
    const reduced = reducedHours !== undefined && reducedHours < fullHours;
    const hours = reduced ? reducedHours : fullHours;
    const supplementary = !isRegularDay && isSupplementaryDay;
    const leaveKey = c.id+'_'+dateStr;
    const regKey = c.id+'_'+dateStr;
    if (clientLeaveKeys.has(leaveKey)) { sessions.push({clientId:c.id, studentName:c.studentName, hours, excused:'leave', supplementary, reduced, fullHours}); return; }
    if (approvedRegKeys.has(regKey)) { sessions.push({clientId:c.id, studentName:c.studentName, hours, excused:'regularized', supplementary, regHours: approvedRegKeys.get(regKey), reduced, fullHours}); return; }
    minutes += hours * 60;
    sessions.push({clientId:c.id, studentName:c.studentName, hours, excused:null, supplementary, reduced, fullHours});
  });
  return {minutes, sessions};
}

function isWorkingDay(dateStr) {
  // Fallback rule (Sundays off) — used only for staff with zero client assignments.
  return new Date(dateStr + 'T00:00:00').getDay() !== 0;
}

async function buildMonthReport(uid, empDocId, ym) {
  // Attendance records — grouped by date+clientId (per-session) and, separately,
  // any flat/no-client records (for staff with no assigned clients).
  const attSnap = await getDocs(query(collection(db,'hrm_attendance'),where('empUID','==',uid)));
  const attByDateClient = {};
  const attByDateFlat = {};
  attSnap.docs.forEach(d=>{
    const r = d.data();
    if (r.clientId) attByDateClient[r.date+'_'+r.clientId] = r;
    else attByDateFlat[r.date] = r;
  });

  // Clients assigned to this employee — each carries its own tuition-day schedule
  let assignedClients = [];
  try {
    const clientSnap = await getDocs(query(collection(db,'clients'),where('assignedUserIds','array-contains',uid)));
    assignedClients = clientSnap.docs.map(d=>({id:d.id,...d.data()}));
  } catch(e) { console.error('assigned clients load (report)', e); }

  const allDates = getDatesInMonth(ym);
  const today = todayISO();
  let presentDays=0, absentDays=0, workingDaysCount=0;

  // ── Staff with no client assignments: fall back to the simple flat rule
  // (≥9 hrs on any non-Sunday day = Present) since there's no schedule to
  // measure against.
  if (assignedClients.length === 0) {
    const dayRows = allDates.map(date=>{
      if (date > today) return null;
      if (!isWorkingDay(date)) return {date, mins:0, expectedMins:0, sessions:[], status:'noWork', checkIn:'', checkOut:''};
      const att = attByDateFlat[date];
      const mins = att ? calcDurationMinutes(att.checkIn, att.checkOut) : 0;
      workingDaysCount++;
      let status;
      if (mins >= 540) { status = 'present'; presentDays++; }
      else if (att && att.checkIn) { status = 'short'; absentDays++; }
      else { status = 'absent'; absentDays++; }
      return {date, mins, expectedMins:540, sessions:[], status, checkIn:att?.checkIn||'', checkOut:att?.checkOut||''};
    }).filter(Boolean);
    return {dayRows, presentDays, absentDays, workingDays: workingDaysCount};
  }

  // Client-submitted leave days (parent portal) — zero out that client's
  // expected hours for that date, same as a day outside the tuition schedule.
  let clientLeaveKeys = new Set();
  try {
    const clientIds = assignedClients.map(c=>c.id);
    if (clientIds.length) {
      const leaveSnap = await getDocs(collection(db,'hrm_client_leaves'));
      leaveSnap.docs.forEach(d=>{
        const l = d.data();
        if (clientIds.includes(l.clientId) && l.date >= ym+'-01' && l.date <= ym+'-31') {
          clientLeaveKeys.add(l.clientId+'_'+l.date);
        }
      });
    }
  } catch(e) { console.error('client leaves load', e); }

  // Reduced-hours overrides (parent or admin shortened a specific session instead
  // of cancelling it) — the employee's attendance for that date+client is measured
  // against the reduced duration instead of the client's normal scheduled hours.
  let clientReductionMap = new Map();
  try {
    const clientIds = assignedClients.map(c=>c.id);
    if (clientIds.length) {
      const reductionSnap = await getDocs(collection(db,'hrm_client_reductions'));
      reductionSnap.docs.forEach(d=>{
        const r = d.data();
        if (clientIds.includes(r.clientId) && r.date >= ym+'-01' && r.date <= ym+'-31') {
          clientReductionMap.set(r.clientId+'_'+r.date, Number(r.hours)||0);
        }
      });
    }
  } catch(e) { console.error('client reductions load', e); }

  // Session-wise regularizations, approved only — excuses just that one client's
  // session on that date rather than the whole day, crediting the admin/employee-
  // approved number of hours toward that session (which may be less than the full
  // scheduled duration, in which case it still shows as Short).
  let approvedRegKeys = new Map();
  try {
    const regSnap = await getDocs(query(collection(db,'hrm_regularizations'),where('empUID','==',uid),where('status','==','approved')));
    regSnap.docs.forEach(d=>{
      const r = d.data();
      if (r.clientId && r.date) approvedRegKeys.set(r.clientId+'_'+r.date, Number(r.hours)||0);
    });
  } catch(e) { console.error('regularizations load', e); }

  // ── Real per-client session comparison: each scheduled, non-excused client
  // session that day must individually meet its own scheduled duration.
  const dayRows = allDates.map(date=>{
    if (date > today) return null; // future
    const {sessions} = computeExpectedMinutesForDate(date, assignedClients, clientLeaveKeys, approvedRegKeys, uid, clientReductionMap);
    // Client-wide leave truly needs nothing from the employee; an approved
    // regularization still counts as a required session, credited with its
    // approved hours instead of a logged check-in/check-out.
    const required = sessions.filter(s => s.excused !== 'leave');
    // Nothing scheduled at all that day (e.g. no client has a session on this
    // weekday, or every assigned client hadn't started yet) → explicit "No Work"
    // row, shown but not counted toward working/present/absent.
    if (!sessions.length) return {date, mins:0, expectedMins:0, sessions:[], status:'noWork', checkIn:'', checkOut:''};

    let expectedMins = 0, mins = 0;
    const annotated = sessions.map(s => {
      if (s.excused === 'leave') return {...s, met:true, loggedMins:0};
      if (s.excused === 'regularized') {
        const loggedMins = Math.round((s.regHours||0)*60);
        expectedMins += s.hours*60;
        mins += loggedMins;
        return {...s, met: loggedMins >= s.hours*60, loggedMins};
      }
      const att = attByDateClient[date+'_'+s.clientId];
      const sessMins = att ? calcDurationMinutes(att.checkIn, att.checkOut) : 0;
      expectedMins += s.hours*60;
      mins += sessMins;
      return {...s, met: sessMins >= s.hours*60, loggedMins: sessMins, checkIn: att?.checkIn||'', checkOut: att?.checkOut||''};
    });

    // Every session that day was excused as client leave → also a "No Work"
    // day: nothing was actually required of the employee.
    if (required.length === 0) return {date, mins:0, expectedMins:0, sessions: annotated, status:'noWork', checkIn:'', checkOut:''};
    workingDaysCount++;
    const allMet = annotated.filter(s=>s.excused!=='leave').every(s=>s.met);
    const anyLogged = annotated.some(s=>s.excused!=='leave' && s.loggedMins > 0);
    let status;
    if (allMet) { status = 'present'; presentDays++; }
    else if (anyLogged) { status = 'short'; absentDays++; }
    else { status = 'absent'; absentDays++; }

    return {date, mins, expectedMins, sessions: annotated, status, checkIn:'', checkOut:''};
  }).filter(Boolean);

  return {dayRows, presentDays, absentDays, workingDays: workingDaysCount};
}

function renderReportCard(emp, report, ym, includeRegBtn=false, empDocId='') {
  const {presentDays,absentDays,workingDays} = report;
  const monthlyCTC = Math.round((emp.salary||0)/12);
  const dailyRate  = Math.round(monthlyCTC/26);
  const deduction  = Math.round(dailyRate * absentDays);
  const netPay     = Math.max(0, monthlyCTC - deduction);
  const initials   = emp.name.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();
  // Serialize slip data safely for onclick
  const slipEmp = {uid:emp.uid||'',name:emp.name,employeeId:emp.employeeId||'',title:emp.title||'',email:emp.email||'',phone:emp.phone||'',dateOfHiring:emp.dateOfHiring||'',pan:emp.pan||'',bankName:emp.bankName||'',bankAccount:emp.bankAccount||'',ifsc:emp.ifsc||'',bankHolder:emp.bankHolder||'',salary:emp.salary||0,photoURL:emp.photoURL||''};
  const slipRpt = {presentDays,absentDays,workingDays,monthlyCTC,dailyRate,deduction,netPay};
  const slipKey = 'slip_'+emp.uid+'_'+ym;
  window[slipKey] = {emp:slipEmp, report:slipRpt, ym};

  return `<div class="report-card">
    <div class="report-card-head">
      <div class="report-card-avatar">
        ${emp.photoURL ? `<img src="${escHtml(emp.photoURL)}" alt="">` : initials}
      </div>
      <div style="min-width:0;flex:1;">
        <div class="report-card-name">${escHtml(emp.name)}</div>
        <div class="report-card-meta">${escHtml(emp.employeeId||'')} · ${escHtml(emp.title||'')} · ${ym}</div>
      </div>
      <div style="display:flex;gap:.4rem;flex-shrink:0;flex-wrap:wrap;align-items:center;">
               ${includeRegBtn ? `<button class="mini-btn" style="color:#fff;border-color:rgba(255,255,255,.3);background:rgba(255,255,255,.1);" onclick="openRegModal('${empDocId}','${emp.uid}')"><i class="fa-solid fa-clock-rotate-left"></i> Regularize</button>` : ''}
      </div>
    </div>
    <div class="report-card-body">
      <div class="report-stat"><div class="report-stat-label">Working Days</div><div class="report-stat-value">${workingDays}</div></div>
      <div class="report-stat"><div class="report-stat-label">Present</div><div class="report-stat-value" style="color:var(--success);">${presentDays}</div></div>
      <div class="report-stat"><div class="report-stat-label">Absent</div><div class="report-stat-value" style="color:var(--error);">${absentDays}</div></div>
      <div class="report-stat"><div class="report-stat-label">Deduction</div><div class="report-stat-value" style="color:var(--error);">${formatCurrency(deduction)}</div></div>
      <div class="report-stat"><div class="report-stat-label">Annual CTC</div><div class="report-stat-value">${formatCurrency(emp.salary||0)}</div></div>
      <div class="report-stat"><div class="report-stat-label">Monthly CTC</div><div class="report-stat-value">${formatCurrency(monthlyCTC)}</div></div>
      <div class="report-stat"><div class="report-stat-label">Net Payable</div><div class="report-stat-value" style="color:var(--success);">${formatCurrency(netPay)}</div></div>
    </div>
    <div class="report-card-bank">
      <span><strong>Bank</strong>${escHtml(emp.bankName||'—')}</span>
      <span><strong>Account</strong>${emp.bankAccount ? '••••'+escHtml(emp.bankAccount.slice(-4)) : '—'}</span>
      <span><strong>IFSC</strong>${escHtml(emp.ifsc||'—')}</span>
      <span><strong>Holder</strong>${escHtml(emp.bankHolder||'—')}</span>
    </div>
  </div>`;
}

// ─── EMPLOYEE: MY MONTHLY REPORT ───
window.loadMyMonthlyReport = async function(uid, empDocId) {
  const wrap = document.getElementById('empReportWrap');
  if (!wrap) return;
  const ym = document.getElementById('empReportMonth')?.value || new Date().toISOString().slice(0,7);
  wrap.innerHTML = `<div class="empty"><h3><i class="fa-solid fa-spinner fa-spin"></i> Building report...</h3></div>`;
  try {
    const empSnap = await getDocs(query(collection(db,'hrm_employees'),where('uid','==',uid)));
    if (empSnap.empty) { wrap.innerHTML='<div class="empty"><h3>No record found.</h3></div>'; return; }
    const emp = {id:empSnap.docs[0].id,...empSnap.docs[0].data()};
    const report = await buildMonthReport(uid, empDocId, ym);
    const {dayRows} = report;

    wrap.innerHTML = `
      ${renderReportCard(emp, report, ym)}
      <div class="card panel" style="margin-top:1rem;">
        <div class="panel-head">
          <div><h2>Day-wise Breakdown</h2><p>Expected hours are the sum of that day's scheduled client sessions.</p></div>
          <button class="btn btn-gold" onclick="openRegModal('${empDocId}','${uid}')"><i class="fa-solid fa-clock-rotate-left"></i> Apply Regularization</button>
        </div>
        <div class="table-wrap">
          <table><thead><tr><th>Date</th><th>Sessions</th><th>Logged</th><th>Expected</th><th>Status</th></tr></thead>
          <tbody>
            ${dayRows.map(r=>{
              const hrs  = r.mins > 0 ? `${Math.floor(r.mins/60)}h ${r.mins%60}m` : '—';
              const expHrs = r.status==='noWork' ? '—' : `${Math.floor(r.expectedMins/60)}h ${r.expectedMins%60}m`;
              const stMap = {present:'<span class="pill pill-present">Present</span>',absent:'<span class="pill pill-absent">Absent</span>',short:'<span class="pill pill-pending">Short Hours</span>',noWork:'<span class="pill pill-nowork">No Work</span>'};
              const sessionsHtml = (r.sessions||[]).map(s => {
                const reducedTag = s.reduced ? ` <span class="pill pill-pending" style="font-size:.65rem;" title="Normally ${s.fullHours}h">reduced from ${s.fullHours}h</span>` : '';
                if (s.excused === 'leave') return `<div>${escHtml(s.studentName)} — ${s.hours}h <span class="pill pill-checkedin" style="font-size:.65rem;">leave</span>${reducedTag}</div>`;
                if (s.excused === 'regularized') return `<div>${escHtml(s.studentName)} — ${s.hours}h scheduled, ${(s.regHours||0)}h regularized ${s.met?'<span class="pill pill-present" style="font-size:.65rem;">met</span>':'<span class="pill pill-absent" style="font-size:.65rem;">short</span>'}${reducedTag}</div>`;
                const timeTxt = s.checkIn ? `${escHtml(s.checkIn)}${s.checkOut?'–'+escHtml(s.checkOut):' (in progress)'}` : 'not checked in';
                return `<div>${escHtml(s.studentName)} — ${s.hours}h scheduled, ${timeTxt} ${s.met?'<span class="pill pill-present" style="font-size:.65rem;">met</span>':'<span class="pill pill-absent" style="font-size:.65rem;">short</span>'}${reducedTag}</div>`;
              }).join('') || '—';
              return `<tr><td>${escHtml(r.date)}</td><td style="font-size:.78rem;max-width:280px;">${sessionsHtml}</td><td>${hrs}</td><td>${expHrs}</td><td>${stMap[r.status]||r.status}</td></tr>`;
            }).join('')}
          </tbody></table>
        </div>
      </div>`;
  } catch(err) { wrap.innerHTML=`<div class="empty"><h3>Error: ${escHtml(err.message)}</h3></div>`; }
};

// ─── ADMIN: MONTHLY REPORT ───
window.loadMonthlyReport = async function() {
  const wrap = document.getElementById('monthlyReportWrap');
  if (!wrap) return;
  const ym = document.getElementById('reportMonth')?.value || new Date().toISOString().slice(0,7);
  const empFilter = document.getElementById('reportEmpFilter')?.value || 'all';

  // Populate filter
  const fe = document.getElementById('reportEmpFilter');
  if (fe) {
    const cur = fe.value;
    fe.innerHTML = `<option value="all">All Employees</option>` +
      window.hrmEmployees.map(e=>`<option value="${escHtml(e.uid)}">${escHtml(e.name)}</option>`).join('');
    fe.value = cur;
  }

  let emps = window.hrmEmployees.filter(e=>e.status==='active');
  if (empFilter !== 'all') emps = emps.filter(e=>e.uid===empFilter);
  if (!emps.length) { wrap.innerHTML=`<div class="empty"><h3>No active employees.</h3></div>`; return; }

  wrap.innerHTML = `<div class="empty"><h3><i class="fa-solid fa-spinner fa-spin"></i> Building reports for ${emps.length} employee(s)...</h3></div>`;
  window._lastReportData = [];
  try {
    const cards = await Promise.all(emps.map(async emp => {
      const r = await buildMonthReport(emp.uid, 'emp_'+emp.uid, ym);
      window._lastReportData.push({emp, report:r});
      return renderReportCard(emp, r, ym, true, 'emp_'+emp.uid);
    }));
    wrap.innerHTML = `<div class="report-grid">${cards.join('')}</div>`;
  } catch(err) { wrap.innerHTML=`<div class="empty"><h3>Error: ${escHtml(err.message)}</h3></div>`; }
};

window.exportMonthlyReport = function() {
  if (!window._lastReportData?.length) { showToast('Generate a report first.', true); return; }
  const rows = window._lastReportData.map(({emp,report})=>{
    const m = Math.round((emp.salary||0)/12);
    const d = Math.round(m/26);
    return {
      'Name': emp.name, 'Employee ID': emp.employeeId||'', 'Title': emp.title||'',
      'Working Days': 26,
      'Present': report.presentDays,
      'Absent': report.absentDays,
      'Annual CTC': emp.salary||0,
      'Monthly CTC': m,
      'Deduction': Math.round(d*report.absentDays),
      'Net Payable': Math.max(0, m - Math.round(d*report.absentDays)),
      'Bank Name': emp.bankName||'', 'Account': emp.bankAccount||'',
      'IFSC': emp.ifsc||'', 'Account Holder': emp.bankHolder||''
    };
  });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Monthly Report');
  XLSX.writeFile(wb, `HRM_Monthly_Report_${document.getElementById('reportMonth')?.value||''}.xlsx`);
  showToast('Report exported!');
};

// ─── REGULARIZATION ───
window.openRegModal = async function(empDocId, uid) {
  document.getElementById('regEmpDocId').value = empDocId;
  window._regEmpUID = uid;
  document.getElementById('regDate').value = '';
  document.getElementById('regHours').value = '';
  document.getElementById('regReason').value = '';
  document.querySelectorAll('input[name="regType"]').forEach(r => r.checked = r.value === 'regular');
  document.getElementById('regDateWrap').style.display = 'block';
  document.getElementById('regDate').required = true;
  document.getElementById('regSupWrap').style.display = 'none';
  document.getElementById('regSupSession').required = false;
  document.getElementById('regSupSession').innerHTML = `<option value="" disabled selected>Select client first…</option>`;
  const sel = document.getElementById('regClient');
  sel.innerHTML = `<option value="" disabled selected>Loading clients…</option>`;
  document.getElementById('regRequestModal').classList.add('open');
  try {
    const clientSnap = await getDocs(query(collection(db,'clients'),where('assignedUserIds','array-contains',uid)));
    const clients = clientSnap.docs.map(d=>({id:d.id,...d.data()}));
    window._regClients = clients;
    sel.innerHTML = clients.length
      ? `<option value="" disabled selected>Select client…</option>` + clients.map(c=>{
          const at = getClientAssignmentType(c,uid);
          const tag = at.supplementaryDates.length ? (at.regular ? ' (+Supplementary)' : ' (Supplementary)') : '';
          return `<option value="${c.id}" data-name="${escHtml(c.studentName)}">${escHtml(c.clientNumber)} — ${escHtml(c.studentName)}${tag}</option>`;
        }).join('')
      : `<option value="" disabled selected>No clients assigned to you</option>`;
  } catch(e) { sel.innerHTML = `<option value="" disabled selected>Could not load clients</option>`; }
};

window.onRegTypeChange = function() {
  const type = document.querySelector('input[name="regType"]:checked')?.value;
  const dateWrap = document.getElementById('regDateWrap');
  const supWrap = document.getElementById('regSupWrap');
  const dateInput = document.getElementById('regDate');
  const supSelect = document.getElementById('regSupSession');
  if (type === 'supplementary') {
    dateWrap.style.display = 'none'; dateInput.required = false; dateInput.value = '';
    supWrap.style.display = 'block'; supSelect.required = true;
    loadRegSupplementarySessions();
  } else {
    dateWrap.style.display = 'block'; dateInput.required = true;
    supWrap.style.display = 'none'; supSelect.required = false;
  }
};
window.onRegClientChange = function() {
  const type = document.querySelector('input[name="regType"]:checked')?.value;
  if (type === 'supplementary') loadRegSupplementarySessions();
  suggestRegHours();
};
// Prefills the Hours field from the client's scheduled duration for that
// weekday, as a convenient starting point — the admin/employee can still
// change it to whatever number of hours is actually being regularized.
// (A plain hoisted function declaration — not window.suggestRegHours = ... —
// so it's safe to reference from the addEventListener calls below regardless
// of source order.)
function suggestRegHours() {
  const hoursInput = document.getElementById('regHours');
  if (!hoursInput || hoursInput.value) return; // don't clobber a value already entered
  const type = document.querySelector('input[name="regType"]:checked')?.value;
  const clientId = document.getElementById('regClient').value;
  const client = (window._regClients||[]).find(c=>c.id===clientId);
  if (!client) return;
  const date = type === 'supplementary' ? document.getElementById('regSupSession').value : document.getElementById('regDate').value;
  if (!date) return;
  const weekday = dateWeekdayName(date);
  const sched = (client.tuitionDays||[]).find(d=>d.day===weekday);
  hoursInput.value = sched ? sched.hours : 1;
}
document.getElementById('regDate')?.addEventListener('change', suggestRegHours);
document.getElementById('regSupSession')?.addEventListener('change', suggestRegHours);

// Lists this employee's supplementary session dates for the selected client that
// are currently marked absent (no logged check-in, and not already pending/approved
// as a regularization) — so they can pick the exact session rather than typing a date.
window.loadRegSupplementarySessions = async function() {
  const sel = document.getElementById('regSupSession');
  const clientId = document.getElementById('regClient').value;
  const uid = window._regEmpUID;
  if (!sel) return;
  if (!clientId || !uid) { sel.innerHTML = `<option value="" disabled selected>Select client first…</option>`; return; }
  sel.innerHTML = `<option value="" disabled selected>Loading sessions…</option>`;
  try {
    const client = (window._regClients||[]).find(c=>c.id===clientId);
    const dates = getClientAssignmentType(client||{}, uid).supplementaryDates;
    const today = todayISO();
    const pastDates = dates.filter(d => d <= today);
    if (!pastDates.length) { sel.innerHTML = `<option value="" disabled selected>No supplementary sessions assigned yet</option>`; return; }
    const attSnap = await getDocs(query(collection(db,'hrm_attendance'),where('empUID','==',uid),where('clientId','==',clientId)));
    const attByDate = {};
    attSnap.docs.forEach(d => { const r=d.data(); attByDate[r.date]=r; });
    const regSnap = await getDocs(query(collection(db,'hrm_regularizations'),where('empUID','==',uid),where('clientId','==',clientId)));
    const regByDate = {};
    regSnap.docs.forEach(d => { const r=d.data(); if (r.status !== 'rejected') regByDate[r.date] = r.status; });
    const absentDates = pastDates.filter(d => {
      const att = attByDate[d];
      if (att && att.checkIn) return false; // already attended/checked in
      if (regByDate[d]) return false; // already pending or approved
      return true;
    });
    sel.innerHTML = absentDates.length
      ? `<option value="" disabled selected>Select a session…</option>` + absentDates.map(d=>`<option value="${d}">${new Date(d+'T00:00:00').toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'})}</option>`).join('')
      : `<option value="" disabled selected>No absent supplementary sessions to regularize</option>`;
  } catch(e) { sel.innerHTML = `<option value="" disabled selected>Could not load sessions</option>`; }
};

document.getElementById('regRequestForm').addEventListener('submit', async ev => {
  ev.preventDefault();
  const btn = document.getElementById('regSubmitBtn');
  btn.innerHTML='<i class="fa-solid fa-spinner fa-spin"></i> Submitting...'; btn.disabled=true;
  const empDocId = document.getElementById('regEmpDocId').value;
  const uid      = window._regEmpUID;
  const regType  = document.querySelector('input[name="regType"]:checked')?.value || 'regular';
  const date     = regType === 'supplementary' ? document.getElementById('regSupSession').value : document.getElementById('regDate').value;
  const hours    = Number(document.getElementById('regHours').value);
  const reason   = document.getElementById('regReason').value.trim();
  const clientSel = document.getElementById('regClient');
  const clientId  = clientSel.value;
  const clientLabel = clientSel.options[clientSel.selectedIndex]?.dataset.name || '';
  if (!date) { showToast(regType==='supplementary' ? 'Select a supplementary session.' : 'Select a date.', true); btn.innerHTML='<i class="fa-solid fa-paper-plane"></i> Submit'; btn.disabled=false; return; }
  if (!hours || hours <= 0) { showToast('Enter the number of hours to regularize.', true); btn.innerHTML='<i class="fa-solid fa-paper-plane"></i> Submit'; btn.disabled=false; return; }
  try {
    const empSnap = await getDocs(query(collection(db,'hrm_employees'),where('uid','==',uid)));
    const empName = empSnap.empty ? '' : empSnap.docs[0].data().name;
    await setDoc(doc(db,'hrm_regularizations','reg_'+uid+'_'+clientId+'_'+date), {
      empUID:uid, empDocId, empName, date, hours, reason, clientId, clientLabel, regType,
      status:'pending', submittedAt:new Date().toISOString()
    });
    document.getElementById('regRequestModal').classList.remove('open');
    showToast('Regularization request submitted!');
    // refresh badge if admin
    initRegBadge();
  } catch(err) { showToast('Error: '+err.message, true); }
  finally { btn.innerHTML='<i class="fa-solid fa-paper-plane"></i> Submit'; btn.disabled=false; }
});

window.loadRegularizations = async function() {
  const wrap = document.getElementById('regTableWrap');
  if (!wrap) return;
  wrap.innerHTML=`<div class="empty"><h3><i class="fa-solid fa-spinner fa-spin"></i> Loading...</h3></div>`;
  const sf = document.getElementById('regFilterStatus').value;
  try {
    const snap = await getDocs(collection(db,'hrm_regularizations'));
    let reqs = snap.docs.map(d=>({id:d.id,...d.data()}));
    if (sf !== 'all') reqs = reqs.filter(r=>r.status===sf);
    reqs.sort((a,b)=>(b.submittedAt||'').localeCompare(a.submittedAt||''));
    const pending = snap.docs.filter(d=>d.data().status==='pending').length;
    const badge = document.getElementById('regBadge');
    if (badge) { badge.textContent=pending; badge.style.display=pending?'inline':'none'; }
    if (!reqs.length) { wrap.innerHTML=`<div class="empty"><div class="empty-icon">🕐</div><h3>No regularization requests.</h3></div>`; return; }
    wrap.innerHTML = `<table><thead><tr><th>Employee</th><th>Client / Session</th><th>Type</th><th>Date</th><th>Hours</th><th>Reason</th><th>Submitted</th><th>Status</th><th>Actions</th></tr></thead><tbody>
      ${reqs.map(r=>`<tr>
        <td><strong>${escHtml(r.empName||'')}</strong></td>
        <td>${escHtml(r.clientLabel||'—')}</td>
        <td>${r.regType==='supplementary'?'<span class="pill pill-pending">Supplementary</span>':'<span class="pill pill-checkedin">Regular</span>'}</td>
        <td>${escHtml(r.date)}</td>
        <td style="white-space:nowrap;">${r.hours!=null?`${r.hours}h`:'<span style="color:var(--text-3);">—</span>'} <button class="btn-icon" title="Edit hours" onclick="editRegHours('${r.id}',${r.hours!=null?r.hours:0})"><i class="fa-solid fa-pen" style="font-size:.7rem;"></i></button></td>
        <td style="font-size:.8rem;max-width:220px;">${escHtml(r.reason||'—')}</td>
        <td style="font-size:.74rem;">${r.submittedAt?new Date(r.submittedAt).toLocaleDateString('en-IN'):'—'}</td>
        <td><span class="pill pill-${r.status||'pending'}">${r.status||'pending'}</span></td>
        <td style="display:flex;gap:.3rem;flex-wrap:wrap;">
          ${r.status==='pending'?`
            <button class="mini-btn mini-btn-success" onclick="actionReg('${r.id}','approved')">✓ Approve</button>
            <button class="mini-btn mini-btn-danger" onclick="actionReg('${r.id}','rejected')">✕ Reject</button>
          `:''}
        </td>
      </tr>`).join('')}
    </tbody></table>`;
  } catch(err) { wrap.innerHTML=`<div class="empty"><h3>Error: ${escHtml(err.message)}</h3></div>`; }
};

document.getElementById('regFilterStatus').addEventListener('change', loadRegularizations);

window.actionReg = async function(regId, action) {
  try {
    await setDoc(doc(db,'hrm_regularizations',regId), {status:action, actionedAt:new Date().toISOString()}, {merge:true});
    // No attendance record is synthesized here — an approved regularization simply
    // excuses that one client's expected hours for that date (see
    // computeExpectedMinutesForDate), which buildMonthReport picks up live.
    showToast(`Regularization ${action}!`);
    loadRegularizations();
  } catch(err) { showToast('Error: '+err.message, true); }
};

// Admin override for the number of hours credited by a regularization — usable
// on pending or already-approved requests. Since approved regularizations
// directly affect attendance/present-day calculations (see buildMonthReport),
// this lets the admin correct the figure without rejecting and resubmitting.
window.editRegHours = async function(regId, currentHours) {
  const val = prompt('Number of hours to regularize:', currentHours || '');
  if (val === null) return;
  const hours = Number(val);
  if (!val.trim() || isNaN(hours) || hours < 0) { showToast('Enter a valid non-negative number of hours.', true); return; }
  try {
    await setDoc(doc(db,'hrm_regularizations',regId), {hours}, {merge:true});
    showToast('Hours updated.');
    loadRegularizations();
  } catch(err) { showToast('Error: '+err.message, true); }
};

async function initRegBadge() {
  try {
    const snap = await getDocs(collection(db,'hrm_regularizations'));
    const cnt = snap.docs.filter(d=>d.data().status==='pending').length;
    const badge = document.getElementById('regBadge');
    if (badge) { badge.textContent=cnt; badge.style.display=cnt?'inline':'none'; }
  } catch(e){}
}




function fmtINR(n) {
  // Safe Indian number format without rupee symbol (avoids font encoding issues)
  const num = Math.round(Number(n)||0);
  const s = num.toLocaleString('en-IN');
  return 'Rs. ' + s;
}

window.downloadSalarySlip = async function(slipKey) {
  const data = window[slipKey];
  if (!data) { showToast('Report data not found. Please regenerate the report.', true); return; }
  const {emp, report, ym} = data;
  const {presentDays, absentDays, workingDays,
         monthlyCTC, dailyRate, deduction} = report;

  const {jsPDF} = window.jspdf;
  const pdf = new jsPDF({orientation:'portrait', unit:'mm', format:'a4'});
  const W = 210, M = 14;
  let y = 0;

  // Colours
  const NAVY  = [10, 22, 40];
  const GOLD  = [193, 154, 60];
  const WHITE = [255,255,255];
  const LGRAY = [248,248,246];
  const GRAY  = [110,110,120];
  const RED   = [190,55,55];

  // ── HEADER ──────────────────────────────────────────────
  pdf.setFillColor(...NAVY);
  pdf.rect(0, 0, W, 42, 'F');

  // Logo (embedded base64)
  try {
    pdf.addImage(COMPANY_LOGO_B64, 'PNG', M, 4, 32, 32);
  } catch(e) {
    pdf.setFillColor(...GOLD);
    pdf.roundedRect(M, 5, 26, 26, 3, 3, 'F');
    pdf.setFontSize(10); pdf.setTextColor(...NAVY); pdf.setFont('helvetica','bold');
    pdf.text('SJ', M+13, 21, {align:'center'});
  }

  // Company name right of logo
  pdf.setFontSize(17); pdf.setTextColor(...WHITE); pdf.setFont('helvetica','bold');
  pdf.text('Sattva Jnana', M+36, 16);
  pdf.setFontSize(8); pdf.setTextColor(...GOLD); pdf.setFont('helvetica','normal');
  pdf.text('Human Resource Management', M+36, 22);

  // SALARY SLIP badge
  pdf.setFillColor(...GOLD);
  pdf.roundedRect(W-M-38, 10, 38, 12, 2, 2, 'F');
  pdf.setFontSize(9.5); pdf.setTextColor(...NAVY); pdf.setFont('helvetica','bold');
  pdf.text('SALARY SLIP', W-M-19, 18, {align:'center'});

  // Pay period
  const [ymY, ymM] = ym.split('-').map(Number);
  const monthName = new Date(ymY, ymM-1, 1).toLocaleString('en-IN',{month:'long',year:'numeric'});
  pdf.setFontSize(7.5); pdf.setTextColor(170,165,140); pdf.setFont('helvetica','normal');
  pdf.text('Pay Period: ' + monthName, W-M, 30, {align:'right'});

  // Gold rule
  pdf.setDrawColor(...GOLD); pdf.setLineWidth(0.7);
  pdf.line(M, 42, W-M, 42);
  y = 48;

  // ── EMPLOYEE INFO ────────────────────────────────────────
  const infoH = 30;
  pdf.setFillColor(...LGRAY);
  pdf.roundedRect(M, y, W-M*2, infoH, 2.5, 2.5, 'F');
  pdf.setDrawColor(215,212,205); pdf.setLineWidth(0.3);
  pdf.roundedRect(M, y, W-M*2, infoH, 2.5, 2.5, 'S');

  // Profile photo
  let textX = M+5;
  if (emp.photoURL && emp.photoURL.startsWith('data:')) {
    try {
      pdf.addImage(emp.photoURL, 'JPEG', M+4, y+4, 20, 20);
      textX = M+28;
    } catch(e) {}
  }

  pdf.setFontSize(12); pdf.setTextColor(...NAVY); pdf.setFont('helvetica','bold');
  pdf.text(emp.name, textX, y+9);
  pdf.setFontSize(8.5); pdf.setTextColor(...GRAY); pdf.setFont('helvetica','normal');
  pdf.text(emp.title||'', textX, y+15);

  // Left column info
  const leftInfo = [
    ['Emp ID',  emp.employeeId||'—'],
    ['Email',   emp.email||'—'],
    ['Phone',   emp.phone||'—'],
  ];
  // Right column info
  const rightInfo = [
    ['Joining Date', emp.dateOfHiring||'—'],
    ['PAN',          emp.pan||'—'],
  ];
  const midX = W/2 + 5;

  leftInfo.forEach((item, i) => {
    const iy = y + 20 + i * 4.5;
    pdf.setFontSize(7); pdf.setTextColor(...GRAY); pdf.setFont('helvetica','normal');
    pdf.text(item[0] + ': ', textX, iy);
    pdf.setTextColor(...NAVY); pdf.setFont('helvetica','bold');
    const labelW = pdf.getTextWidth(item[0] + ': ');
    pdf.text(item[1], textX + labelW, iy);
  });

  rightInfo.forEach((item, i) => {
    const iy = y + 20 + i * 4.5;
    pdf.setFontSize(7); pdf.setTextColor(...GRAY); pdf.setFont('helvetica','normal');
    pdf.text(item[0] + ': ', midX, iy);
    pdf.setTextColor(...NAVY); pdf.setFont('helvetica','bold');
    const labelW = pdf.getTextWidth(item[0] + ': ');
    pdf.text(item[1], midX + labelW, iy);
  });

  y += infoH + 6;

  // ── SALARY BREAKDOWN ─────────────────────────────────────
  const basic     = Math.round(monthlyCTC * 0.40);
  const hra       = Math.round(monthlyCTC * 0.20);
  const transport = Math.round(monthlyCTC * 0.10);
  const special   = monthlyCTC - basic - hra - transport;
  const grossEarn = monthlyCTC; // same as sum
  const pf        = Math.round(basic * 0.12);
  const esi       = monthlyCTC <= 21000 ? Math.round(monthlyCTC * 0.0075) : 0;
  const totalDed  = deduction + pf + esi;
  const finalNet  = Math.max(0, grossEarn - totalDed);

  const halfW = (W - M*2 - 4) / 2;
  const col2  = M + halfW + 4;

  // Section heads
  const secHead = (label, sx, sw, sy) => {
    pdf.setFillColor(...NAVY);
    pdf.roundedRect(sx, sy, sw, 7, 1.5, 1.5, 'F');
    pdf.setFontSize(8); pdf.setTextColor(...WHITE); pdf.setFont('helvetica','bold');
    pdf.text(label, sx + 4, sy + 5);
  };
  secHead('EARNINGS', M, halfW, y);
  secHead('DEDUCTIONS', col2, halfW, y);
  y += 8;

  const RH = 7;
  const drawRows = (rows, sx, sw, sy) => {
    rows.forEach((row, i) => {
      pdf.setFillColor(i%2===0 ? 248 : 255, i%2===0 ? 248 : 255, i%2===0 ? 246 : 255);
      pdf.rect(sx, sy + i*RH, sw, RH, 'F');
      pdf.setFontSize(7.5); pdf.setTextColor(...NAVY); pdf.setFont('helvetica','normal');
      pdf.text(row[0], sx + 3, sy + i*RH + 4.8);
      pdf.setFont('helvetica','bold');
      pdf.text(fmtINR(row[1]), sx + sw - 3, sy + i*RH + 4.8, {align:'right'});
      pdf.setFont('helvetica','normal');
    });
    return sy + rows.length * RH;
  };

  const earnRows = [
    ['Basic Salary',         basic],
    ['House Rent Allowance', hra],
    ['Transport Allowance',  transport],
    ['Special Allowance',    special],
  ];
  const dedRows = [
    ['Absent Deduction',       deduction],
    ...(esi > 0 ? [['ESI (0.75%)',           esi]] : []),
  ];

  const earnEnd = drawRows(earnRows, M,    halfW, y);
  const dedEnd  = drawRows(dedRows,  col2, halfW, y);
  const tblEnd  = Math.max(earnEnd, dedEnd);

  // Totals
  pdf.setFillColor(...NAVY);
  pdf.rect(M, tblEnd, halfW, RH, 'F');
  pdf.setFontSize(8); pdf.setTextColor(...WHITE); pdf.setFont('helvetica','bold');
  pdf.text('Gross Earnings', M+3, tblEnd+4.8);
  pdf.text(fmtINR(grossEarn), M+halfW-3, tblEnd+4.8, {align:'right'});

  pdf.setFillColor(...RED);
  pdf.rect(col2, tblEnd, halfW, RH, 'F');
  pdf.text('Total Deductions', col2+3, tblEnd+4.8);
  pdf.text(fmtINR(totalDed), col2+halfW-3, tblEnd+4.8, {align:'right'});

  y = tblEnd + RH + 6;

  // ── NET PAY ──────────────────────────────────────────────
  pdf.setFillColor(...GOLD);
  pdf.roundedRect(M, y, W-M*2, 13, 2, 2, 'F');
  pdf.setFontSize(9.5); pdf.setTextColor(...NAVY); pdf.setFont('helvetica','bold');
  pdf.text('NET PAY FOR ' + monthName.toUpperCase(), M+5, y+8.5);
  pdf.setFontSize(13);
  pdf.text(fmtINR(finalNet), W-M-5, y+8.5, {align:'right'});
  y += 19;

  // ── ATTENDANCE SUMMARY ────────────────────────────────────
  secHead('ATTENDANCE SUMMARY', M, W-M*2, y);
  y += 8;
  const attCols = [
    ['Working Days', String(workingDays)],
    ['Present',      String(presentDays)],
    ['Absent',       String(absentDays)],
    ['Daily Rate',   fmtINR(dailyRate)],
  ];
  const acw = (W - M*2) / attCols.length;
  attCols.forEach((col, i) => {
    const ax = M + i*acw;
    pdf.setFillColor(i%2===0?246:255, i%2===0?246:255, i%2===0?244:255);
    pdf.rect(ax, y, acw, 15, 'F');
    pdf.setFontSize(6); pdf.setTextColor(...GRAY); pdf.setFont('helvetica','normal');
    pdf.text(col[0], ax + acw/2, y+5.5, {align:'center'});
    pdf.setFontSize(9); pdf.setTextColor(...NAVY); pdf.setFont('helvetica','bold');
    pdf.text(col[1], ax + acw/2, y+12, {align:'center'});
  });
  y += 21;

  // ── BANK DETAILS ──────────────────────────────────────────
  secHead('BANK DETAILS', M, W-M*2, y);
  y += 8;
  const bankItems = [
    ['Bank Name',       emp.bankName||'—'],
    ['Account Number',  emp.bankAccount ? '••••' + emp.bankAccount.slice(-4) : '—'],
    ['IFSC Code',       emp.ifsc||'—'],
    ['Account Holder',  emp.bankHolder||emp.name],
  ];
  bankItems.forEach((item, i) => {
    pdf.setFillColor(i%2===0?248:255, i%2===0?248:255, i%2===0?246:255);
    pdf.rect(M, y+i*7, W-M*2, 7, 'F');
    pdf.setFontSize(7.5); pdf.setTextColor(...GRAY); pdf.setFont('helvetica','normal');
    pdf.text(item[0], M+4, y+i*7+4.8);
    pdf.setTextColor(...NAVY); pdf.setFont('helvetica','bold');
    pdf.text(item[1], W-M-4, y+i*7+4.8, {align:'right'});
  });
  y += bankItems.length * 7 + 6;

  // ── FOOTER ───────────────────────────────────────────────
  pdf.setFillColor(...NAVY);
  pdf.rect(0, 284, W, 13, 'F');
  pdf.setFontSize(7); pdf.setTextColor(...GOLD); pdf.setFont('helvetica','bold');
  pdf.text('Sattva Jnana  |  Human Resources', M, 292);
  pdf.setTextColor(165,162,140); pdf.setFont('helvetica','normal');
  pdf.text('Computer-generated slip — no signature required.', W/2, 292, {align:'center'});
  pdf.text('Generated: ' + new Date().toLocaleDateString('en-IN'), W-M, 292, {align:'right'});

  const fileName = 'SalarySlip_' + emp.name.replace(/\s+/g,'_') + '_' + ym + '.pdf';
  pdf.save(fileName);
  showToast('Salary slip downloaded!');
};

// ─── SALARY SLIPS ───────────────────────────────────────────────────────────

window._pendingSlipBase64 = null;

window.onSlipFileChosen = function(event) {
  const file = event.target.files[0];
  if (!file) return;
  if (file.size > 5*1024*1024) { showToast('File exceeds 5 MB.', true); return; }
  const reader = new FileReader();
  reader.onload = e => {
    window._pendingSlipBase64 = e.target.result;
    document.getElementById('slipFileLabel').textContent = file.name;
  };
  reader.readAsDataURL(file);
}

window.openUploadSlipModal = function() {
  // Populate employee dropdown
  const sel = document.getElementById('slipEmpSelect');
  sel.innerHTML = '<option value="">— Select Employee —</option>' +
    window.hrmEmployees.filter(e=>e.status==='active')
      .map(e=>`<option value="${escHtml(e.uid)}">${escHtml(e.name)} (${escHtml(e.employeeId||'')})</option>`).join('');
  document.getElementById('slipPayMonth').value = new Date().toISOString().slice(0,7);
  document.getElementById('slipFileLabel').textContent = 'Click to attach PDF (max 5 MB)';
  document.getElementById('slipNote').value = '';
  window._pendingSlipBase64 = null;
  document.getElementById('uploadSlipModal').classList.add('open');
};

document.getElementById('uploadSlipForm').addEventListener('submit', async ev => {
  ev.preventDefault();
  await submitSlipUpload(
    document.getElementById('slipEmpSelect').value,
    document.getElementById('slipPayMonth').value,
    document.getElementById('slipNote').value.trim(),
    window._pendingSlipBase64,
    document.getElementById('slipUploadBtn'),
    document.getElementById('slipUploadProgress'),
    () => { document.getElementById('uploadSlipModal').classList.remove('open'); loadAdminSlips(); }
  );
});

async function submitSlipUpload(empUID, payMonth, note, base64Data, btn, progressEl, onDone) {
  if (!empUID)    { showToast('Select an employee.', true); return; }
  if (!payMonth)  { showToast('Select a pay month.', true); return; }
  if (!base64Data){ showToast('Attach a PDF file.', true); return; }
  const origLabel = btn.innerHTML;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Uploading...'; btn.disabled = true;
  progressEl.innerHTML = `<div class="upload-progress"><div class="upload-progress-bar" style="width:60%"></div></div>`;
  try {
    const empSnap = await getDocs(query(collection(db,'hrm_employees'),where('uid','==',empUID)));
    const empName = empSnap.empty ? '' : empSnap.docs[0].data().name;
    const slipId  = 'slip_'+empUID+'_'+payMonth.replace('-','')+'_'+Date.now();
    await setDoc(doc(db,'hrm_salary_slips',slipId), {
      empUID, empName, payMonth, note, base64Data,
      uploadedBy: window.hrmCurrentUser?.uid || 'hr',
      uploadedAt: new Date().toISOString()
    });
    progressEl.innerHTML = '';
    showToast(`Salary slip uploaded for ${empName}!`);
    onDone();
  } catch(err) {
    progressEl.innerHTML = '';
    showToast('Upload error: '+err.message, true);
  } finally {
    btn.innerHTML = origLabel; btn.disabled = false;
  }
}

window.loadAdminSlips = async function() {
  const wrap = document.getElementById('slipsTableWrap');
  if (!wrap) return;
  wrap.innerHTML = `<div class="empty"><h3><i class="fa-solid fa-spinner fa-spin"></i> Loading...</h3></div>`;

  // Populate filter
  const ef = document.getElementById('slipEmpFilter');
  if (ef) {
    const cur = ef.value;
    ef.innerHTML = '<option value="all">All Employees</option>' +
      window.hrmEmployees.map(e=>`<option value="${escHtml(e.uid)}">${escHtml(e.name)}</option>`).join('');
    ef.value = cur;
  }
  const empF   = document.getElementById('slipEmpFilter')?.value   || 'all';
  const monthF = document.getElementById('slipMonthFilter')?.value || '';

  try {
    const snap = await getDocs(collection(db,'hrm_salary_slips'));
    let slips = snap.docs.map(d=>({id:d.id,...d.data()}));
    if (empF   !== 'all') slips = slips.filter(s=>s.empUID===empF);
    if (monthF)           slips = slips.filter(s=>s.payMonth===monthF);
    slips.sort((a,b)=>(b.uploadedAt||'').localeCompare(a.uploadedAt||''));
    if (!slips.length) { wrap.innerHTML=`<div class="empty"><div class="empty-icon">📄</div><h3>No salary slips found.</h3></div>`; return; }
    wrap.innerHTML = `<div class="table-wrap" style="border:none;"><table>
      <thead><tr><th>Employee</th><th>Pay Month</th><th>Note</th><th>Uploaded</th><th>Actions</th></tr></thead>
      <tbody>${slips.map(s=>`<tr>
        <td><strong>${escHtml(s.empName||'')}</strong></td>
        <td><span class="pill pill-active" style="font-size:.72rem;">${escHtml(s.payMonth||'')}</span></td>
        <td style="font-size:.8rem;">${escHtml(s.note||'—')}</td>
        <td style="font-size:.75rem;">${s.uploadedAt?new Date(s.uploadedAt).toLocaleDateString('en-IN'):'—'}</td>
        <td style="display:flex;gap:.3rem;">
          <button class="mini-btn" onclick="previewAdminSlip('${s.id}')"><i class="fa-solid fa-eye"></i> View</button>
          <button class="mini-btn mini-btn-danger" onclick="deleteAdminSlip('${s.id}')"><i class="fa-solid fa-trash"></i></button>
        </td>
      </tr>`).join('')}</tbody>
    </table></div>`;
  } catch(err) { wrap.innerHTML=`<div class="empty"><h3>Error: ${escHtml(err.message)}</h3></div>`; }
};

['slipEmpFilter','slipMonthFilter'].forEach(id=>{
  const el = document.getElementById(id);
  if (el) el.addEventListener('change', loadAdminSlips);
});

window.previewAdminSlip = async function(slipId) {
  try {
    const snap = await getDoc(doc(db,'hrm_salary_slips',slipId));
    if (!snap.exists()) return;
    const s = snap.data();
    const win = window.open('','_blank');
    win.document.write(`<html><body style="margin:0"><embed src="${s.base64Data}" type="application/pdf" width="100%" height="100%"></body></html>`);
  } catch(err) { showToast('Error: '+err.message, true); }
};

window.deleteAdminSlip = async function(slipId) {
  if (!confirm('Delete this salary slip permanently?')) return;
  try {
    await deleteDoc(doc(db,'hrm_salary_slips',slipId));
    showToast('Salary slip deleted.');
    loadAdminSlips();
  } catch(err) { showToast('Error: '+err.message, true); }
};

// Employee: view own salary slips
window.loadMySlips = async function(uid) {
  const wrap = document.getElementById('empSlipsWrap');
  if (!wrap) return;
  try {
    const snap = await getDocs(query(collection(db,'hrm_salary_slips'),where('empUID','==',uid)));
    const slips = snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(b.payMonth||'').localeCompare(a.payMonth||''));
    if (!slips.length) { wrap.innerHTML=`<div class="empty" style="border:none;"><div class="empty-icon">📄</div><h3>No salary slips uploaded yet.</h3></div>`; return; }
    wrap.innerHTML = `<table><thead><tr><th>Pay Month</th><th>Note</th><th>Uploaded On</th><th>Action</th></tr></thead><tbody>
      ${slips.map(s=>`<tr>
        <td><strong>${escHtml(s.payMonth||'')}</strong></td>
        <td style="font-size:.82rem;">${escHtml(s.note||'—')}</td>
        <td style="font-size:.76rem;">${s.uploadedAt?new Date(s.uploadedAt).toLocaleDateString('en-IN'):'—'}</td>
        <td><button class="mini-btn mini-btn-success" onclick="downloadMySlip('${s.id}','${escHtml(s.payMonth||'')}')"><i class="fa-solid fa-download"></i> Download PDF</button></td>
      </tr>`).join('')}
    </tbody></table>`;
  } catch(err) { wrap.innerHTML=`<div class="empty"><h3>Error loading slips.</h3></div>`; }
};

window.downloadMySlip = async function(slipId, payMonth) {
  try {
    const snap = await getDoc(doc(db,'hrm_salary_slips',slipId));
    if (!snap.exists()) { showToast('Slip not found.', true); return; }
    const s = snap.data();
    // Trigger download
    const a = document.createElement('a');
    a.href = s.base64Data;
    a.download = `SalarySlip_${payMonth}.pdf`;
    a.click();
    showToast('Downloading salary slip...');
  } catch(err) { showToast('Error: '+err.message, true); }
};

// ─── HR TEAM ────────────────────────────────────────────────────────────────

window.openCreateHRModal = function() {
  document.getElementById('createHRForm').reset();
  document.getElementById('createHRModal').classList.add('open');
  prefillNextEmployeeId('hrEmpId');
};

document.getElementById('createHRForm').addEventListener('submit', async ev => {
  ev.preventDefault();
  const btn = document.getElementById('createHRBtn');
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Creating...'; btn.disabled = true;
  const name  = document.getElementById('hrName').value.trim();
  const empId = document.getElementById('hrEmpId').value.trim();
  const email = document.getElementById('hrEmail').value.trim();
  const pass  = document.getElementById('hrPassword').value;
  try {
    const cred = await createUserWithEmailAndPassword(secondaryAuth, email, pass);
    await signOut(secondaryAuth);
    const uid = cred.user.uid;
    await setDoc(doc(db,'hrm_users',uid), {
      uid, name, employeeId:empId, email, role:'hr', status:'active',
      createdAt: new Date().toISOString()
    });
    await setDoc(doc(db,'hrm_hr_team',uid), {
      uid, name, employeeId:empId, email, status:'active',
      createdAt: new Date().toISOString()
    });
    document.getElementById('createHRModal').classList.remove('open');
    showToast(`HR member "${name}" created!`);
    loadHRTeam();
  } catch(err) { showToast('Error: '+err.message, true); }
  finally { btn.innerHTML = '<i class="fa-solid fa-user-plus"></i> Create HR Login'; btn.disabled = false; }
});

window.loadHRTeam = async function() {
  const wrap = document.getElementById('hrTeamTableWrap');
  if (!wrap) return;
  wrap.innerHTML = `<div class="empty"><h3><i class="fa-solid fa-spinner fa-spin"></i> Loading...</h3></div>`;
  try {
    const snap = await getDocs(collection(db,'hrm_hr_team'));
    const members = snap.docs.map(d=>({id:d.id,...d.data()}));
    window._hrTeamMembers = members;
    if (!members.length) { wrap.innerHTML=`<div class="empty"><div class="empty-icon">👤</div><h3>No HR members yet.</h3></div>`; return; }
    wrap.innerHTML = `<table><thead><tr><th>Name</th><th>Employee ID</th><th>Email</th><th>Status</th><th>Created</th><th>Actions</th></tr></thead>
      <tbody>${members.map(m=>`<tr>
        <td><strong>${escHtml(m.name||'')}</strong></td>
        <td style="font-size:.78rem;">${escHtml(m.employeeId||'—')}</td>
        <td style="font-size:.78rem;">${escHtml(m.email||'')}</td>
        <td><span class="pill pill-${m.status==='active'?'active':'inactive'}">${escHtml(m.status||'active')}</span></td>
        <td style="font-size:.75rem;">${m.createdAt?new Date(m.createdAt).toLocaleDateString('en-IN'):'—'}</td>
        <td><button class="mini-btn mini-btn-danger" onclick="removeHRMember('${m.id}')"><i class="fa-solid fa-user-minus"></i> Remove</button></td>
      </tr>`).join('')}
    </tbody></table>`;
  } catch(err) { wrap.innerHTML=`<div class="empty"><h3>Error: ${escHtml(err.message)}</h3></div>`; }
};

window.removeHRMember = async function(docId) {
  if (!confirm('Remove this HR member? They will no longer be able to log in.')) return;
  try {
    await deleteDoc(doc(db,'hrm_hr_team',docId));
    await setDoc(doc(db,'hrm_users',docId), {status:'inactive'}, {merge:true});
    showToast('HR member removed.');
    loadHRTeam();
  } catch(err) { showToast('Error: '+err.message, true); }
};

// ─── HR PORTAL ──────────────────────────────────────────────────────────────

window._hrCurrentUser = null;

async function launchHRPortal(user) {hideBootSplash();
  window._hrCurrentUser = user;
  // Load all active employees
  const empSnap = await getDocs(query(collection(db,'hrm_employees'),where('status','==','active')));
  const emps = empSnap.docs.map(d=>({id:d.id,...d.data()}));
  window._hrEmps = emps;

  const hrSel = document.getElementById('hrSlipEmpSelect');
  hrSel.innerHTML = '<option value="">— Select Employee —</option>' +
    emps.map(e=>`<option value="${escHtml(e.uid)}">${escHtml(e.name)} (${escHtml(e.employeeId||'')})</option>`).join('');
  const ym = new Date().toISOString().slice(0,7);
  document.getElementById('hrSlipPayMonth').value = ym;
const lp = document.getElementById('hrListPayMonth');
  if (lp) lp.value = ym;
  const bp = document.getElementById('hrBulkPayMonth');
  if (bp) bp.value = ym;

  document.getElementById('hrPortalScreen').style.display = 'flex';
  document.getElementById('loginScreen').style.display = 'none';
  renderHREmployeeList();
  loadHRSlipsList();

  document.getElementById('hrLogoutBtn').onclick = async () => {
    await signOut(auth);
    document.getElementById('hrPortalScreen').style.display = 'none';
    document.getElementById('loginScreen').style.display = 'flex';
  };
}

// Render the active-employee list (list view, searchable, drag-drop targets)
window.renderHREmployeeList = function() {
  const wrap = document.getElementById('hrEmpListWrap');
  if (!wrap) return;
  let emps = window._hrEmps || [];
  const q = (document.getElementById('hrEmpSearch')?.value || '').trim().toLowerCase();
  if (q) emps = emps.filter(e => [e.name,e.employeeId,e.email,e.title].join(' ').toLowerCase().includes(q));
  if (!emps.length) { wrap.innerHTML = `<div class="empty"><div class="empty-icon">👥</div><h3>No active employees found.</h3></div>`; return; }
  wrap.innerHTML = emps.map(e => {
    const initials = (e.name||'?').split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();
    const avatar = e.photoURL
      ? `<img class="emp-avatar-photo" src="${escHtml(e.photoURL)}" alt="">`
      : `<div class="emp-avatar">${initials}</div>`;
    const safeName = escHtml(e.name||'').replace(/'/g,"&#39;");
    return `<div class="hr-emp-row" data-uid="${escHtml(e.uid)}"
        ondragover="hrEmpDragOver(event,this)" ondragleave="hrEmpDragLeave(event,this)"
        ondrop="hrEmpDrop(event,'${escHtml(e.uid)}','${safeName}')"
        style="display:flex;align-items:center;gap:.8rem;padding:.7rem .9rem;border:1px solid var(--border);border-radius:var(--r-md);background:var(--surface);margin-bottom:.5rem;transition:border-color .15s,background .15s;">
      ${avatar}
      <div style="min-width:0;flex:1;">
        <div style="font-family:var(--font-head);font-size:.95rem;color:var(--ink);">${escHtml(e.name||'')}</div>
        <div style="font-size:.74rem;color:var(--text-3);">${escHtml(e.employeeId||'—')} · ${escHtml(e.title||'')}</div>
      </div>
      <div class="hr-drop-hint" style="font-size:.72rem;color:var(--warn);font-weight:600;display:none;"><i class="fa-solid fa-arrow-down"></i> Drop PDF to upload</div>
      <label style="display:inline-flex;align-items:center;gap:.4rem;padding:.45rem .9rem;border-radius:var(--r-pill);background:var(--gold);color:var(--ink-strong);font-weight:700;font-size:.78rem;cursor:pointer;white-space:nowrap;flex-shrink:0;" onmouseover="this.style.filter='brightness(1.08)'" onmouseout="this.style.filter=''">
        <i class="fa-solid fa-paperclip"></i> Attach PDF
        <input type="file" accept=".pdf" style="display:none" onchange="hrEmpFilePick(event,'${escHtml(e.uid)}','${safeName}')">
      </label>
    </div>`;
  }).join('');
};

window.hrEmpDragOver = function(e, el) {
  e.preventDefault();
  el.style.borderColor = 'var(--gold)';
  el.style.background = 'var(--gold-soft)';
  const hint = el.querySelector('.hr-drop-hint'); if (hint) hint.style.display = 'block';
};
window.hrEmpDragLeave = function(e, el) {
  el.style.borderColor = 'var(--border)';
  el.style.background = 'var(--surface)';
  const hint = el.querySelector('.hr-drop-hint'); if (hint) hint.style.display = 'none';
};
window.hrEmpDrop = function(e, uid, name) {
  e.preventDefault();
  const el = e.currentTarget;
  if (el) {
    el.style.borderColor = 'var(--border)';
    el.style.background = 'var(--surface)';
    const hint = el.querySelector('.hr-drop-hint'); if (hint) hint.style.display = 'none';
  }
  const files = e.dataTransfer?.files;
  if (!files || !files.length) return;
  hrUploadSlipForEmp(uid, name, files[0]);
};
window.hrEmpFilePick = function(e, uid, name) {
  const file = e.target.files[0];
  if (file) hrUploadSlipForEmp(uid, name, file);
  e.target.value = '';
};

async function hrUploadSlipForEmp(empUID, empName, file) {
  if (file.type !== 'application/pdf') { showToast('Please use a PDF file.', true); return; }
  if (file.size > 5*1024*1024) { showToast('File exceeds 5 MB.', true); return; }
  const payMonth = document.getElementById('hrListPayMonth')?.value;
  if (!payMonth) { showToast('Select a Pay Month first.', true); return; }
  showToast(`Uploading slip for ${empName}...`);
  try {
    const base64Data = await fileToBase64(file);
    const slipId = 'slip_'+empUID+'_'+payMonth.replace('-','')+'_'+Date.now();
    await setDoc(doc(db,'hrm_salary_slips',slipId), {
      empUID, empName, payMonth, note: file.name, base64Data,
      uploadedBy: window.hrmCurrentUser?.uid || 'hr',
      uploadedAt: new Date().toISOString()
    });
    showToast(`Salary slip uploaded for ${empName} (${payMonth})!`);
    loadHRSlipsList();
  } catch(err) { showToast('Upload error: '+err.message, true); }
}
window._pendingHRSlipBase64 = null;

window.onHRSlipFileChosen = function(event) {
  const file = event.target.files[0];
  if (!file) return;
  if (file.size > 5*1024*1024) { showToast('File exceeds 5 MB.', true); return; }
  const reader = new FileReader();
  reader.onload = e => {
    window._pendingHRSlipBase64 = e.target.result;
    document.getElementById('hrSlipFileLabel').textContent = file.name;
  };
  reader.readAsDataURL(file);
};

document.getElementById('hrSlipForm').addEventListener('submit', async ev => {
  ev.preventDefault();
  await submitSlipUpload(
    document.getElementById('hrSlipEmpSelect').value,
    document.getElementById('hrSlipPayMonth').value,
    document.getElementById('hrSlipNote').value.trim(),
    window._pendingHRSlipBase64,
    document.getElementById('hrSlipUploadBtn'),
    document.getElementById('hrSlipProgress'),
    () => {
      document.getElementById('hrSlipForm').reset();
      document.getElementById('hrSlipFileLabel').textContent = 'Click to attach PDF (max 5 MB)';
      window._pendingHRSlipBase64 = null;
      loadHRSlipsList();
    }
  );
});

window.loadHRSlipsList = async function() {
  const wrap = document.getElementById('hrSlipsListWrap');
  if (!wrap) return;
  try {
    const snap = await getDocs(collection(db,'hrm_salary_slips'));
    const slips = snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(b.uploadedAt||'').localeCompare(a.uploadedAt||'')).slice(0,50);
    if (!slips.length) { wrap.innerHTML=`<div class="empty" style="border:none;"><h3>No slips uploaded yet.</h3></div>`; return; }
    wrap.innerHTML = `<table><thead><tr><th>Employee</th><th>Pay Month</th><th>Note</th><th>Uploaded</th><th>Action</th></tr></thead><tbody>
      ${slips.map(s=>`<tr>
        <td><strong>${escHtml(s.empName||'')}</strong></td>
        <td><span class="pill pill-active" style="font-size:.72rem;">${escHtml(s.payMonth||'')}</span></td>
        <td style="font-size:.8rem;">${escHtml(s.note||'—')}</td>
        <td style="font-size:.76rem;">${s.uploadedAt?new Date(s.uploadedAt).toLocaleDateString('en-IN'):'—'}</td>
        <td><button class="mini-btn" onclick="previewAdminSlip('${s.id}')"><i class="fa-solid fa-eye"></i> View</button></td>
      </tr>`).join('')}
    </tbody></table>`;
  } catch(err) { wrap.innerHTML=`<div class="empty"><h3>Error loading slips.</h3></div>`; }
};

// ─── INIT ───
showAdminPage('dashboard');
// Set default month pickers to current month
(function(){
  const ym = new Date().toISOString().slice(0,7);
  const r = document.getElementById('reportMonth');
  if (r) r.value = ym;
})();
// ─── HR: TAB SWITCHER ────────────────────────────────────────────
window.hrSwitchTab = function(name, btn) {
  ['slips','addEmp'].forEach(t => {
    const panel = document.getElementById('hrTabPanel-'+t);
    const tab   = document.getElementById('hrTab-'+t);
    if (panel) panel.style.display = 'none';
    if (tab) {
      tab.style.background    = 'transparent';
      tab.style.color         = 'rgba(255,255,255,.55)';
      tab.style.borderBottom  = '2px solid transparent';
    }
  });
  const active = document.getElementById('hrTabPanel-'+name);
  if (active) active.style.display = 'block';
  if (btn) {
    btn.style.background   = 'rgba(201,168,76,.2)';
    btn.style.color        = '#E2BC5E';
    btn.style.borderBottom = '2px solid #E2BC5E';
  }
  if (name === 'addEmp') { populateHRManagerDropdown(); prefillNextEmployeeId('hrEmpIdField'); }
};

// ─── HR: POPULATE MANAGER DROPDOWN ──────────────────────────────
async function populateHRManagerDropdown() {
  const sel = document.getElementById('hrEmpManagerAssign');
  if (!sel) return;
  const managers = (window._hrEmps || []).filter(e => e.role === 'manager');
  sel.innerHTML = '<option value="">— No Manager —</option>' +
    managers.map(m => `<option value="${escHtml(m.uid)}">${escHtml(m.name)} (${escHtml(m.employeeId||'')})</option>`).join('');
}

// ─── HR: ADD EMPLOYEE FORM SUBMIT ────────────────────────────────
document.getElementById('hrAddEmpForm').addEventListener('submit', async e => {
  e.preventDefault();
  const btn = document.getElementById('hrAddEmpBtn');
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Creating...';
  btn.disabled = true;

  const email = document.getElementById('hrEmpLoginEmail').value.trim();
  const pass  = document.getElementById('hrEmpLoginPass').value;
  const name  = document.getElementById('hrEmpName').value.trim();
  const empId = document.getElementById('hrEmpIdField').value.trim();
  const role  = document.getElementById('hrEmpRole').value;
  const salaryType = document.getElementById('hrEmpSalaryType').value;
  const salaryInput = Number(document.getElementById('hrEmpSalary').value||0);
  const annualSalary = salaryType === 'monthly' ? salaryInput * 12 : salaryInput;

  try {
    const cred = await createUserWithEmailAndPassword(secondaryAuth, email, pass);
    await signOut(secondaryAuth);
    const uid = cred.user.uid;

    const empData = {
      uid, name, employeeId: empId,
      phone:       document.getElementById('hrEmpPhone').value.trim(),
      gender:      document.getElementById('hrEmpGender').value,
      dateOfHiring:document.getElementById('hrEmpDOH').value,
      title:       document.getElementById('hrEmpTitle').value.trim(),
      role,
      employmentType: document.getElementById('hrEmpEmploymentType').value,
      salary:      annualSalary, // always stored as annual CTC — reports/payroll math elsewhere assume this
      salaryType, salaryInput,
      managerId:   document.getElementById('hrEmpManagerAssign').value || null,
      pan:         document.getElementById('hrEmpPan').value.trim().toUpperCase(),
      aadhaar:     document.getElementById('hrEmpAadhaar').value.trim(),
      bankAccount: document.getElementById('hrEmpBankAcc').value.trim(),
      ifsc:        document.getElementById('hrEmpIFSC').value.trim().toUpperCase(),
      bankName:    document.getElementById('hrEmpBankName').value.trim(),
      bankHolder:  document.getElementById('hrEmpBankHolder').value.trim(),
      pfOptIn:     document.getElementById('hrEmpPfOptIn').checked,
      uan:         document.getElementById('hrEmpPfOptIn').checked ? document.getElementById('hrEmpUAN').value.trim() : '',
      email,
      status:      'active',
      createdAt:   new Date().toISOString()
    };

    const docId = 'emp_' + uid;
    await setDoc(doc(db, 'hrm_employees', docId), empData);
    await setDoc(doc(db, 'hrm_users', uid), {
      role, name, email, status: 'active',
      managerId: empData.managerId
    });

    document.getElementById('hrAddEmpForm').reset();
    updateSalaryLabel('hrEmp');
    document.getElementById('hrEmpUANWrap').style.display = 'none';
    showToast(`Employee "${name}" created successfully!`);

    // Refresh employee list so new emp appears in slip dropdowns
    await loadHREmployees();
    hrSwitchTab('slips', document.getElementById('hrTab-slips'));

  } catch(err) {
    showToast('Error: ' + err.message, true);
  } finally {
    btn.innerHTML = '<i class="fa-solid fa-user-plus"></i> Create Employee';
    btn.disabled = false;
  }
});
