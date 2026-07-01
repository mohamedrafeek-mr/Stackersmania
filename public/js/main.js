(function () {
  'use strict';

  document.getElementById('year').textContent = new Date().getFullYear();

  /* ---------------- mobile nav ---------------- */
  const navToggle = document.getElementById('navToggle');
  const navLinks = document.getElementById('navLinks');
  navToggle.addEventListener('click', () => {
    const isOpen = navLinks.classList.toggle('is-open');
    navToggle.setAttribute('aria-expanded', String(isOpen));
  });
  navLinks.querySelectorAll('a').forEach((link) => {
    link.addEventListener('click', () => navLinks.classList.remove('is-open'));
  });

  /* ---------------- active nav link on scroll ---------------- */
  const sections = ['home', 'services', 'work', 'about', 'careers', 'contact']
    .map((id) => document.getElementById(id))
    .filter(Boolean);
  const navMap = new Map();
  document.querySelectorAll('[data-nav]').forEach((a) => {
    navMap.set(a.getAttribute('href').slice(1), a);
  });

  const navObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          navMap.forEach((a) => a.classList.remove('active'));
          const link = navMap.get(entry.target.id);
          if (link) link.classList.add('active');
        }
      });
    },
    { rootMargin: '-40% 0px -50% 0px' }
  );
  sections.forEach((s) => navObserver.observe(s));

  /* ---------------- scroll reveal ---------------- */
  const revealObserver = new IntersectionObserver(
    (entries, obs) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          obs.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.15 }
  );
  document.querySelectorAll('.reveal').forEach((el) => revealObserver.observe(el));

  /* ---------------- animated stat counters ---------------- */
  const statEls = document.querySelectorAll('.stat-num');
  const statObserver = new IntersectionObserver(
    (entries, obs) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const el = entry.target;
        const target = parseInt(el.dataset.count, 10) || 0;
        const suffix = el.dataset.suffix || '';
        const duration = 900;
        const start = performance.now();

        function tick(now) {
          const progress = Math.min((now - start) / duration, 1);
          const eased = 1 - Math.pow(1 - progress, 3);
          el.textContent = Math.round(eased * target) + suffix;
          if (progress < 1) requestAnimationFrame(tick);
        }
        requestAnimationFrame(tick);
        obs.unobserve(el);
      });
    },
    { threshold: 0.6 }
  );
  statEls.forEach((el) => statObserver.observe(el));

  /* ---------------- careers list ---------------- */
  const careersList = document.getElementById('careersList');

  async function loadCareers() {
    try {
      const res = await fetch('/api/careers');
      const data = await res.json();
      if (!data.ok || !data.careers.length) {
        careersList.innerHTML = '<p class="careers-empty">No open roles right now — check back soon, or send us your resume anyway via the contact form.</p>';
        return;
      }
      careersList.innerHTML = '';
      data.careers.forEach((career) => {
        const item = document.createElement('div');
        item.className = 'career-item reveal';
        item.innerHTML = `
          <div class="career-main">
            <h3>${escapeHTML(career.title)}</h3>
            <div class="career-meta">
              <span>${escapeHTML(career.department)}</span>
              <span>${escapeHTML(career.location)}</span>
              <span>${escapeHTML(career.type)}</span>
            </div>
            <p class="career-desc">${escapeHTML(career.description)}</p>
          </div>
          <button class="btn btn-primary career-apply-btn" data-role="${escapeHTML(career.title)}">Apply now</button>
        `;
        careersList.appendChild(item);
        revealObserver.observe(item);
      });

      careersList.querySelectorAll('.career-apply-btn').forEach((btn) => {
        btn.addEventListener('click', () => openApplyModal(btn.dataset.role));
      });
    } catch (err) {
      careersList.innerHTML = '<p class="careers-empty">Could not load open roles right now. Please try again later.</p>';
    }
  }

  function escapeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  loadCareers();

  /* ---------------- apply modal ---------------- */
  const applyModal = document.getElementById('applyModal');
  const applyForm = document.getElementById('applyForm');
  const applyRoleTitle = document.getElementById('applyRoleTitle');
  const applyModalTitle = document.getElementById('applyModalTitle');
  const applyStatus = document.getElementById('applyStatus');

  function openApplyModal(roleTitle) {
    applyRoleTitle.value = roleTitle;
    applyModalTitle.textContent = roleTitle;
    applyStatus.textContent = '';
    applyStatus.className = 'form-status';
    applyModal.classList.add('is-open');
    applyModal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  }
  function closeApplyModal() {
    applyModal.classList.remove('is-open');
    applyModal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }
  applyModal.querySelectorAll('[data-close]').forEach((el) => el.addEventListener('click', closeApplyModal));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeApplyModal();
  });

  applyForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn = applyForm.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    applyStatus.textContent = 'Submitting…';
    applyStatus.className = 'form-status';

    try {
      const formData = new FormData(applyForm);
      const res = await fetch('/api/apply', { method: 'POST', body: formData });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Something went wrong.');
      applyStatus.textContent = "Application sent! We'll be in touch by email.";
      applyStatus.className = 'form-status success';
      applyForm.reset();
      setTimeout(closeApplyModal, 1800);
    } catch (err) {
      applyStatus.textContent = err.message || 'Something went wrong. Please try again.';
      applyStatus.className = 'form-status error';
    } finally {
      submitBtn.disabled = false;
    }
  });

  /* ---------------- contact form ---------------- */
  const contactForm = document.getElementById('contactForm');
  const contactStatus = document.getElementById('contactStatus');

  contactForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn = contactForm.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    contactStatus.textContent = 'Sending…';
    contactStatus.className = 'form-status';

    try {
      const payload = Object.fromEntries(new FormData(contactForm).entries());
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Something went wrong.');
      contactStatus.textContent = "Message sent! We'll reply by email soon.";
      contactStatus.className = 'form-status success';
      contactForm.reset();
    } catch (err) {
      contactStatus.textContent = err.message || 'Something went wrong. Please try again.';
      contactStatus.className = 'form-status error';
    } finally {
      submitBtn.disabled = false;
    }
  });
})();
