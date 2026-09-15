(function () {
  const cfg = window.APP_CONFIG;
  const S = window.Store;

  document.title = 'קביעת תור — ' + cfg.businessName;
  document.getElementById('page-title').textContent = 'קביעת תור אצל ' + cfg.businessName;
  document.getElementById('page-subtitle').textContent = 'בחרו שירות, תאריך ושעה, ומלאו את הפרטים';

  const serviceEl = document.getElementById('service');
  const dateEl = document.getElementById('date');
  const slotsEl = document.getElementById('slots');
  const noSlotsEl = document.getElementById('no-slots');
  const nameEl = document.getElementById('name');
  const phoneEl = document.getElementById('phone');
  const noteEl = document.getElementById('note');
  const errorEl = document.getElementById('form-error');
  const submitBtn = document.getElementById('submit-btn');
  const bookingCard = document.getElementById('booking-card');
  const confirmCard = document.getElementById('confirm-card');
  const confirmSummary = document.getElementById('confirm-summary');
  const icsBtn = document.getElementById('ics-btn');
  const newRequestBtn = document.getElementById('new-request-btn');

  let selectedTime = null;
  let lastAppt = null;

  cfg.services.forEach((svc) => {
    const opt = document.createElement('option');
    opt.value = svc.id;
    opt.textContent = svc.name + ' (' + svc.durationMinutes + ' דק׳)';
    serviceEl.appendChild(opt);
  });

  const today = new Date();
  dateEl.min = S.toISODate(today);
  const maxDate = new Date(today.getTime() + 60 * 24 * 3600 * 1000);
  dateEl.max = S.toISODate(maxDate);
  dateEl.value = S.toISODate(today);

  function currentService() {
    return cfg.services.find((s) => s.id === serviceEl.value) || cfg.services[0];
  }

  function renderSlots() {
    selectedTime = null;
    slotsEl.innerHTML = '';
    if (!dateEl.value) return;
    const svc = currentService();
    const slots = S.getAvailableSlots(dateEl.value, svc.durationMinutes, []);
    noSlotsEl.hidden = slots.length > 0;
    slots.forEach((t) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'slot-btn';
      btn.textContent = t;
      btn.addEventListener('click', () => {
        selectedTime = t;
        slotsEl.querySelectorAll('.slot-btn').forEach((b) => b.classList.remove('selected'));
        btn.classList.add('selected');
      });
      slotsEl.appendChild(btn);
    });
  }

  serviceEl.addEventListener('change', renderSlots);
  dateEl.addEventListener('change', renderSlots);
  renderSlots();

  function showError(msg) {
    errorEl.textContent = msg;
    errorEl.hidden = false;
  }

  submitBtn.addEventListener('click', () => {
    errorEl.hidden = true;
    if (!selectedTime) return showError('נא לבחור שעה פנויה');
    if (!nameEl.value.trim()) return showError('נא להזין שם מלא');
    if (!phoneEl.value.trim()) return showError('נא להזין מספר טלפון');

    const svc = currentService();
    const appt = {
      id: S.uid(),
      service: svc.name,
      durationMinutes: svc.durationMinutes,
      date: dateEl.value,
      time: selectedTime,
      clientName: nameEl.value.trim(),
      clientPhone: phoneEl.value.trim(),
      note: noteEl.value.trim(),
      status: 'pending',
      createdAt: new Date().toISOString(),
    };
    lastAppt = appt;

    const lines = [
      'בקשת תור חדש דרך האתר:',
      'שירות: ' + appt.service,
      'תאריך: ' + S.formatDateHe(appt.date),
      'שעה: ' + appt.time,
      'שם: ' + appt.clientName,
      'טלפון: ' + appt.clientPhone,
    ];
    if (appt.note) lines.push('הערה: ' + appt.note);
    const message = lines.join('\n');

    if (cfg.whatsappNumber) {
      const url = 'https://wa.me/' + cfg.whatsappNumber + '?text=' + encodeURIComponent(message);
      window.open(url, '_blank', 'noopener');
    }

    confirmSummary.textContent = cfg.whatsappNumber
      ? 'הבקשה נפתחה בוואטסאפ — יש לשלוח את ההודעה כדי להשלים את הבקשה. ' + appt.service + ' ביום ' + S.formatDateHe(appt.date) + ' בשעה ' + appt.time + '.'
      : message + '\n\n(העסק טרם הגדיר מספר וואטסאפ — יש להעתיק ולשלוח הודעה זו ישירות)';

    bookingCard.hidden = true;
    confirmCard.hidden = false;
  });

  icsBtn.addEventListener('click', () => {
    if (!lastAppt) return;
    const ics = S.buildIcsFile(lastAppt, cfg.businessName);
    const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'תור-' + lastAppt.date + '.ics';
    a.click();
    URL.revokeObjectURL(url);
  });

  newRequestBtn.addEventListener('click', () => {
    nameEl.value = '';
    phoneEl.value = '';
    noteEl.value = '';
    renderSlots();
    confirmCard.hidden = true;
    bookingCard.hidden = false;
  });
})();
