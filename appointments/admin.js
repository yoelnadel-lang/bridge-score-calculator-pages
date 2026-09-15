(function () {
  const cfg = window.APP_CONFIG;
  const S = window.Store;
  const SESSION_KEY = 'liat_admin_unlocked';

  const gate = document.getElementById('gate');
  const gateForm = document.getElementById('gate-form');
  const gatePin = document.getElementById('gate-pin');
  const gateError = document.getElementById('gate-error');
  const adminMain = document.getElementById('admin-main');

  function unlock() {
    gate.hidden = true;
    adminMain.hidden = false;
    initAdmin();
  }

  if (sessionStorage.getItem(SESSION_KEY) === '1') {
    unlock();
  }

  gateForm.addEventListener('submit', (e) => {
    e.preventDefault();
    if (gatePin.value === cfg.adminPin) {
      sessionStorage.setItem(SESSION_KEY, '1');
      unlock();
    } else {
      gateError.hidden = false;
      gatePin.value = '';
    }
  });

  function initAdmin() {
    document.getElementById('business-name').textContent = cfg.businessName;

    const serviceEl = document.getElementById('a-service');
    const dateEl = document.getElementById('a-date');
    const slotsEl = document.getElementById('a-slots');
    const noSlotsEl = document.getElementById('a-no-slots');
    const nameEl = document.getElementById('a-name');
    const phoneEl = document.getElementById('a-phone');
    const noteEl = document.getElementById('a-note');
    const addBtn = document.getElementById('a-add-btn');
    const errorEl = document.getElementById('a-error');
    const listEl = document.getElementById('appt-list');
    const emptyEl = document.getElementById('empty-list');
    const filterEl = document.getElementById('filter-select');
    const exportBtn = document.getElementById('export-btn');
    const importFile = document.getElementById('import-file');

    let selectedTime = null;

    cfg.services.forEach((svc) => {
      const opt = document.createElement('option');
      opt.value = svc.id;
      opt.textContent = svc.name + ' (' + svc.durationMinutes + ' דק׳)';
      serviceEl.appendChild(opt);
    });
    dateEl.value = S.toISODate(new Date());

    function currentService() {
      return cfg.services.find((s) => s.id === serviceEl.value) || cfg.services[0];
    }

    function renderSlots() {
      selectedTime = null;
      slotsEl.innerHTML = '';
      if (!dateEl.value) return;
      const svc = currentService();
      const existing = S.loadAppointments();
      const slots = S.getAvailableSlots(dateEl.value, svc.durationMinutes, existing);
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

    addBtn.addEventListener('click', () => {
      errorEl.hidden = true;
      if (!selectedTime) { errorEl.textContent = 'נא לבחור שעה'; errorEl.hidden = false; return; }
      if (!nameEl.value.trim()) { errorEl.textContent = 'נא להזין שם'; errorEl.hidden = false; return; }

      const svc = currentService();
      S.addAppointment({
        id: S.uid(),
        service: svc.name,
        durationMinutes: svc.durationMinutes,
        date: dateEl.value,
        time: selectedTime,
        clientName: nameEl.value.trim(),
        clientPhone: phoneEl.value.trim(),
        note: noteEl.value.trim(),
        status: 'confirmed',
        createdAt: new Date().toISOString(),
      });

      nameEl.value = '';
      phoneEl.value = '';
      noteEl.value = '';
      renderSlots();
      renderList();
    });

    function renderList() {
      const all = S.loadAppointments().slice().sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
      const mode = filterEl.value;
      const todayIso = S.toISODate(new Date());
      let list = all;
      if (mode === 'upcoming') list = all.filter((a) => a.status !== 'cancelled' && a.date >= todayIso);
      else if (mode === 'cancelled') list = all.filter((a) => a.status === 'cancelled');

      listEl.innerHTML = '';
      emptyEl.hidden = list.length > 0;

      list.forEach((appt) => {
        const item = document.createElement('div');
        item.className = 'appt-item';

        const head = document.createElement('div');
        head.className = 'appt-item-head';
        head.innerHTML =
          '<span><span class="appt-date">' + S.formatDateHe(appt.date) + '</span> · <span class="appt-time">' + appt.time + '</span></span>' +
          '<span class="badge ' + (appt.status === 'cancelled' ? 'cancelled' : 'confirmed') + '">' +
          (appt.status === 'cancelled' ? 'מבוטל' : 'מאושר') + '</span>';
        item.appendChild(head);

        const meta = document.createElement('div');
        meta.className = 'appt-meta';
        meta.textContent = appt.service + ' — ' + appt.clientName + (appt.clientPhone ? ' · ' + appt.clientPhone : '') + (appt.note ? ' · ' + appt.note : '');
        item.appendChild(meta);

        const actions = document.createElement('div');
        actions.className = 'appt-actions';

        if (appt.clientPhone) {
          const waLink = document.createElement('a');
          waLink.className = 'btn small secondary';
          waLink.href = 'https://wa.me/' + S.normalizePhoneForWhatsapp(appt.clientPhone);
          waLink.target = '_blank';
          waLink.rel = 'noopener';
          waLink.textContent = 'וואטסאפ ללקוח/ה';
          actions.appendChild(waLink);
        }

        if (appt.status !== 'cancelled') {
          const cancelBtn = document.createElement('button');
          cancelBtn.className = 'btn small danger';
          cancelBtn.textContent = 'ביטול תור';
          cancelBtn.addEventListener('click', () => {
            S.updateAppointment(appt.id, { status: 'cancelled' });
            renderSlots();
            renderList();
          });
          actions.appendChild(cancelBtn);
        }

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'btn small secondary';
        deleteBtn.textContent = 'מחיקה';
        deleteBtn.addEventListener('click', () => {
          if (confirm('למחוק את התור לצמיתות?')) {
            S.deleteAppointment(appt.id);
            renderSlots();
            renderList();
          }
        });
        actions.appendChild(deleteBtn);

        item.appendChild(actions);
        listEl.appendChild(item);
      });
    }

    filterEl.addEventListener('change', renderList);
    renderList();

    exportBtn.addEventListener('click', () => {
      const blob = new Blob([JSON.stringify(S.loadAppointments(), null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'גיבוי-תורים-' + S.toISODate(new Date()) + '.json';
      a.click();
      URL.revokeObjectURL(url);
    });

    importFile.addEventListener('change', () => {
      const file = importFile.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const data = JSON.parse(reader.result);
          if (!Array.isArray(data)) throw new Error('invalid');
          if (confirm('פעולה זו תחליף את כל התורים הקיימים בדפדפן זה בנתוני הגיבוי. להמשיך?')) {
            S.saveAppointments(data);
            renderSlots();
            renderList();
          }
        } catch (e) {
          alert('קובץ הגיבוי אינו תקין');
        }
        importFile.value = '';
      };
      reader.readAsText(file);
    });
  }
})();
