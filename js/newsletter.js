// Sends newsletter signups to the Netlify function, which adds them to Resend.
document.querySelectorAll('.newsletter-form').forEach((form) => {
  const input = form.querySelector('input[type="email"]');
  const button = form.querySelector('button[type="submit"]');

  const status = document.createElement('p');
  status.setAttribute('role', 'status');
  status.style.cssText = 'margin-top:12px;font-size:14px;line-height:1.5;min-height:1.5em;';
  form.after(status);

  const show = (message, ok) => {
    status.textContent = message;
    status.style.color = ok ? '#3a8fd8' : '#e57373';
  };

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!input.checkValidity()) {
      show('Please enter a valid email address.', false);
      input.focus();
      return;
    }

    const label = button.textContent;
    button.disabled = true;
    button.textContent = 'Subscribing…';
    status.textContent = '';

    try {
      const res = await fetch('/api/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: input.value.trim(), website: form.elements.website.value }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error);
      form.reset();
      show("You're subscribed! Watch your inbox for Legacy X updates.", true);
    } catch (err) {
      show(err.message || 'Something went wrong. Please try again.', false);
    } finally {
      button.disabled = false;
      button.textContent = label;
    }
  });
});
