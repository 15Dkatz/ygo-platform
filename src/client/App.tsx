import { Link, NavLink, Route, Routes, useLocation } from "react-router-dom";
import { lazy, Suspense } from "react";
// /dev/foils: every foil on a few cards, large (unlinked; for checking the foils by eye)
const FoilLab = lazy(() => import("./pages/FoilLab.tsx"));
const FxLab = lazy(() => import("./pages/FxLab.tsx"));
import { SkinPicker } from "./components/SkinPicker.tsx";
import { HomePage } from "./pages/HomePage.tsx";
import { usePageTitle } from "./usePageTitle.ts";
import { LibraryPage } from "./pages/LibraryPage.tsx";
import { DecksPage } from "./pages/DecksPage.tsx";
import { DeckBuilderPage } from "./pages/DeckBuilderPage.tsx";
import { LoginPage } from "./pages/LoginPage.tsx";
import { LobbyPage } from "./pages/LobbyPage.tsx";
import { DuelPage } from "./pages/DuelPage.tsx";
import { AccountBadge } from "./components/AccountBadge.tsx";
import { LICENSE_NAME, SOURCE_URL } from "../shared/project.ts";

// Route ownership: library/decks = phase 1, login/account = phase 2,
// lobby/duel = phase 3 (manual) + phase 4 (engine).
/** Browser-tab title per route. */
function titleFor(path: string): string | null {
  if (path === "/") return null;
  if (path.startsWith("/library")) return "Library";
  if (path.startsWith("/decks/")) return "Deck builder";
  if (path.startsWith("/decks")) return "Decks";
  if (path.startsWith("/login")) return "Sign in";
  if (path.startsWith("/lobby")) return "Duel lobby";
  if (path.startsWith("/duel/")) return "Duel";
  return "Not found";
}

function NotFound() {
  return (
    <section className="notfound">
      <h1>Nothing here</h1>
      <p className="muted">That page doesn't exist. It may have been a duel room that has closed.</p>
      <p><Link to="/">Go home</Link> · <Link to="/lobby">Find a duel</Link></p>
    </section>
  );
}

export function App() {
  usePageTitle(titleFor(useLocation().pathname));
  return (
    <div className="app">
      <header className="topbar">
        <NavLink to="/" className="brand">YGO Duel Hub</NavLink>
        <nav>
          <NavLink to="/library">Library</NavLink>
          <NavLink to="/decks">Decks</NavLink>
          <NavLink to="/lobby">Duel</NavLink>
        </nav>
        <SkinPicker />
        <AccountBadge />
      </header>
      <main className="content">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/library" element={<LibraryPage />} />
          <Route path="/decks" element={<DecksPage />} />
          <Route path="/decks/:deckId" element={<DeckBuilderPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/lobby" element={<LobbyPage />} />
          <Route path="/duel/:roomId" element={<DuelPage />} />
          <Route path="/dev/foils" element={<Suspense fallback={null}><FoilLab /></Suspense>} />
          <Route path="/dev/fx" element={<Suspense fallback={null}><FxLab /></Suspense>} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
      <footer className="site-footer">
        <a href={SOURCE_URL} target="_blank" rel="noreferrer">Source code</a> ({LICENSE_NAME})
        <span aria-hidden="true"> · </span>
        Card data from <a href="https://ygoprodeck.com/" target="_blank" rel="noreferrer">YGOPRODeck</a>
        <span aria-hidden="true"> · </span>
        Yu-Gi-Oh! cards © Konami. Non-commercial fan project.
      </footer>
    </div>
  );
}
