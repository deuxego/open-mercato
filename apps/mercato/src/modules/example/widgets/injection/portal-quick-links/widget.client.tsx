"use client"

const LINKS = [
  { label: 'My Tasks', description: 'View task history', href: '#', icon: 'T' },
  { label: 'Notifications', description: 'View notifications', href: '#', icon: 'N' },
  { label: 'Addresses', description: 'Manage addresses', href: '#', icon: 'A' },
  { label: 'Support', description: 'Contact support', href: '#', icon: 'S' },
]

export default function PortalQuickLinksWidget() {
  return (
    <div className="grid grid-cols-2 gap-2">
      {LINKS.map((link) => (
        <a
          key={link.label}
          href={link.href}
          className="flex items-center gap-3 rounded-lg border p-3 transition-colors hover:bg-muted"
        >
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-foreground text-[12px] font-bold text-background">
            {link.icon}
          </div>
          <div className="min-w-0">
            <p className="text-[13px] font-medium">{link.label}</p>
            <p className="text-[11px] text-muted-foreground">{link.description}</p>
          </div>
        </a>
      ))}
    </div>
  )
}
