(() => {
  const body = document.body;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const pageMap = {
    'index': 'home',
    'about': 'about',
    'services': 'services',
    'team': 'team',
    'process': 'process',
    'careers': 'careers',
    'contact': 'contact',
    'privacy': 'privacy',
    'service-final-expense': 'final-expense',
    'service-us-outbound': 'outbound',
    'service-lead-generation': 'lead-generation',
    'service-appointments': 'handoff',
    'service-quality': 'quality',
    'service-operations': 'operations',
    'role-fronter': 'role-fronter',
    'role-closer': 'role-closer',
    'role-verifier': 'role-verifier'
  };

  const slug = (window.location.pathname.split('/').filter(Boolean).pop() || 'index')
    .toLowerCase()
    .replace(/\.html$/, '');
  body.dataset.xbpoPage = pageMap[slug] || 'home';

  /* No splash / loader and no artificial navigation delay.
     The real header logo and page hero provide the arrival motion. */
  document.querySelectorAll('.xbpo-page-loader').forEach(el => el.remove());

  if (reduce) {
    body.classList.add('xbpo-motion-ready');
  } else {
    requestAnimationFrame(() => requestAnimationFrame(() => body.classList.add('xbpo-motion-ready')));
  }

  window.addEventListener('pageshow', () => {
    body.classList.remove('xbpo-page-leaving');
    body.classList.add('xbpo-motion-ready');
  });
})();
