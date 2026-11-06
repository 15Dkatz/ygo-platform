import { useEffect } from "react";

const SITE = "YGO Duel Hub";

/** Sets the browser tab title: "<page> · YGO Duel Hub" (or just the site name for null). */
export function usePageTitle(page: string | null) {
  useEffect(() => {
    document.title = page ? `${page} · ${SITE}` : SITE;
  }, [page]);
}
