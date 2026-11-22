const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
if ('IntersectionObserver' in window && !reducedMotion) {
  const observer = new IntersectionObserver(entries => entries.forEach(entry => {
    if (entry.isIntersecting) { entry.target.classList.add('in-view'); observer.unobserve(entry.target); }
  }), { threshold: .1, rootMargin: '0px 0px 24px 0px' });
  document.querySelectorAll('.reveal').forEach(el => observer.observe(el));
} else { document.querySelectorAll('.reveal').forEach(el => el.classList.add('in-view')); }

const header = document.querySelector('.site-header');
if (header) window.addEventListener('scroll', () => header.classList.toggle('scrolled', scrollY > 20), {passive:true});
const toggle = document.querySelector('.menu-toggle');
const menu = document.querySelector('.mobile-menu');
if (toggle && menu) {
  const closeMenu = () => { menu.classList.remove('open'); menu.setAttribute('aria-hidden', 'true'); menu.inert=true; toggle.setAttribute('aria-expanded', 'false'); toggle.setAttribute('aria-label','Open menu'); document.body.classList.remove('menu-open'); };
  toggle.addEventListener('click', () => {
    const open = menu.classList.toggle('open'); menu.setAttribute('aria-hidden', String(!open)); menu.inert=!open;
    toggle.setAttribute('aria-expanded', String(open)); toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu'); document.body.classList.toggle('menu-open', open);
  });
  menu.querySelectorAll('a').forEach(a => a.addEventListener('click', closeMenu));
  document.addEventListener('keydown', event => { if (event.key === 'Escape') closeMenu(); });
  window.addEventListener('resize', () => { if (window.innerWidth > 980 && menu.classList.contains('open')) closeMenu(); }, {passive:true});
}
const stage = document.querySelector('.hero-stage');
if (stage && !reducedMotion && window.matchMedia('(pointer:fine)').matches) {
  const card = stage.querySelector('.card-main'); const orb = stage.querySelector('.orb-a');
  stage.addEventListener('pointermove', e => {
    const r = stage.getBoundingClientRect(); const x = (e.clientX-r.left)/r.width-.5; const y=(e.clientY-r.top)/r.height-.5;
    card.style.transform = `rotate(${-4+x*4}deg) translate(${x*8}px,${y*8}px)`;
    orb.style.transform = `translate(${x*-14}px,${y*-14}px)`;
  });
  stage.addEventListener('pointerleave', () => { card.style.transform='rotate(-4deg)'; orb.style.transform=''; });
}

// Prefill values from a direct service or role link. Match only an existing option.
(function(){
 const params=new URLSearchParams(window.location.search);
 [['role','#careerForm select[name="role"]'],['service','#contactForm select[name="service"]']].forEach(([key,selector])=>{
  const field=document.querySelector(selector),value=params.get(key);
  if(field && value && [...field.options].some(option=>option.value===value))field.value=value;
 });
})();

// Sync live social media links and contact details edited via Admin Portal
(function(){
 fetch('/api/site-settings',{cache:'no-store'})
  .then(r=>r.ok?r.json():null)
  .then(cfg=>{
   if(!cfg)return;
   window.__XBPO_LIVE_SETTINGS=cfg;
   const safeUrl=u=>typeof u==='string'&&/^https?:\/\//i.test(u);
   if(safeUrl(cfg.instagramUrl))document.querySelectorAll('.social-instagram').forEach(a=>{a.href=cfg.instagramUrl;});
   if(safeUrl(cfg.facebookUrl))document.querySelectorAll('.social-facebook').forEach(a=>{a.href=cfg.facebookUrl;});
   if(safeUrl(cfg.googleUrl))document.querySelectorAll('.social-google,a[href*="share.google"]').forEach(a=>{a.href=cfg.googleUrl;});
   if(cfg.contactEmail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cfg.contactEmail)){
    document.querySelectorAll('a[href^="mailto:"]').forEach(a=>{
     a.href='mailto:'+cfg.contactEmail;
     const strong=a.querySelector('strong');
     if(strong)strong.textContent=cfg.contactEmail;
    });
   }
   if(cfg.contactPhone && /^[+0-9() .-]{10,32}$/.test(cfg.contactPhone)){
    document.querySelectorAll('a[href^="tel:"]').forEach(a=>{
     a.href='tel:'+cfg.contactPhone.replace(/[^+0-9]/g,'');
     const strong=a.querySelector('strong');
     if(strong)strong.textContent=cfg.contactPhone;
    });
   }
   if(Array.isArray(cfg.careerRoles) && cfg.careerRoles.length>0){
    const roleSelect=document.querySelector('#careerForm select[name="role"]');
    if(roleSelect){
     const requestedRole=new URLSearchParams(window.location.search).get('role') || roleSelect.value;
     roleSelect.innerHTML='';
     const placeholder=document.createElement('option');
     placeholder.value='';
     placeholder.textContent='Select a role';
     roleSelect.appendChild(placeholder);
     cfg.careerRoles.forEach(r=>{
      if(!r || !r.name)return;
      const opt=document.createElement('option');
      opt.value=r.name;
      opt.textContent=r.name;
      if(requestedRole && requestedRole===r.name)opt.selected=true;
      roleSelect.appendChild(opt);
     });
    }
   }
  })
  .catch(()=>{});
})();

