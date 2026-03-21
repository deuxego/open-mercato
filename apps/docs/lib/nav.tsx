export function NavTitle() {
  return (
    <span className="flex items-center gap-2 font-semibold">
      <img src="/img/open-mercato.svg" alt="" className="size-5" />
      Open Mercato
    </span>
  );
}

export const navLinks = [
  { text: 'User Guide', url: '/docs/user-guide/overview' },
  { text: 'Framework', url: '/docs/framework/modules/overview' },
  { text: 'REST API', url: '/docs/api/overview' },
];
