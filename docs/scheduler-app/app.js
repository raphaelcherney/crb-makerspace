// Configuration (update API_BASE_URL after Apps Script deploy)
const CONFIG = {
  API_BASE_URL: 'https://script.google.com/macros/s/AKfycbwa6c7EIpmalSlvZI2D5YKWPo1C83G1OcggtHRv0ZUByr-SJPTdlI7jaerfZE0klBH6/exec', // e.g., 'https://script.google.com/macros/s/XXXXXXXX/exec'
  TIMEZONE: 'America/Chicago',
  PRINTERS: [
    'R2-3D2 (Bambu X1C)',
    'C3DPO (Bambu X1C)',
    'PLA Trooper (Bambu P1S)',
    'Hydra (Prusa XL)'
  ],
  LABS: [
    'Master of Science in Robotics (MSR)', 'Robot Design Studio (RDS)', 'Lynch', 'Colgate', 'Rubenstein',
    'Argall', 'Truby', 'Hartmann', 'MacIver', 'Murphey', 'Peshkin', 'Elwin', 'Umbanhowar', 'Kriegman', 'Other (add to Notes)'
  ],
  MATERIALS: ['PLA', 'TPU', 'PETG', 'PC', 'ABS/ASA', 'Multi-Material', 'Other (add to Notes)']
};

// Utilities
const fmtDateInput = (d) => d.toISOString().slice(0,10);
const pad2 = (n) => String(n).padStart(2,'0');
function minutesSinceMidnight(hhmm){
  const [h,m] = hhmm.split(':').map(Number); return h*60+m;
}
function hhmmFromMinutes(min){
  const h = Math.floor(min/60); const m = min%60; return `${pad2(h)}:${pad2(m)}`;
}
function clampTo30(hhmm){
  const m = minutesSinceMidnight(hhmm); const snapped = Math.round(m/30)*30; return hhmmFromMinutes(snapped);
}

// State
let state = {
  date: fmtDateInput(new Date()),
  reservations: [], // [{printer,start,end}]
  selection: null,  // {printer, startMin, endMin}
  drag: null        // {mode:'creating'|'resize-top'|'resize-bottom', printer, startMin, endMin}
};

// Elements
const timeCol = document.getElementById('timeCol');
const printersWrap = document.getElementById('printers');
const printersHeader = document.getElementById('printersHeader');
const calendarEl = document.getElementById('calendar');
const loadingEl = document.getElementById('loading');
const datePicker = document.getElementById('datePicker');
const prevDayBtn = document.getElementById('prevDay');
const todayBtn = document.getElementById('todayBtn');
const nextDayBtn = document.getElementById('nextDay');

// Dialog elements
const dialog = document.getElementById('reservationDialog');
const form = document.getElementById('reservationForm');
const formError = document.getElementById('formError');
const resPrinter = document.getElementById('resPrinter');
const resDate = document.getElementById('resDate');
const resStart = document.getElementById('resStart');
const resDuration = document.getElementById('resDuration');
const resEndDisplay = document.getElementById('resEndDisplay');
const resName = document.getElementById('resName');
const resContact = document.getElementById('resContact');
const resLab = document.getElementById('resLab');
const resMaterial = document.getElementById('resMaterial');
const resNotes = document.getElementById('resNotes');

// Initialize controls
function initControls(){
  datePicker.value = state.date;
  datePicker.addEventListener('change', ()=>{ state.date = datePicker.value; refresh(); });
  prevDayBtn.addEventListener('click', ()=>{ shiftDate(-1); });
  todayBtn.addEventListener('click', ()=>{ state.date = fmtDateInput(new Date()); datePicker.value = state.date; refresh(); });
  nextDayBtn.addEventListener('click', ()=>{ shiftDate(1); });
}
function shiftDate(delta){
  const d = new Date(state.date); d.setDate(d.getDate()+delta); state.date = fmtDateInput(d); datePicker.value = state.date; refresh();
}

function buildTimeColumn(){
  timeCol.innerHTML = '';
  // Add header spacer to align with printer column headers
  const header = document.createElement('div');
  header.className = 'time-col-header';
  timeCol.appendChild(header);
  // Add slots container
  const slots = document.createElement('div');
  slots.className = 'time-col-slots';
  for(let i=0;i<48;i++){
    const min = i*30; const h = Math.floor(min/60); const m = min%60;
    const el = document.createElement('div'); el.className='time';
    el.textContent = m===0 ? `${pad2(h)}:00` : '';
    slots.appendChild(el);
  }
  timeCol.appendChild(slots);
}

function buildPrinters(){
  printersHeader.innerHTML = '';
  printersWrap.innerHTML = '';
  CONFIG.PRINTERS.forEach(pr => {
    // Header in separate row
    const head = document.createElement('div'); head.className='printer-header'; head.textContent = pr;
    printersHeader.appendChild(head);
    // Column with slots
    const col = document.createElement('div'); col.className='printer-col';
    const slots = document.createElement('div'); slots.className='slots';
    // grid rows for hit targets
    for(let i=0;i<48;i++){
      const s = document.createElement('div'); s.className='slot';
      s.dataset.printer = pr; s.dataset.index = String(i);
      s.addEventListener('click', onSlotClick);
      slots.appendChild(s);
    }
    attachPointerHandlers(slots, pr);
    col.appendChild(slots);
    printersWrap.appendChild(col);
  });
  
  // Sync horizontal scrolling between header and columns
  const calendarRight = printersWrap.parentElement;
  if(calendarRight && calendarRight.classList.contains('calendar-right')){
    // Sync scrolling from columns to header
    calendarRight.addEventListener('scroll', () => {
      printersHeader.scrollLeft = calendarRight.scrollLeft;
    });
    // Sync scrolling from header to columns  
    printersHeader.addEventListener('scroll', () => {
      calendarRight.scrollLeft = printersHeader.scrollLeft;
    });
  }
}

function onSlotClick(e){
  const printer = e.currentTarget.dataset.printer;
  const idx = Number(e.currentTarget.dataset.index);
  const startMin = idx*30; const endMin = startMin+30;
  state.selection = { printer, startMin, endMin };
  openReservationDialog();
}

function renderReservations(){
  // Remove existing blocks
  document.querySelectorAll('.block').forEach(el => el.remove());
  document.querySelectorAll('.selection').forEach(el => el.remove());
  document.querySelectorAll('.current-time').forEach(el => el.remove());

  const today = fmtDateInput(new Date());
  const isToday = state.date === today;
  let currentTimePos = null;
  if(isToday){
    const now = new Date();
    const currentMin = now.getHours() * 60 + now.getMinutes();
    const firstCol = printersWrap.children[0];
    if(firstCol){
      const slots = firstCol.querySelector('.slots');
      if(slots){
        const rowHeight = slots.querySelector('.slot')?.getBoundingClientRect().height || 28;
        currentTimePos = (currentMin / 30) * rowHeight;
      }
    }
  }
  
  // Get row height from time column for alignment
  const timeSlots = timeCol.querySelector('.time-col-slots');
  const timeRowHeight = timeSlots?.querySelector('.time')?.getBoundingClientRect().height || 28;

  // For each printer column, overlay blocks
  CONFIG.PRINTERS.forEach((pr, colIdx) => {
    const col = printersWrap.children[colIdx]; if(!col) return;
    const slots = col.querySelector('.slots');
    const rowHeight = slots.querySelector('.slot')?.getBoundingClientRect().height || 28;
    const blocks = state.reservations.filter(r => r.printer===pr);
    blocks.forEach(r => {
      const top = (minutesSinceMidnight(r.start)/30)*rowHeight;
      const height = ((minutesSinceMidnight(r.end)-minutesSinceMidnight(r.start))/30)*rowHeight;
      const el = document.createElement('div'); el.className='block'; el.style.top = `${top}px`; el.style.height=`${height}px`; el.textContent = 'Reserved';
      slots.appendChild(el);
    });

    if(state.selection && state.selection.printer===pr){
      const top = (state.selection.startMin/30)*rowHeight;
      const height = ((state.selection.endMin-state.selection.startMin)/30)*rowHeight;
      const sel = document.createElement('div'); sel.className='selection'; sel.style.top = `${top}px`; sel.style.height=`${height}px`;
      const hTop = document.createElement('div'); hTop.className='handle top'; hTop.dataset.printer = pr; hTop.addEventListener('pointerdown', (ev)=>startResize(ev, pr, 'resize-top'));
      const hBot = document.createElement('div'); hBot.className='handle bottom'; hBot.dataset.printer = pr; hBot.addEventListener('pointerdown', (ev)=>startResize(ev, pr, 'resize-bottom'));
      sel.appendChild(hTop); sel.appendChild(hBot);
      slots.appendChild(sel);
    }

    // Add current time indicator
    if(isToday && currentTimePos !== null){
      const timeLine = document.createElement('div');
      timeLine.className = 'current-time';
      timeLine.style.top = `${currentTimePos}px`;
      slots.appendChild(timeLine);
    }
  });
}

async function fetchReservations(){
  // Clear existing reservations immediately when fetching new date
  state.reservations = [];
  renderReservations(); // Clear the display immediately
  
  // Show loading indicator
  if(loadingEl) loadingEl.classList.add('active');
  
  if(!CONFIG.API_BASE_URL){ 
    if(loadingEl) loadingEl.classList.remove('active');
    return; 
  }
  const url = `${CONFIG.API_BASE_URL}?action=reservations&date=${encodeURIComponent(state.date)}`;
  try {
    const res = await fetch(url, { method:'GET' });
    if(!res.ok) { 
      console.warn('Fetch reservations failed:', res.status, res.statusText); 
      if(loadingEl) loadingEl.classList.remove('active');
      return; 
    }
    const data = await res.json();
    console.log('Fetched reservations for', state.date, ':', data);
    state.reservations = (data.reservations||[]).map(r => ({ printer:r.printer, start:r.start, end:r.end }));
    console.log('Parsed reservations:', state.reservations);
    renderReservations();
  } catch(err) {
    console.error('Error fetching reservations:', err);
    state.reservations = [];
    renderReservations();
  } finally {
    // Hide loading indicator
    if(loadingEl) loadingEl.classList.remove('active');
  }
}

function calculateEndTime(){
  if(!resStart.value || !resDuration.value) return;
  const startMin = minutesSinceMidnight(resStart.value);
  const durationHours = parseFloat(resDuration.value) || 0.5;
  const durationMin = Math.round(durationHours * 60);
  const endMin = startMin + durationMin;
  const days = Math.floor(endMin / (24*60));
  const endClockMin = endMin % (24*60);
  resEndDisplay.value = hhmmFromMinutes(endClockMin);
  const note = document.getElementById('endMultiDayNote');
  if(note){ note.textContent = days > 0 ? `(+${days} day${days>1?'s':''})` : ''; }
}

function openReservationDialog(){
  // seed select options
  resPrinter.innerHTML = CONFIG.PRINTERS.map(p=>`<option>${p}</option>`).join('');
  resLab.innerHTML = CONFIG.LABS.map(p=>`<option>${p}</option>`).join('');
  resMaterial.innerHTML = CONFIG.MATERIALS.map(p=>`<option>${p}</option>`).join('');

  const sel = state.selection || {printer:CONFIG.PRINTERS[0], startMin:8*60, endMin:8*60+30};
  resPrinter.value = sel.printer;
  resDate.value = state.date;
  resStart.value = hhmmFromMinutes(sel.startMin);
  const durationHours = (sel.endMin - sel.startMin) / 60;
  resDuration.value = durationHours;
  calculateEndTime();
  formError.textContent='';
  if(typeof dialog.showModal === 'function') dialog.showModal();
}

// Update end time display when start or duration changes
resStart.addEventListener('input', calculateEndTime);
resDuration.addEventListener('input', calculateEndTime);

function closeDialog(){
  if(dialog.open) dialog.close();
}

function validateForm(){
  const start = clampTo30(resStart.value);
  resStart.value = start;
  const durationHours = parseFloat(resDuration.value) || 0;
  if(durationHours < 0.5) return 'Duration must be at least 0.5 hours';
  if(durationHours > 168) return 'Duration cannot exceed 168 hours';
  // Ensure duration is in 0.5 hour increments
  if(durationHours % 0.5 !== 0) return 'Duration must be in 30-minute increments';
  
  const startMin = minutesSinceMidnight(start);
  const durationMin = Math.round(durationHours * 60);
  const endMin = startMin + durationMin;
  const end = hhmmFromMinutes(endMin % (24*60));
  
  if(endMin <= startMin) return 'End must be after start';
  
  // client-side overlap hint
  const overlap = state.reservations.some(r => r.printer===resPrinter.value && !(minutesSinceMidnight(end) <= minutesSinceMidnight(r.start) || minutesSinceMidnight(start) >= minutesSinceMidnight(r.end)));
  if(overlap) return 'Overlaps an existing reservation';
  return '';
}

form.addEventListener('submit', async (e)=>{
  e.preventDefault();
  const err = validateForm(); if(err){ formError.textContent = err; return; }
  
  // Calculate end time from start + duration
  const start = resStart.value;
  const durationHours = parseFloat(resDuration.value);
  const startMin = minutesSinceMidnight(start);
  const durationMin = Math.round(durationHours * 60);
  const endAbsMin = startMin + durationMin;
  const end = hhmmFromMinutes(endAbsMin % (24*60));
  const addDays = Math.floor(endAbsMin / (24*60));
  const startDateObj = new Date(resDate.value);
  startDateObj.setDate(startDateObj.getDate() + addDays);
  const endDateStr = fmtDateInput(startDateObj);
  
  const payload = new URLSearchParams({
    action: 'reserve',
    date: resDate.value,
    start: start,
    end: end,
    endDate: endDateStr,
    printer: resPrinter.value,
    name: resName.value,
    contact: resContact.value,
    lab: resLab.value,
    material: resMaterial.value,
    notes: resNotes.value
  });
  if(!CONFIG.API_BASE_URL){ formError.textContent='Backend not configured yet.'; return; }
  const resp = await fetch(CONFIG.API_BASE_URL, {
    method:'POST',
    headers:{ 'Content-Type':'application/x-www-form-urlencoded;charset=UTF-8' },
    body: payload
  });
  if(!resp.ok){ formError.textContent='Failed to reserve. Try again.'; return; }
  const data = await resp.json().catch(()=>({ok:false}));
  if(!data.ok){ formError.textContent = data.error || 'Reservation rejected.'; return; }
  closeDialog();
  await refresh();
});

document.getElementById('cancelBtn').addEventListener('click', (e)=>{ e.preventDefault(); closeDialog(); });

async function refresh(){
  await fetchReservations();
}

function init(){
  // Populate time column and printers
  buildTimeColumn();
  buildPrinters();
  initControls();
  refresh();
  updateStickyOffset();
  window.addEventListener('resize', updateStickyOffset);
  
  // Update current time indicator every minute (only when viewing today)
  setInterval(() => {
    const today = fmtDateInput(new Date());
    if(state.date === today){
      renderReservations();
    }
  }, 60000);
}

// Populate selects at load for accessibility
document.addEventListener('DOMContentLoaded', init);

// Pointer interactions
function updateStickyOffset(){
  const header = document.querySelector('.app-header');
  if(!header) return;
  const h = header.offsetHeight || 56;
  document.documentElement.style.setProperty('--sticky-offset', `${h}px`);
}

function attachPointerHandlers(slotsEl, printer){
  let rect, rowHeight;
  function updateMetrics(){
    rect = slotsEl.getBoundingClientRect();
    const first = slotsEl.querySelector('.slot');
    rowHeight = first ? first.getBoundingClientRect().height : 28;
  }
  function yToMinutes(clientY){
    const y = clientY - rect.top;
    const rows = Math.max(0, Math.min(48, Math.round(y / rowHeight)));
    return rows * 30;
  }
  function onPointerDown(ev){
    if(ev.button !== 0 && ev.pointerType !== 'touch') return;
    updateMetrics();
    slotsEl.setPointerCapture(ev.pointerId);
    const startMin = yToMinutes(ev.clientY);
    const endMin = Math.min(startMin + 30, 24*60);
    state.drag = { mode:'creating', printer, startMin, endMin };
    state.selection = { printer, startMin, endMin };
    renderReservations();
    ev.preventDefault();
  }
  function onPointerMove(ev){
    if(!state.drag || state.drag.printer!==printer) return;
    updateMetrics();
    const cur = yToMinutes(ev.clientY);
    if(state.drag.mode === 'creating'){
      const a = Math.min(state.drag.startMin, cur);
      const b = Math.max(state.drag.startMin, cur);
      state.selection = { printer, startMin:a, endMin: Math.max(a+30, b) };
    } else if(state.drag.mode === 'resize-top' && state.selection){
      const endMin = state.selection.endMin;
      const startMin = Math.min(cur, endMin-30);
      state.selection = { printer, startMin, endMin };
    } else if(state.drag.mode === 'resize-bottom' && state.selection){
      const startMin = state.selection.startMin;
      const endMin = Math.max(cur, startMin+30);
      state.selection = { printer, startMin, endMin };
    }
    renderReservations();
  }
  function onPointerUp(ev){
    if(!state.drag || state.drag.printer!==printer) return;
    try{ slotsEl.releasePointerCapture(ev.pointerId); }catch(e){}
    state.drag = null;
    if(dialog && !dialog.open) openReservationDialog();
  }
  slotsEl.addEventListener('pointerdown', onPointerDown);
  slotsEl.addEventListener('pointermove', onPointerMove);
  slotsEl.addEventListener('pointerup', onPointerUp);
  slotsEl.addEventListener('pointercancel', onPointerUp);
}

function startResize(ev, printer, mode){
  ev.stopPropagation();
  const col = Array.from(printersWrap.children).find(c => c.querySelector('.printer-header')?.textContent === printer);
  const slots = col?.querySelector('.slots');
  if(!slots) return;
  // set drag mode then synthesize a move to the same point
  state.drag = { mode, printer, startMin: state.selection?.startMin || 0, endMin: state.selection?.endMin || 30 };
}


