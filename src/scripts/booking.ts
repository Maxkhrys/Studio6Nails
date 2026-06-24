/* ---------------------------------------------------------------------------
   Booking flow (client island).
   Progressive: choose service → stylist → date → slot → details → deposit.
   All money is priced server-side; this only collects selections and posts
   them to /api/create-booking, which returns a checkout URL to redirect to.
   --------------------------------------------------------------------------- */

interface Service {
  id: string;
  category: string;
  name: string;
  duration_min: number;
  price_cents: number;
  deposit_cents: number;
}
interface Staff {
  id: string;
  display_name: string;
}

const dataEl = document.getElementById('booking-data');
const form = document.getElementById('booking') as HTMLFormElement | null;
if (dataEl && form) {
  const { services, staff, staffServices } = JSON.parse(dataEl.textContent || '{}') as {
    services: Service[];
    staff: Staff[];
    staffServices: { staff_id: string; service_id: string }[];
  };

  const euro = (c: number) => (Number.isInteger(c / 100) ? `€${c / 100}` : `€${(c / 100).toFixed(2)}`);

  const state = {
    serviceId: '',
    staffId: '',
    startsAt: '',
    deposit: 0,
    price: 0,
    serviceName: '',
    staffName: '',
    // applied voucher (validated server-side)
    voucherCode: '',
    discount: 0,
    payNow: 0,
    studio: 0,
  };

  const stepStaff = document.getElementById('step-staff')!;
  const stepTime = document.getElementById('step-time')!;
  const stepDetails = document.getElementById('step-details')!;
  const staffPick = document.getElementById('staff-pick')!;
  const dateInput = document.getElementById('date') as HTMLInputElement;
  const slotsEl = document.getElementById('slots')!;
  const summaryEl = document.getElementById('summary')!;
  const submitBtn = document.getElementById('submit') as HTMLButtonElement;
  const errorEl = document.getElementById('book-error') as HTMLElement;
  const voucherInput = document.getElementById('voucher') as HTMLInputElement | null;
  const voucherApply = document.getElementById('voucher-apply') as HTMLButtonElement | null;
  const voucherMsg = document.getElementById('voucher-msg') as HTMLElement | null;

  function clearVoucher() {
    state.voucherCode = '';
    state.discount = 0;
    state.payNow = 0;
    state.studio = 0;
    if (voucherMsg) {
      voucherMsg.hidden = true;
      voucherMsg.className = 'voucher__msg';
    }
  }

  // Date input bounds: today … +60 days
  const today = new Date();
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  dateInput.min = fmt(today);
  const max = new Date(today);
  max.setDate(max.getDate() + 60);
  dateInput.max = fmt(max);

  const enable = (el: Element) => el.classList.remove('is-disabled');
  const disable = (el: Element) => el.classList.add('is-disabled');

  function updateSummary() {
    if (state.serviceId && state.staffId && state.startsAt) {
      const when = new Date(state.startsAt).toLocaleString('en-IE', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        hour: '2-digit',
        minute: '2-digit',
      });
      const payNow = state.discount > 0 ? state.payNow : state.deposit;
      const studio = state.discount > 0 ? state.studio : state.price - state.deposit;
      const discountLine =
        state.discount > 0 ? `<br><span class="summary__save">Voucher / promo: −${euro(state.discount)}</span>` : '';
      const payLabel = payNow > 0 ? `Pay now: <strong>${euro(payNow)}</strong>` : `Pay now: <strong>€0</strong>`;
      summaryEl.innerHTML = `<strong>${state.serviceName}</strong> with ${state.staffName}<br>${when}${discountLine}<br>${payLabel} · Balance in studio: ${euro(
        studio,
      )}`;
      submitBtn.textContent = payNow > 0 ? 'Continue to deposit' : 'Confirm booking';
      submitBtn.disabled = false;
    } else {
      summaryEl.innerHTML = '';
      submitBtn.disabled = true;
    }
  }

  // --- Step 1: service selection
  form.querySelectorAll<HTMLButtonElement>('.pick[data-service]').forEach((btn) => {
    btn.addEventListener('click', () => {
      form.querySelectorAll('.pick[data-service]').forEach((b) => b.classList.remove('is-selected'));
      btn.classList.add('is-selected');
      state.serviceId = btn.dataset.service!;
      state.deposit = Number(btn.dataset.deposit);
      state.price = Number(btn.dataset.price);
      state.serviceName = btn.dataset.name!;
      // reset downstream (a voucher's value depends on the service, so re-apply)
      state.staffId = '';
      state.startsAt = '';
      clearVoucher();
      slotsEl.innerHTML = '';
      disable(stepTime);
      disable(stepDetails);
      updateSummary();
      renderStaff();
      enable(stepStaff);
      stepStaff.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  });

  // --- Voucher / promo: validate against the chosen service, show the saving
  async function applyVoucher() {
    if (!voucherInput || !voucherMsg) return;
    const code = voucherInput.value.trim();
    if (!code) {
      clearVoucher();
      updateSummary();
      return;
    }
    if (!state.serviceId) {
      voucherMsg.hidden = false;
      voucherMsg.className = 'voucher__msg is-err';
      voucherMsg.textContent = 'Choose a service first, then apply your code.';
      return;
    }
    voucherMsg.hidden = false;
    voucherMsg.className = 'voucher__msg';
    voucherMsg.textContent = 'Checking…';
    try {
      const res = await fetch('/api/validate-voucher', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, serviceId: state.serviceId }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        clearVoucher();
        voucherMsg.hidden = false;
        voucherMsg.className = 'voucher__msg is-err';
        voucherMsg.textContent = data.message || 'That code can’t be used.';
        updateSummary();
        return;
      }
      state.voucherCode = code;
      state.discount = data.discountCents;
      state.payNow = data.payNowCents;
      state.studio = data.studioCents;
      voucherMsg.className = 'voucher__msg is-ok';
      voucherMsg.textContent = `${data.label} ✓`;
      updateSummary();
    } catch {
      clearVoucher();
      voucherMsg.hidden = false;
      voucherMsg.className = 'voucher__msg is-err';
      voucherMsg.textContent = 'Couldn’t check that code — please try again.';
      updateSummary();
    }
  }
  voucherApply?.addEventListener('click', applyVoucher);
  voucherInput?.addEventListener('input', () => {
    // Editing the code invalidates a previous application until re-applied.
    if (state.voucherCode && voucherInput.value.trim() !== state.voucherCode) {
      clearVoucher();
      updateSummary();
    }
  });

  // --- Step 2: stylist (filtered to those who offer the service)
  function renderStaff() {
    const allowed = new Set(
      staffServices.filter((ss) => ss.service_id === state.serviceId).map((ss) => ss.staff_id),
    );
    const eligible = staff.filter((s) => allowed.has(s.id));
    staffPick.innerHTML = '';
    if (eligible.length === 0) {
      staffPick.innerHTML = '<p class="slots__empty">No stylist is set up for this service yet.</p>';
      return;
    }
    eligible.forEach((s) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'pick';
      btn.innerHTML = `<span class="pick__name">${s.display_name}</span>`;
      btn.addEventListener('click', () => {
        staffPick.querySelectorAll('.pick').forEach((b) => b.classList.remove('is-selected'));
        btn.classList.add('is-selected');
        state.staffId = s.id;
        state.staffName = s.display_name;
        state.startsAt = '';
        updateSummary();
        enable(stepTime);
        if (dateInput.value) loadSlots();
        stepTime.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
      staffPick.appendChild(btn);
    });
  }

  // --- Step 3: date → slots
  dateInput.addEventListener('change', loadSlots);

  async function loadSlots() {
    if (!state.serviceId || !state.staffId || !dateInput.value) return;
    state.startsAt = '';
    updateSummary();
    slotsEl.innerHTML = '<p class="slots__empty">Finding available times…</p>';
    try {
      const res = await fetch(
        `/api/slots?staff=${state.staffId}&service=${state.serviceId}&date=${dateInput.value}`,
      );
      const data = await res.json();
      const slots: string[] = data.slots ?? [];
      if (!res.ok || slots.length === 0) {
        slotsEl.innerHTML =
          '<p class="slots__empty">No times available that day — please try another date.</p>';
        return;
      }
      slotsEl.innerHTML = '';
      slots.forEach((iso) => {
        const t = new Date(iso).toLocaleTimeString('en-IE', {
          hour: '2-digit',
          minute: '2-digit',
        });
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'slot';
        btn.textContent = t;
        btn.addEventListener('click', () => {
          slotsEl.querySelectorAll('.slot').forEach((b) => b.classList.remove('is-selected'));
          btn.classList.add('is-selected');
          state.startsAt = iso;
          updateSummary();
          enable(stepDetails);
          stepDetails.scrollIntoView({ behavior: 'smooth', block: 'center' });
        });
        slotsEl.appendChild(btn);
      });
    } catch {
      slotsEl.innerHTML = '<p class="slots__empty">Couldn’t load times — please try again.</p>';
    }
  }

  // --- Step 4: submit
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorEl.hidden = true;
    const name = (document.getElementById('name') as HTMLInputElement).value.trim();
    const email = (document.getElementById('email') as HTMLInputElement).value.trim();
    const phone = (document.getElementById('phone') as HTMLInputElement).value.trim();
    const notes = (document.getElementById('notes') as HTMLTextAreaElement).value.trim();

    if (!state.serviceId || !state.staffId || !state.startsAt || !name || !email) {
      showError('Please complete every step before continuing.');
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Starting checkout…';
    try {
      const res = await fetch('/api/create-booking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          serviceId: state.serviceId,
          staffId: state.staffId,
          startsAt: state.startsAt,
          clientName: name,
          clientEmail: email,
          clientPhone: phone,
          notes,
          voucherCode: state.voucherCode,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok || !data.url) {
        throw new Error(data.message || 'Something went wrong.');
      }
      window.location.href = data.url;
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
      submitBtn.disabled = false;
      submitBtn.textContent = 'Continue to deposit';
    }
  });

  function showError(msg: string) {
    errorEl.textContent = msg;
    errorEl.hidden = false;
  }
}

export {};
