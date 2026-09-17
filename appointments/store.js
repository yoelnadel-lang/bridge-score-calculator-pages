(function (global) {
  const DOW_NAMES = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

  function pad2(n) { return String(n).padStart(2, '0'); }

  function toISODate(d) {
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }

  function formatDateHe(dateStr) {
    const d = new Date(dateStr + 'T00:00:00');
    return DOW_NAMES[d.getDay()] + ', ' + pad2(d.getDate()) + '/' + pad2(d.getMonth() + 1) + '/' + d.getFullYear();
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
      'UID:' + (appt.id || Date.now()) + '@appointments',
      'DTSTAMP:' + fmt(new Date()),
      'DTSTART:' + fmt(start),
      'DTEND:' + fmt(end),
      'SUMMARY:' + (appt.service + ' אצל ' + businessName),
      'DESCRIPTION:' + ('תור עבור ' + appt.clientName),
      'END:VEVENT', 'END:VCALENDAR',
    ].join('\r\n');
  }

  async function apiGet(url) {
    const res = await fetch(url, { credentials: 'same-origin' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'שגיאת שרת');
    return data;
  }

  async function apiPost(url, body) {
    const res = await fetch(url, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'שגיאת שרת');
    return data;
  }

  global.Store = {
    toISODate, formatDateHe, normalizePhoneForWhatsapp, buildIcsFile, apiGet, apiPost,
  };
})(window);
