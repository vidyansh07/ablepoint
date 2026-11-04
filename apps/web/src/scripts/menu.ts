// Progressive enhancement: on wide screens the menu <details> is kept open and its toggle hidden.
// Without JS the menu still works as a disclosure on every width.
const menu = document.querySelector<HTMLDetailsElement>('details.menu');
if (menu) {
  const mq = window.matchMedia('(min-width: 60rem)');
  const sync = () => {
    if (mq.matches) menu.open = true;
    else if (menu.dataset.autoOpened) menu.open = false;
  };
  menu.dataset.autoOpened = mq.matches ? '1' : '';
  mq.addEventListener('change', () => {
    menu.dataset.autoOpened = mq.matches ? '1' : '';
    sync();
  });
  sync();
  // Escape closes the mobile menu and returns focus to its toggle.
  menu.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !mq.matches && menu.open) {
      menu.open = false;
      menu.querySelector('summary')?.focus();
    }
  });
}
