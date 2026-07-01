(function () {
  'use strict';

  const loginView = document.getElementById('loginView');
  const dashboardView = document.getElementById('dashboardView');
  const loginForm = document.getElementById('loginForm');
  const loginStatus = document.getElementById('loginStatus');
  const logoutBtn = document.getElementById('logoutBtn');

  async function checkSession() {
    const res = await fetch('/api/admin/session');
    const data = await res.json();
    if (data.loggedIn) {
      showDashboard();
    } else {
      showLogin();
    }
  }

  function showLogin() {
    loginView.hidden = false;
    dashboardView.hidden = true;
  }
  function showDashboard() {
    loginView.hidden = true;
    dashboardView.hidden = false;
    loadCareersAdmin();
  }

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    loginStatus.textContent = 'Signing in…';
    loginStatus.className = 'form-status';
    const username = document.getElementById('loginUser').value;
    const password = document.getElementById('loginPass').value;

    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Login failed.');
      loginForm.reset();
      showDashboard();
    } catch (err) {
      loginStatus.textContent = err.message;
      loginStatus.className = 'form-status error';
    }
  });

  logoutBtn.addEventListener('click', async () => {
    await fetch('/api/admin/logout', { method: 'POST' });
    showLogin();
  });

  /* ---------------- tabs ---------------- */
  const tabs = document.querySelectorAll('.admin-tab');
  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      tabs.forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById('tab-careers').hidden = tab.dataset.tab !== 'careers';
      document.getElementById('tab-applications').hidden = tab.dataset.tab !== 'applications';
      if (tab.dataset.tab === 'applications') loadApplications();
    });
  });

  function escapeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str == null ? '' : str;
    return div.innerHTML;
  }

  /* ---------------- careers admin ---------------- */
  const adminCareersList = document.getElementById('adminCareersList');
  const newCareerBtn = document.getElementById('newCareerBtn');
  const careerModal = document.getElementById('careerModal');
  const careerModalTitle = document.getElementById('careerModalTitle');
  const careerForm = document.getElementById('careerForm');
  const careerFormStatus = document.getElementById('careerFormStatus');
  const deleteCareerBtn = document.getElementById('deleteCareerBtn');

  const careerFields = {
    id: document.getElementById('careerId'),
    title: document.getElementById('careerTitle'),
    dept: document.getElementById('careerDept'),
    location: document.getElementById('careerLocation'),
    type: document.getElementById('careerType'),
    desc: document.getElementById('careerDesc'),
    reqs: document.getElementById('careerReqs'),
    active: document.getElementById('careerActive'),
  };

  async function loadCareersAdmin() {
    adminCareersList.innerHTML = '<p class="empty-state">Loading…</p>';
    const res = await fetch('/api/admin/careers');
    const data = await res.json();
    if (!data.ok) {
      adminCareersList.innerHTML = '<p class="empty-state">Could not load roles.</p>';
      return;
    }
    if (!data.careers.length) {
      adminCareersList.innerHTML = '<p class="empty-state">No roles yet. Click "New role" to add one.</p>';
      return;
    }
    adminCareersList.innerHTML = '';
    data.careers.forEach((c) => {
      const row = document.createElement('div');
      row.className = 'admin-career-row' + (c.active ? '' : ' is-inactive');
      row.innerHTML = `
        <div>
          <h3>${escapeHTML(c.title)}
            <span class="status-pill ${c.active ? 'active' : 'inactive'}">${c.active ? 'Visible' : 'Hidden'}</span>
          </h3>
          <div class="meta">${escapeHTML(c.department)} · ${escapeHTML(c.location)} · ${escapeHTML(c.type)}</div>
        </div>
        <button class="btn btn-ghost" data-edit="${c.id}">Edit</button>
      `;
      adminCareersList.appendChild(row);
    });
    adminCareersList.querySelectorAll('[data-edit]').forEach((btn) => {
      btn.addEventListener('click', () => openCareerModal(data.careers.find((c) => c.id === btn.dataset.edit)));
    });
  }

  function openCareerModal(career) {
    careerFormStatus.textContent = '';
    careerFormStatus.className = 'form-status';
    if (career) {
      careerModalTitle.textContent = 'Edit role';
      careerFields.id.value = career.id;
      careerFields.title.value = career.title;
      careerFields.dept.value = career.department;
      careerFields.location.value = career.location;
      careerFields.type.value = career.type;
      careerFields.desc.value = career.description;
      careerFields.reqs.value = (career.requirements || []).join('\n');
      careerFields.active.checked = !!career.active;
      deleteCareerBtn.hidden = false;
    } else {
      careerModalTitle.textContent = 'New role';
      careerForm.reset();
      careerFields.id.value = '';
      careerFields.active.checked = true;
      deleteCareerBtn.hidden = true;
    }
    careerModal.classList.add('is-open');
    careerModal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  }
  function closeCareerModal() {
    careerModal.classList.remove('is-open');
    careerModal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }
  careerModal.querySelectorAll('[data-close]').forEach((el) => el.addEventListener('click', closeCareerModal));
  newCareerBtn.addEventListener('click', () => openCareerModal(null));

  careerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    careerFormStatus.textContent = 'Saving…';
    careerFormStatus.className = 'form-status';

    const payload = {
      title: careerFields.title.value.trim(),
      department: careerFields.dept.value.trim(),
      location: careerFields.location.value.trim(),
      type: careerFields.type.value,
      description: careerFields.desc.value.trim(),
      requirements: careerFields.reqs.value,
      active: careerFields.active.checked,
    };
    const id = careerFields.id.value;

    try {
      const res = await fetch(id ? `/api/admin/careers/${id}` : '/api/admin/careers', {
        method: id ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Could not save role.');
      closeCareerModal();
      loadCareersAdmin();
    } catch (err) {
      careerFormStatus.textContent = err.message;
      careerFormStatus.className = 'form-status error';
    }
  });

  deleteCareerBtn.addEventListener('click', async () => {
    const id = careerFields.id.value;
    if (!id) return;
    if (!confirm('Delete this role? This cannot be undone.')) return;
    const res = await fetch(`/api/admin/careers/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.ok) {
      closeCareerModal();
      loadCareersAdmin();
    }
  });

  /* ---------------- applications admin ---------------- */
  const adminApplicationsList = document.getElementById('adminApplicationsList');

  async function loadApplications() {
    adminApplicationsList.innerHTML = '<p class="empty-state">Loading…</p>';
    const res = await fetch('/api/admin/applications');
    const data = await res.json();
    if (!data.ok) {
      adminApplicationsList.innerHTML = '<p class="empty-state">Could not load applications.</p>';
      return;
    }
    if (!data.applications.length) {
      adminApplicationsList.innerHTML = '<p class="empty-state">No applications received yet.</p>';
      return;
    }
    adminApplicationsList.innerHTML = '';
    data.applications.forEach((app) => {
      const row = document.createElement('div');
      row.className = 'application-row';
      const date = new Date(app.submittedAt).toLocaleString();
      row.innerHTML = `
        <h3>${escapeHTML(app.name)} — ${escapeHTML(app.roleTitle)}</h3>
        <div class="meta">${escapeHTML(app.email)} · ${escapeHTML(app.phone)} · ${date}</div>
        ${app.message ? `<div class="msg">${escapeHTML(app.message)}</div>` : ''}
        <div class="application-actions">
          <a class="btn btn-primary" href="/api/admin/resume/${encodeURIComponent(app.resumeFile)}" target="_blank" rel="noopener">Download resume</a>
          <button class="btn btn-ghost" data-delete="${app.id}">Delete</button>
        </div>
      `;
      adminApplicationsList.appendChild(row);
    });
    adminApplicationsList.querySelectorAll('[data-delete]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!confirm('Delete this application and its resume file?')) return;
        const res = await fetch(`/api/admin/applications/${btn.dataset.delete}`, { method: 'DELETE' });
        const data = await res.json();
        if (data.ok) loadApplications();
      });
    });
  }

  checkSession();
})();
