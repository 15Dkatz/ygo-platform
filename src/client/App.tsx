import { NavLink, Navigate, Route, Routes } from "react-router-dom";
import { LibraryPage } from "./pages/LibraryPage.tsx";
import { DecksPage } from "./pages/DecksPage.tsx";
import { DeckBuilderPage } from "./pages/DeckBuilderPage.tsx";
import { LoginPage } from "./pages/LoginPage.tsx";
import { LobbyPage } from "./pages/LobbyPage.tsx";
import { DuelPage } from "./pages/DuelPage.tsx";
import { AccountBadge } from "./components/AccountBadge.tsx";

// Route ownership: library/decks = phase 1, login/account = phase 2,
// lobby/duel = phase 3 (manual) + phase 4 (engine).
export function App() {
  return (
    <div className="app">
      <header className="topbar">
        <NavLink to="/" className="brand">YGO Duel Hub</NavLink>
        <nav>
          <NavLink to="/library">Library</NavLink>
          <NavLink to="/decks">Decks</NavLink>
          <NavLink to="/lobby">Duel</NavLink>
        </nav>
        <AccountBadge />
      </header>
      <main className="content">
        <Routes>
          <Route path="/" element={<Navigate to="/library" replace />} />
          <Route path="/library" element={<LibraryPage />} />
          <Route path="/decks" element={<DecksPage />} />
          <Route path="/decks/:deckId" element={<DeckBuilderPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/lobby" element={<LobbyPage />} />
          <Route path="/duel/:roomId" element={<DuelPage />} />
          <Route path="*" element={<p className="muted">Page not found.</p>} />
        </Routes>
      </main>
    </div>
  );
}
