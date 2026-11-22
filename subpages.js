(() => {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const progress = document.querySelector('.sp-progress');
  if (progress) {
    const update = () => {
      const max = document.documentElement.scrollHeight - innerHeight;
      progress.style.width = `${max > 0 ? Math.min(100, (scrollY / max) * 100) : 0}%`;
    };
    update(); addEventListener('scroll', update, {passive:true}); addEventListener('resize', update, {passive:true});
  }
  const reveals = [...document.querySelectorAll('[data-reveal]')];
  if (!reduce && 'IntersectionObserver' in window) {
    const io = new IntersectionObserver(entries => entries.forEach(e => {
      if (e.isIntersecting) { e.target.classList.add('is-visible'); io.unobserve(e.target); }
    }), {threshold:.12, rootMargin:'0px 0px -4% 0px'});
    reveals.forEach(el => io.observe(el));
  } else reveals.forEach(el => el.classList.add('is-visible'));

  if (!reduce && matchMedia('(pointer:fine)').matches) {
    document.querySelectorAll('.tilt-card').forEach(card => {
      card.addEventListener('pointermove', e => {
        const r = card.getBoundingClientRect(), x = (e.clientX-r.left)/r.width-.5, y=(e.clientY-r.top)/r.height-.5;
        card.style.transform = `perspective(900px) rotateX(${y*-3.2}deg) rotateY(${x*4.2}deg) translateY(-3px)`;
      });
      card.addEventListener('pointerleave', () => card.style.transform='');
    });
    const visual = document.querySelector('[data-parallax]');
    if (visual) {
      visual.addEventListener('pointermove', e => {
        const r=visual.getBoundingClientRect(),x=(e.clientX-r.left)/r.width-.5,y=(e.clientY-r.top)/r.height-.5;
        visual.querySelectorAll('.sp-float-chip,.visual-card').forEach((el,i)=>{
          const d=(i+1)*4; el.style.translate=`${x*d}px ${y*d}px`;
        });
      });
      visual.addEventListener('pointerleave',()=>visual.querySelectorAll('.sp-float-chip,.visual-card').forEach(el=>el.style.translate=''));
    }
  }
})();
