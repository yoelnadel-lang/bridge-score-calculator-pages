(function () {
  const S = window.Store;
  const DOW_NAMES = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

  const gate = document.getElementById('gate');
  const gateForm = document.getElementById('gate-form');
  const gateUser = document.getElementById('gate-username');
  const gatePass = document.getElementById('gate-password');
  const gateError = document.getElementById('gate-error');
  const adminMain = document.getElementById('admin-main');

  async function checkSession() {
    try {
      const data = await S.apiGet('api/auth.php?action=me');
      if (data.loggedIn) unlock();
    } catch (e) { /* not logged in */ }
  }

  function unlock() {
    gate.hidden = true;
    adminMain.hidden = false;
    initAdmin();
  }

  gateForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    gateError.hidden = true;
    try {
      await S.apiPost('api/auth.php?action=login', { username: gateUser.value, password: gatePass.value });
      unlock();
    } catch (err) {
      gateError.textContent = err.message || 'שגיאת התחברות';
      gateError.hidden = false;
    }
  });

  document.getElementById('logout-btn').addEventListener('click', async () => {
    await S.apiPost('api/auth.php?action=logout', {});
    location.reload();
  });

  checkSession();

  function initAdmin() {
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

    let selectedTime = null;
    let services = [];

    function currentService() {
      return services.find((s) => String(s.id) === serviceEl.value) || services[0];
    }

    async function renderSlots() {
      selectedTime = null;
      slotsEl.innerHTML = '';
      const svc = currentService();
      if (!dateEl.value || !svc) return;
      const data = await S.apiGet('api/appointments.php?action=available_slots&date=' + dateEl.value + '&service_id=' + svc.id);
      const slots = data.slots || [];
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

    addBtn.addEventListener('click', async () => {
      errorEl.hidden = true;
      if (!selectedTime) { errorEl.textContent = 'נא לבחור שעה'; errorEl.hidden = false; return; }
      if (!nameEl.value.trim()) { errorEl.textContent = 'נא להזין שם'; errorEl.hidden = false; return; }
      const svc = currentService();
      try {
        await S.apiPost('api/appointments.php?action=create', {
          service_id: svc.id,
          date: dateEl.value,
          time: selectedTime,
          client_name: nameEl.value.trim(),
          client_phone: phoneEl.value.trim(),
          note: noteEl.value.trim(),
          status: 'confirmed',
        });
      } catch (e) {
        errorEl.textContent = e.message || 'שגיאה בהוספת התור';
        errorEl.hidden = false;
        return;
      }
      nameEl.value = ''; phoneEl.value = ''; noteEl.value = '';
      renderSlots();
      renderList();
    });

    async function renderList() {
      const data = await S.apiGet('api/appointments.php?action=list&filter=' + filterEl.value);
      const list = data.appointments || [];
      listEl.innerHTML = '';
      emptyEl.hidden = list.length > 0;

      list.forEach((appt) => {
        const item = document.createElement('div');
        item.className = 'appt-item';

        const statusLabel = { pending: 'ממתין לאישור', confirmed: 'מאושר', cancelled: 'מבוטל', done: 'הושלם' }[appt.status] || appt.status;
        const statusClass = appt.status === 'cancelled' ? 'cancelled' : 'confirmed';

        const payLabel = { unpaid: 'לא שולם', pending: 'ממתין לתשלום', paid: 'שולם ✓' }[appt.payment_status] || appt.payment_status;

        const head = document.createElement('div');
        head.className = 'appt-item-head';
        head.innerHTML =
          '<span><span class="appt-date">' + S.formatDateHe(appt.appt_date) + '</span> · <span class="appt-time">' + appt.appt_time.slice(0, 5) + '</span></span>' +
          '<span class="badge ' + statusClass + '">' + statusLabel + '</span>';
        item.appendChild(head);

        const meta = document.createElement('div');
        meta.className = 'appt-meta';
        meta.textContent = appt.service_name + ' — ' + appt.client_name + (appt.client_phone ? ' · ' + appt.client_phone : '') +
          ' · תשלום: ' + payLabel + (appt.invoice_number ? ' (קבלה #' + appt.invoice_number + ')' : '') +
          (appt.note ? ' · ' + appt.note : '');
        item.appendChild(meta);

        const actions = document.createElement('div');
        actions.className = 'appt-actions';

        if (appt.client_phone) {
          const waLink = document.createElement('a');
          waLink.className = 'btn small secondary';
          waLink.href = 'https://wa.me/' + S.normalizePhoneForWhatsapp(appt.client_phone);
          waLink.target = '_blank'; waLink.rel = 'noopener';
          waLink.textContent = 'וואטסאפ ללקוח/ה';
          actions.appendChild(waLink);
        }

        if (appt.status === 'pending') {
          actions.appendChild(makeButton('btn small', 'אישור תור', () => setStatus(appt.id, 'confirmed')));
        }
        if (appt.status === 'confirmed') {
          actions.appendChild(makeButton('btn small secondary', 'סימון כהושלם', () => setStatus(appt.id, 'done')));
        }
        if (appt.payment_status !== 'paid' && appt.status !== 'cancelled') {
          actions.appendChild(makeButton('btn small secondary', 'גביית תשלום', () => chargePayment(appt)));
        }
        if (appt.status !== 'cancelled') {
          actions.appendChild(makeButton('btn small danger', 'ביטול תור', () => setStatus(appt.id, 'cancelled')));
        }
        actions.appendChild(makeButton('btn small secondary', 'מחיקה', () => removeAppt(appt.id)));

        item.appendChild(actions);
        listEl.appendChild(item);
      });
    }

    function makeButton(cls, label, onClick) {
      const btn = document.createElement('button');
      btn.className = cls;
      btn.textContent = label;
      btn.addEventListener('click', onClick);
      return btn;
    }

    async function setStatus(id, status) {
      await S.apiPost('api/appointments.php?action=update_status', { id, status });
      renderSlots();
      renderList();
    }

    async function removeAppt(id) {
      if (!confirm('למחוק את התור לצמיתות?')) return;
      await S.apiPost('api/appointments.php?action=delete', { id });
      renderSlots();
      renderList();
    }

    async function chargePayment(appt) {
      const amountStr = prompt('סכום לגבייה (בשקלים):', appt.price || '');
      if (amountStr === null) return;
      const amount = parseFloat(amountStr);
      if (!amount || amount <= 0) { alert('סכום לא תקין'); return; }
      try {
        const result = await S.apiPost('api/payments_create.php', { appointment_id: appt.id, amount });
        window.open(result.paymentUrl, '_blank', 'noopener');
        renderList();
      } catch (e) {
        alert(e.message || 'שגיאה ביצירת עסקת סליקה');
      }
    }

    filterEl.addEventListener('change', renderList);

    async function loadSettingsAndServices() {
      const settings = await S.apiGet('api/settings.php?action=get');
      document.getElementById('business-name').textContent = settings.business_name;
      document.getElementById('s-business-name').value = settings.business_name;
      document.getElementById('s-whatsapp').value = settings.whatsapp_number || '';
      document.getElementById('s-interval').value = settings.slot_interval_minutes;
      renderHoursEditor(settings.work_hours);

      services = settings.services;
      serviceEl.innerHTML = '';
      services.filter((s) => s.active == 1).forEach((svc) => {
        const opt = document.createElement('option');
        opt.value = svc.id;
        opt.textContent = svc.name + ' (' + svc.duration_minutes + ' דק׳)';
        serviceEl.appendChild(opt);
      });
      renderServicesEditor(services);
    }

    function renderHoursEditor(workHours) {
      const container = document.getElementById('s-hours');
      container.innerHTML = '';
      for (let dow = 0; dow <= 6; dow++) {
        const h = workHours[dow] || { open: false, start: '09:00', end: '18:00' };
        const row = document.createElement('div');
        row.className = 'field';
        row.style.display = 'flex';
        row.style.alignItems = 'center';
        row.style.gap = '8px';
        row.innerHTML =
          '<label style="width:60px; margin:0;">' + DOW_NAMES[dow] + '</label>' +
          '<input type="checkbox" data-dow="' + dow + '" data-role="open" ' + (h.open ? 'checked' : '') + '>' +
          '<input type="time" data-dow="' + dow + '" data-role="start" value="' + h.start + '" style="width:auto;">' +
          '<span>—</span>' +
          '<input type="time" data-dow="' + dow + '" data-role="end" value="' + h.end + '" style="width:auto;">';
        container.appendChild(row);
      }
    }

    function collectHours() {
      const container = document.getElementById('s-hours');
      const result = {};
      for (let dow = 0; dow <= 6; dow++) {
        result[dow] = {
          open: container.querySelector('[data-dow="' + dow + '"][data-role="open"]').checked,
          start: container.querySelector('[data-dow="' + dow + '"][data-role="start"]').value,
          end: container.querySelector('[data-dow="' + dow + '"][data-role="end"]').value,
        };
      }
      return result;
    }

    function renderServicesEditor(list) {
      const container = document.getElementById('s-services');
      container.innerHTML = '';
      list.forEach((svc) => {
        const row = document.createElement('div');
        row.className = 'field';
        row.style.display = 'flex';
        row.style.flexWrap = 'wrap';
        row.style.gap = '8px';
        row.style.alignItems = 'center';
        row.innerHTML =
          '<input type="text" value="' + svc.name.replace(/"/g, '&quot;') + '" data-f="name" style="flex:2;">' +
          '<input type="number" value="' + svc.duration_minutes + '" data-f="duration" style="width:80px;" title="דקות">' +
          '<input type="number" value="' + svc.price + '" data-f="price" style="width:90px;" title="מחיר">' +
          '<label style="width:auto; display:flex; align-items:center; gap:4px;"><input type="checkbox" data-f="active" ' + (svc.active == 1 ? 'checked' : '') + '> פעיל</label>' +
          '<button class="btn small secondary" data-f="save">שמירה</button>' +
          '<button class="btn small danger" data-f="delete">מחיקה</button>';

        row.querySelector('[data-f="save"]').addEventListener('click', async () => {
          await S.apiPost('api/settings.php?action=save_service', {
            id: svc.id,
            name: row.querySelector('[data-f="name"]').value.trim(),
            durationMinutes: parseInt(row.querySelector('[data-f="duration"]').value, 10),
            price: parseFloat(row.querySelector('[data-f="price"]').value) || 0,
            active: row.querySelector('[data-f="active"]').checked,
          });
          loadSettingsAndServices();
        });
        row.querySelector('[data-f="delete"]').addEventListener('click', async () => {
          if (!confirm('למחוק את השירות?')) return;
          await S.apiPost('api/settings.php?action=delete_service', { id: svc.id });
          loadSettingsAndServices();
        });
        container.appendChild(row);
      });
    }

    document.getElementById('s-add-service-btn').addEventListener('click', async () => {
      await S.apiPost('api/settings.php?action=save_service', { name: 'שירות חדש', durationMinutes: 30, price: 0, active: true });
      loadSettingsAndServices();
    });

    document.getElementById('s-save-btn').addEventListener('click', async () => {
      await S.apiPost('api/settings.php?action=update', {
        businessName: document.getElementById('s-business-name').value.trim(),
        whatsappNumber: document.getElementById('s-whatsapp').value.trim(),
        slotIntervalMinutes: parseInt(document.getElementById('s-interval').value, 10),
        workHours: collectHours(),
      });
      const saved = document.getElementById('s-saved');
      saved.hidden = false;
      setTimeout(() => { saved.hidden = true; }, 2000);
      document.getElementById('business-name').textContent = document.getElementById('s-business-name').value.trim();
    });

    dateEl.value = S.toISODate(new Date());
    loadSettingsAndServices().then(renderSlots);
    renderList();
  }
})();
