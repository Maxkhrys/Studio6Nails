/* ---------------------------------------------------------------------------
   Gift voucher purchase island. Collects an amount + recipient details and
   posts to /api/buy-voucher, which returns a checkout URL to redirect to.
   --------------------------------------------------------------------------- */

const form = document.getElementById('gv-form') as HTMLFormElement | null;
const amountInput = document.getElementById('amount') as HTMLInputElement | null;
const amountsWrap = document.getElementById('gv-amounts');
const submitBtn = document.getElementById('gv-submit') as HTMLButtonElement | null;
const errorEl = document.getElementById('gv-error') as HTMLElement | null;

if (form && amountInput && submitBtn) {
  // Preset chips fill the custom field and stay in sync.
  amountsWrap?.querySelectorAll<HTMLButtonElement>('.gv__amount').forEach((btn) => {
    btn.addEventListener('click', () => {
      amountsWrap.querySelectorAll('.gv__amount').forEach((b) => b.classList.remove('is-selected'));
      btn.classList.add('is-selected');
      amountInput.value = btn.dataset.amount || '';
    });
  });
  amountInput.addEventListener('input', () => {
    amountsWrap?.querySelectorAll('.gv__amount').forEach((b) => {
      b.classList.toggle('is-selected', (b as HTMLElement).dataset.amount === amountInput.value);
    });
  });

  const showError = (msg: string) => {
    if (!errorEl) return;
    errorEl.textContent = msg;
    errorEl.hidden = false;
  };

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (errorEl) errorEl.hidden = true;

    const amountEuros = Math.floor(Number(amountInput.value));
    if (!Number.isFinite(amountEuros) || amountEuros < 10 || amountEuros > 500) {
      showError('Please choose an amount between €10 and €500.');
      return;
    }
    const purchaserEmail = (document.getElementById('purchaserEmail') as HTMLInputElement).value.trim();
    if (!purchaserEmail) {
      showError('Please enter your email for the receipt.');
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Starting payment…';
    try {
      const res = await fetch('/api/buy-voucher', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amountEuros,
          purchaserEmail,
          recipientEmail: (document.getElementById('recipientEmail') as HTMLInputElement).value.trim(),
          recipientName: (document.getElementById('recipientName') as HTMLInputElement).value.trim(),
          message: (document.getElementById('message') as HTMLTextAreaElement).value.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok || !data.url) throw new Error(data.message || 'Something went wrong.');
      window.location.href = data.url;
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
      submitBtn.disabled = false;
      submitBtn.textContent = 'Continue to payment';
    }
  });
}

export {};
