(function () {
  const S = window.Store;
  let cfg = null;

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

  function currentService() {
    return cfg.services.find((s) => String(s.id) === serviceEl.value) || cfg.services[0];
  }

  async function renderSlots() {
    selectedTime = null;
    slotsEl.innerHTML = '';
    if (!dateEl.value) return;
    const svc = currentService();
    if (!svc) return;
    let slots = [];
    try {
      const data = await S.apiGet('api/appointments.php?action=available_slots&date=' + dateEl.value + '&service_id=' + svc.id);
      slots = data.slots || [];
    } catch (e) {
      noSlotsEl.textContent = 'שגיאה בטעינת שעות פנויות. נסו לרענן את הדף.';
      noSlotsEl.hidden = false;
      return;
    }
    noSlotsEl.textContent = 'אין שעות פנויות בתאריך זה. נסו תאריך אחר.';
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

  function showError(msg) {
    errorEl.textContent = msg;
    errorEl.hidden = false;
  }

  async function init() {
    try {
      cfg = await S.apiGet('api/settings.php?action=public');
    } catch (e) {
      document.getElementById('booking-card').innerHTML =
        '<p class="access-gate-error">לא ניתן לטעון את נתוני העסק כרגע. ודאו שהשרת (api/config.php + מסד הנתונים) הוגדר, ונסו שוב.</p>';
      return;
    }

    document.title = 'קביעת תור — ' + cfg.businessName;
    document.getElementById('page-title').textContent = 'קביעת תור אצל ' + cfg.businessName;
    document.getElementById('page-subtitle').textContent = 'בחרו שירות, תאריך ושעה, ומלאו את הפרטים';

    cfg.services.forEach((svc) => {
      const opt = document.createElement('option');
      opt.value = svc.id;
      opt.textContent = svc.name + ' (' + svc.duration_minutes + ' דק׳' + (svc.price > 0 ? ', ₪' + svc.price : '') + ')';
      serviceEl.appendChild(opt);
    });

    const today = new Date();
    dateEl.min = S.toISODate(today);
    const maxDate = new Date(today.getTime() + 60 * 24 * 3600 * 1000);
    dateEl.max = S.toISODate(maxDate);
    dateEl.value = S.toISODate(today);

    serviceEl.addEventListener('change', renderSlots);
    dateEl.addEventListener('change', renderSlots);
    renderSlots();
  }

  submitBtn.addEventListener('click', async () => {
    errorEl.hidden = true;
    if (!selectedTime) return showError('נא לבחור שעה פנויה');
    if (!nameEl.value.trim()) return showError('נא להזין שם מלא');
    if (!phoneEl.value.trim()) return showError('נא להזין מספר טלפון');

    const svc = currentService();
    submitBtn.disabled = true;
    let created;
    try {
      created = await S.apiPost('api/appointments.php?action=create', {
        service_id: svc.id,
        date: dateEl.value,
        time: selectedTime,
        client_name: nameEl.value.trim(),
        client_phone: phoneEl.value.trim(),
        note: noteEl.value.trim(),
      });
    } catch (e) {
      submitBtn.disabled = false;
      showError(e.message || 'אירעה שגיאה בשליחת הבקשה, נסו שוב');
      renderSlots();
      return;
    }
    submitBtn.disabled = false;

    lastAppt = {
      id: created.id,
      service: svc.name,
      durationMinutes: svc.duration_minutes,
      date: dateEl.value,
      time: selectedTime,
      clientName: nameEl.value.trim(),
    };

    if (cfg.whatsappNumber) {
      const lines = [
        'בקשת תור חדש דרך האתר:',
        'שירות: ' + svc.name,
        'תאריך: ' + S.formatDateHe(dateEl.value),
        'שעה: ' + selectedTime,
        'שם: ' + nameEl.value.trim(),
        'טלפון: ' + phoneEl.value.trim(),
      ];
      if (noteEl.value.trim()) lines.push('הערה: ' + noteEl.value.trim());
      window.open('https://wa.me/' + cfg.whatsappNumber + '?text=' + encodeURIComponent(lines.join('\n')), '_blank', 'noopener');
    }

    confirmSummary.textContent = 'הבקשה נשלחה ונקלטה במערכת. ' + svc.name + ' ביום ' + S.formatDateHe(dateEl.value) + ' בשעה ' + selectedTime + '. התור יאושר סופית מולכם.';

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

  init();
})();
