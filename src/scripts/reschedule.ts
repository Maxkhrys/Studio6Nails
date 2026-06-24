/* ---------------------------------------------------------------------------
   Reschedule island. Loads free slots for the booking's existing stylist +
   service (excluding the booking itself) and posts the chosen time to
   /api/reschedule-booking. Mirrors the booking flow's slot picker.
   --------------------------------------------------------------------------- */

const dataEl = document.getElementById('rs-data');
const slotsEl = document.getElementById('slots');
const dateInput = document.getElementById('date') as HTMLInputElement | null;
const confirmBtn = document.getElementById('confirm') as HTMLButtonElement | null;
const errorEl = document.getElementById('rs-error') as HTMLElement | null;

if (dataEl && slotsEl && dateInput && confirmBtn) {
  const { bookingId, staffId, serviceId } = JSON.parse(dataEl.textContent || '{}') as {
    bookingId: string;
    staffId: string;
    serviceId: string;
  };

  let startsAt = '';

  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const today = new Date();
  dateInput.min = fmt(today);
  const max = new Date(today);
  max.setDate(max.getDate() + 60);
  dateInput.max = fmt(max);

  const showError = (msg: string) => {
    if (!errorEl) return;
    errorEl.textContent = msg;
    errorEl.hidden = false;
  };

  dateInput.addEventListener('change', loadSlots);

  async function loadSlots() {
    if (!dateInput!.value) return;
    startsAt = '';
    confirmBtn!.disabled = true;
    if (errorEl) errorEl.hidden = true;
    slotsEl!.innerHTML = '<p class="slots__empty">Finding available times…</p>';
    try {
      const res = await fetch(
        `/api/slots?staff=${staffId}&service=${serviceId}&date=${dateInput!.value}&exclude=${bookingId}`,
      );
      const data = await res.json();
      const slots: string[] = data.slots ?? [];
      if (!res.ok || slots.length === 0) {
        slotsEl!.innerHTML =
          '<p class="slots__empty">No times available that day — please try another date.</p>';
        return;
      }
      slotsEl!.innerHTML = '';
      slots.forEach((iso) => {
        const t = new Date(iso).toLocaleTimeString('en-IE', { hour: '2-digit', minute: '2-digit' });
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'slot';
        btn.textContent = t;
        btn.addEventListener('click', () => {
          slotsEl!.querySelectorAll('.slot').forEach((b) => b.classList.remove('is-selected'));
          btn.classList.add('is-selected');
          startsAt = iso;
          confirmBtn!.disabled = false;
        });
        slotsEl!.appendChild(btn);
      });
    } catch {
      slotsEl!.innerHTML = '<p class="slots__empty">Couldn’t load times — please try again.</p>';
    }
  }

  confirmBtn.addEventListener('click', async () => {
    if (!startsAt) return;
    confirmBtn.disabled = true;
    confirmBtn.textContent = 'Saving…';
    if (errorEl) errorEl.hidden = true;
    try {
      const res = await fetch('/api/reschedule-booking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId, startsAt }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.message || 'Couldn’t change the time.');
      window.location.href = '/account';
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
      confirmBtn.disabled = false;
      confirmBtn.textContent = 'Confirm new time';
    }
  });
}

export {};
