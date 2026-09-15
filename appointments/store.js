(function (global) {
  const KEY = 'liat_appointments_v1';
  const DOW_NAMES = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

  function loadAppointments() {
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }

  function saveAppointments(list) {
    try { localStorage.setItem(KEY, JSON.stringify(list)); } catch (e) {}
  }

  function addAppointment(appt) {
    const list = loadAppointments();
    list.push(appt);
    saveAppointments(list);
    return appt;
  }

  function updateAppointment(id, patch) {
    const list = loadAppointments();
    const idx = list.findIndex((a) => a.id === id);
    if (idx === -1) return null;
    list[idx] = Object.assign({}, list[idx], patch);
    saveAppointments(list);
    return list[idx];
  }

  function deleteAppointment(id) {
    saveAppointments(loadAppointments().filter((a) => a.id !== id));
  }

  function uid() {
    return 'a' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function pad2(n) { return String(n).padStart(2, '0'); }

  function toISODate(d) {
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }

  function formatDateHe(dateStr) {
    const d = new Date(dateStr + 'T00:00:00');
    return DOW_NAMES[d.getDay()] + ', ' + pad2(d.getDate()) + '/' + pad2(d.getMonth() + 1) + '/' + d.getFullYear();
  }

  function timeToMinutes(t) {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
  }

  function minutesToTime(mins) {
    return pad2(Math.floor(mins / 60)) + ':' + pad2(mins % 60);
  }

  // רשימת שעות פנויות בתאריך נתון עבור משך שירות נתון.
  // existingAppointments משמש לחסום חפיפות — מעביר [] כשאין מידע אמין (בדף הציבורי).
  function getAvailableSlots(dateStr, durationMinutes, existingAppointments) {
    const cfg = global.APP_CONFIG;
    const date = new Date(dateStr + 'T00:00:00');
    const hours = cfg.workHours[date.getDay()];
    if (!hours || !hours.open) return [];

    const startMin = timeToMinutes(hours.start);
    const endMin = timeToMinutes(hours.end);
    const interval = cfg.slotIntervalMinutes || 30;

    const busy = (existingAppointments || [])
      .filter((a) => a.date === dateStr && a.status !== 'cancelled')
      .map((a) => ({ start: timeToMinutes(a.time), end: timeToMinutes(a.time) + a.durationMinutes }));

    const now = new Date();
    const isToday = toISODate(now) === dateStr;
    const nowMin = now.getHours() * 60 + now.getMinutes();

    const slots = [];
    for (let t = startMin; t + durationMinutes <= endMin; t += interval) {
      if (isToday && t <= nowMin) continue;
      const overlaps = busy.some((b) => t < b.end && t + durationMinutes > b.start);
      if (!overlaps) slots.push(minutesToTime(t));
    }
    return slots;
  }

  function normalizePhoneForWhatsapp(phone) {
    let digits = String(phone || '').replace(/\D/g, '');
    if (digits.startsWith('0')) digits = '972' + digits.slice(1);
    return digits;
  }

  function buildIcsFile(appt, businessName) {
    const start = new Date(appt.date + 'T' + appt.time + ':00');
    const end = new Date(start.getTime() + appt.durationMinutes * 60000);
    const fmt = (d) => d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    return [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//appointments//he//', 'BEGIN:VEVENT',
      'UID:' + appt.id + '@appointments',
      'DTSTAMP:' + fmt(new Date()),
      'DTSTART:' + fmt(start),
      'DTEND:' + fmt(end),
      'SUMMARY:' + (appt.service + ' אצל ' + businessName),
      'DESCRIPTION:' + ('תור עבור ' + appt.clientName),
      'END:VEVENT', 'END:VCALENDAR',
    ].join('\r\n');
  }

  global.Store = {
    loadAppointments, saveAppointments, addAppointment, updateAppointment, deleteAppointment,
    uid, toISODate, formatDateHe, timeToMinutes, minutesToTime, getAvailableSlots,
    normalizePhoneForWhatsapp, buildIcsFile,
  };
})(window);
