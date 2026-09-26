document.addEventListener('DOMContentLoaded', () => {
  const langWrappers = document.querySelectorAll('.lang-dropdown-wrapper');
  langWrappers.forEach(wrapper => {
    const btn = wrapper.querySelector('.lang-btn');
    if (!btn) return;

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      wrapper.classList.toggle('active');
    });
  });

  document.addEventListener('click', () => {
    langWrappers.forEach(w => w.classList.remove('active'));
  });
});
