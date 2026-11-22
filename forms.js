/**
 * XBPO forms client. Validates fields & CV files, submits to the hardened server validation endpoint,
 * and forwards to Google Apps Script (if configured) or queues for Admin Portal Google Drive/Sheets sync.
 */
(() => {
  'use strict';
  const MAX_CV_BYTES = 3 * 1024 * 1024;
  const allowedExtensions = new Set(['pdf', 'doc', 'docx']);
  const APPS_SCRIPT_REGEX = /^https:\/\/script\.google\.com\/macros\/s\/[a-zA-Z0-9_-]+\/exec$/;

  const formItems = [
    { form: document.getElementById('contactForm'), type: 'contact', status: document.getElementById('contactStatus') },
    { form: document.getElementById('careerForm'), type: 'career', status: document.getElementById('careerStatus') },
  ];

  async function resolveAppsScriptUrl() {
    const fromConfig = (window.XBPO_CONFIG && window.XBPO_CONFIG.appsScriptUrl || '').trim();
    if (APPS_SCRIPT_REGEX.test(fromConfig)) return fromConfig;
    try {
      const live = window.__XBPO_LIVE_SETTINGS || (await fetch('/api/site-settings').then((r) => (r.ok ? r.json() : null)));
      const url = (live && live.appsScriptUrl || '').trim();
      if (APPS_SCRIPT_REGEX.test(url)) return url;
    } catch {}
    return '';
  }

  function receipt() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    const bytes = new Uint8Array(16);
    if (window.crypto && crypto.getRandomValues) crypto.getRandomValues(bytes);
    else throw Error('Your browser cannot securely create an application receipt ID.');
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  }

  function setMessage(element, text, state = '') {
    if (!element) return;
    element.textContent = text;
    element.classList.remove('is-error', 'is-success', 'is-pending');
    if (state) element.classList.add(`is-${state}`);
  }

  function base64Of(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(',')[1]);
      reader.onerror = () => reject(Error('Unable to read the selected CV.'));
      reader.readAsDataURL(file);
    });
  }

  function statusLookup(endpoint, id) {
    return new Promise((resolve, reject) => {
      const name = 'XBPO_STATUS_' + id.replace(/-/g, '_');
      const script = document.createElement('script');
      let done = false;
      const timer = setTimeout(() => finish(Error('Status check timed out.')), 7000);
      function finish(error, data) {
        if (done) return;
        done = true;
        clearTimeout(timer);
        delete window[name];
        script.remove();
        if (error) reject(error);
        else resolve(data);
      }
      window[name] = (data) => finish(null, data);
      script.onerror = () => finish(Error('Status service unreachable.'));
      script.src = `${endpoint}?request_id=${encodeURIComponent(id)}&callback=${encodeURIComponent(name)}&_=${Date.now()}`;
      document.head.appendChild(script);
    });
  }

  function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function waitForReceipt(endpoint, id) {
    const end = Date.now() + 35000;
    await wait(1600);
    while (Date.now() < end) {
      try {
        const result = await statusLookup(endpoint, id);
        if (result && result.state === 'ok') return result;
        if (result && result.state === 'error') throw Error(result.message || 'The server rejected this submission.');
      } catch (err) {
        if (err.message !== 'Status service unreachable.' && err.message !== 'Status check timed out.') throw err;
      }
      await wait(1600);
    }
    throw Error('Google Sheets confirmation timed out; queued for Admin Portal verification.');
  }

  function submitViaFrame(fields, action, id) {
    const frame = document.createElement('iframe');
    frame.name = 'xbpo_frame_' + id;
    frame.title = 'Submission transport';
    frame.style.display = 'none';
    const transport = document.createElement('form');
    transport.method = 'POST';
    transport.action = action;
    transport.target = frame.name;
    transport.style.display = 'none';
    transport.acceptCharset = 'UTF-8';
    Object.entries(fields).forEach(([key, val]) => {
      const hidden = document.createElement('input');
      hidden.type = 'hidden';
      hidden.name = key;
      hidden.value = val == null ? '' : String(val);
      transport.appendChild(hidden);
    });
    document.body.appendChild(frame);
    document.body.appendChild(transport);
    transport.submit();
    setTimeout(() => {
      transport.remove();
      frame.remove();
    }, 65000);
  }

  for (const item of formItems) {
    if (!item.form) continue;
    const form = item.form;
    const resumeInput = form.querySelector('input[name=resume]');
    if (resumeInput) {
      resumeInput.addEventListener('change', () => {
        const name = (resumeInput.files && resumeInput.files[0] && resumeInput.files[0].name) || 'Choose a file';
        const label = document.getElementById('resumeLabel');
        if (label) label.textContent = name;
      });
    }

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!form.checkValidity()) {
        form.reportValidity();
        return;
      }
      if (form.elements.website && form.elements.website.value) return;

      const button = form.querySelector('button[type=submit]');
      const original = button.innerHTML;
      const fields = Object.fromEntries(new FormData(form).entries());
      delete fields.resume;

      if (item.type === 'career') {
        const cv = resumeInput && resumeInput.files && resumeInput.files[0];
        if (!cv) {
          setMessage(item.status, 'Please choose your CV.', 'error');
          return;
        }
        const ext = (cv.name.split('.').pop() || '').toLowerCase();
        if (!allowedExtensions.has(ext) || cv.size === 0 || cv.size > MAX_CV_BYTES) {
          setMessage(item.status, 'Choose a PDF, DOC or DOCX CV no larger than 3 MB.', 'error');
          return;
        }
        fields.resumeName = cv.name;
        fields.resumeMime = cv.type || '';
        try {
          fields.resumeBase64 = await base64Of(cv);
        } catch (err) {
          setMessage(item.status, err.message, 'error');
          return;
        }
      }

      let id;
      try {
        id = receipt();
      } catch (err) {
        setMessage(item.status, err.message, 'error');
        return;
      }

      fields.formType = item.type;
      fields.requestId = id;
      button.disabled = true;
      button.textContent = 'Validating & Sending…';
      setMessage(item.status, 'Securing inputs and submitting…', 'pending');

      try {
        const resp = await fetch('/api/submissions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(fields),
        });
        const data = await resp.json();
        if (!resp.ok) {
          throw Error(data.error || 'Submission rejected by security validation.');
        }

        const endpoint = await resolveAppsScriptUrl();
        if (endpoint) {
          setMessage(item.status, 'Syncing to Google Sheets & Drive…', 'pending');
          try {
            submitViaFrame(fields, endpoint, id);
            const result = await waitForReceipt(endpoint, id);
            if (result.state === 'ok') {
              await fetch(`/api/submissions/${encodeURIComponent(id)}/apps-script-status`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  sheetSyncStatus: 'synced',
                  driveSyncStatus: item.type === 'career' ? 'synced' : undefined,
                }),
              });
              form.reset();
              if (resumeInput) {
                const label = document.getElementById('resumeLabel');
                if (label) label.textContent = 'Choose a file';
              }
              setMessage(
                item.status,
                item.type === 'career'
                  ? `Application received (Receipt: ${id.slice(0, 8)}). Saved to Google Sheets & Drive.`
                  : `Enquiry received (Receipt: ${id.slice(0, 8)}). Saved to Google Sheets.`,
                'success'
              );
              return;
            }
          } catch (syncErr) {
            await fetch(`/api/submissions/${encodeURIComponent(id)}/apps-script-status`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                sheetSyncStatus: 'error',
                driveSyncStatus: item.type === 'career' ? 'error' : undefined,
                syncError: syncErr.message,
              }),
            }).catch(() => {});
          }
        }

        form.reset();
        if (resumeInput) {
          const label = document.getElementById('resumeLabel');
          if (label) label.textContent = 'Choose a file';
        }
        setMessage(
          item.status,
          item.type === 'career'
            ? `Application received (Receipt: ${id.slice(0, 8)}). Queued for Google Drive & Sheet sync in Admin Portal.`
            : `Enquiry received (Receipt: ${id.slice(0, 8)}). Queued for Google Sheet sync in Admin Portal.`,
          'success'
        );
      } catch (err) {
        setMessage(item.status, err.message || 'Submission failed. Please check your entries and try again.', 'error');
      } finally {
        button.disabled = false;
        button.innerHTML = original;
      }
    });
  }
})();
