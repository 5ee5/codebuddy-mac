"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "@/components/icons";
import { MODES } from "@/lib/modes";

/*
 * The only client component in the shell: it needs `usePathname()` to mark
 * the current page. On static routes the pathname is known at prerender time.
 * Routes with a dynamic segment (`/history/[id]`) only know it at request
 * time, so the shell wraps the links in <Suspense> and shows
 * `NavLinksFallback` (the same links, none marked) until it streams in.
 */
interface NavItem {
  href: string;
  label: string;
  tagline: string;
  icon: IconName;
  mode: string;
}

const HOME: NavItem = { href: "/", label: "Home", tagline: "Overview", icon: "home", mode: "home" };

const MODE_ITEMS: readonly NavItem[] = MODES.map((m) => ({
  href: m.href,
  label: m.label,
  tagline: m.tagline,
  icon: m.icon,
  mode: m.id,
}));

function isActive(pathname: string | null, href: string) {
  if (pathname === null) return false;
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function SidebarLink({ item, active }: { item: NavItem; active: boolean }) {
  return (
    <li data-mode={item.mode}>
      <Link
        href={item.href}
        aria-current={active ? "page" : undefined}
        className={`relative flex min-h-11 items-center gap-3 rounded-md px-3 py-2 transition-colors duration-150 before:absolute before:inset-y-2 before:left-0 before:w-0.5 before:rounded-full ${
          active
            ? "bg-surface-2 text-ink before:bg-mode"
            : "text-muted hover:bg-surface-2/70 hover:text-ink"
        }`}
      >
        <Icon name={item.icon} className="size-[18px] shrink-0 text-mode" />
        <span className="flex flex-col leading-tight">
          <span className="text-sm font-semibold">{item.label}</span>
          {item.mode !== "home" && <span className="text-xs text-muted">{item.tagline}</span>}
        </span>
      </Link>
    </li>
  );
}

type Variant = "sidebar" | "tabs";

export function NavLinks({ variant }: { variant: Variant }) {
  return <NavList variant={variant} pathname={usePathname()} />;
}

export function NavLinksFallback({ variant }: { variant: Variant }) {
  return <NavList variant={variant} pathname={null} />;
}

function NavList({ variant, pathname }: { variant: Variant; pathname: string | null }) {
  if (variant === "tabs") {
    return (
      <ul className="grid grid-cols-4">
        {[HOME, ...MODE_ITEMS].map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <li key={item.href} data-mode={item.mode}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`relative flex min-h-16 flex-col items-center justify-center gap-1 text-xs transition-colors duration-150 before:absolute before:inset-x-5 before:top-0 before:h-0.5 before:rounded-full ${
                  active
                    ? "font-semibold text-mode before:bg-mode"
                    : "font-medium text-muted hover:text-ink"
                }`}
              >
                <Icon name={item.icon} className="size-5" />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <ul>
        <SidebarLink item={HOME} active={isActive(pathname, HOME.href)} />
      </ul>
      <div>
        <p id="nav-modes-label" className="mb-1.5 px-3 font-mono text-[11px] font-medium tracking-wide text-subtle uppercase">
          Modes
        </p>
        <ul aria-labelledby="nav-modes-label" className="flex flex-col gap-0.5">
          {MODE_ITEMS.map((item) => (
            <SidebarLink key={item.href} item={item} active={isActive(pathname, item.href)} />
          ))}
        </ul>
      </div>
    </div>
  );
}
