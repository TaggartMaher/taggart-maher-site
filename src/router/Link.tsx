import { type AnchorHTMLAttributes, type MouseEvent, type ReactNode } from "react";
import { useRouter } from "./useRouter";

interface LinkProps extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href" | "onClick"> {
  to: string;
  children: ReactNode;
  // Use replaceState instead of pushState. Default false.
  replace?: boolean;
  onClick?: (event: MouseEvent<HTMLAnchorElement>) => void;
}

function isExternalHref(href: string): boolean {
  return /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(href) && !href.startsWith("/");
}

export function Link({ to, children, replace, onClick, ...rest }: LinkProps) {
  const router = useRouter();
  function handleClick(event: MouseEvent<HTMLAnchorElement>): void {
    if (onClick) {
      onClick(event);
      if (event.defaultPrevented) return;
    }
    // Modifier keys / non-primary buttons fall through to the browser
    // so "open in new tab", "open in new window", and middle-click
    // still work as expected.
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) {
      return;
    }
    if (isExternalHref(to)) return;
    event.preventDefault();
    if (replace) {
      router.replace(to);
    } else {
      router.navigate(to);
    }
  }
  return (
    <a href={to} onClick={handleClick} {...rest}>
      {children}
    </a>
  );
}
