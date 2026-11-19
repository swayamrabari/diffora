"use client";

// Renders the page's breadcrumb into the TopBar's placeholder after hydration.
import { createPortal } from "react-dom";
import { useSyncExternalStore, type ReactNode } from "react";

const subscribe = () => () => {};

function getSnapshot(): HTMLElement | null {
  return document.getElementById("app-header-breadcrumb");
}

function getServerSnapshot(): HTMLElement | null {
  return null;
}

export function HeaderBreadcrumb({ children }: { children: ReactNode }) {
  const target = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  if (!target) {
    return null;
  }

  return createPortal(children, target);
}
