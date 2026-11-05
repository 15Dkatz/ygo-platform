import { useRef, useState, type DragEvent } from "react";
import type { Deck } from "../../../shared/types.ts";
import { useDeckStore } from "../../store/deckStore.ts";
import { importYdkFiles, type ImportProgress, type ImportSummary } from "./importYdk.ts";
import "./library-components.css";

interface Props {
  /** Called after decks were saved. */
  onImported?: (decks: Deck[], summary: ImportSummary) => void;
  compact?: boolean;
}

/** "Import .ydk files" + "Import folder" (recursive), with progress and a summary. */
export function ImportDecks({ onImported, compact }: Props) {
  const store = useDeckStore();
  const [progress, setProgress] = useState<ImportProgress | null>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const filesRef = useRef<HTMLInputElement>(null);
  const folderRef = useRef<HTMLInputElement>(null);
  const busy = progress !== null;

  async function run(list: FileList | File[] | null) {
    const files = list ? [...list] : [];
    if (!files.length) return;
    setError(null);
    setSummary(null);
    setProgress({ phase: "reading", done: 0, total: files.length });
    try {
      const existing = await store.list();
      const { decks, summary } = await importYdkFiles(files, existing, setProgress);
      if (decks.length) {
        setProgress({ phase: "saving", done: 0, total: decks.length });
        await store.saveMany(decks);
      }
      setSummary(summary);
      onImported?.(decks, summary);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setProgress(null);
      if (filesRef.current) filesRef.current.value = "";
      if (folderRef.current) folderRef.current.value = "";
    }
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setOver(false);
    if (!busy) void run(e.dataTransfer.files);
  }

  return (
    <div
      className={`import-decks${compact ? " compact" : ""}${over ? " over" : ""}`}
      onDragOver={(e) => { if (e.dataTransfer.types.includes("Files")) { e.preventDefault(); setOver(true); } }}
      onDragLeave={() => setOver(false)}
      onDrop={onDrop}
    >
      <div className="import-buttons">
        <button type="button" className="primary" disabled={busy} onClick={() => filesRef.current?.click()}>Import .ydk files</button>
        <button type="button" disabled={busy} onClick={() => folderRef.current?.click()}>Import folder</button>
        {!compact && <span className="muted">or drop .ydk files here</span>}
      </div>
      <input ref={filesRef} type="file" accept=".ydk" multiple hidden data-testid="ydk-files" onChange={(e) => run(e.target.files)} />
      <input
        ref={(el) => { folderRef.current = el; el?.setAttribute("webkitdirectory", ""); el?.setAttribute("directory", ""); }}
        type="file" multiple hidden data-testid="ydk-folder" onChange={(e) => run(e.target.files)}
      />
      {progress && (
        <div className="import-progress" role="status" aria-live="polite">
          <progress max={progress.total || 1} value={progress.done} />
          <span>{progress.phase}… {progress.total ? `${progress.done} / ${progress.total}` : ""}</span>
        </div>
      )}
      {error && <p className="import-error" role="alert">Import failed: {error}</p>}
      {summary && (
        <div className="import-summary" role="status">
          <strong>
            Imported {summary.decks} deck{summary.decks === 1 ? "" : "s"}
          </strong>{" "}
          <span className="muted">
            ({summary.added} new, {summary.replaced} replaced{summary.duplicateNames ? `, ${summary.duplicateNames} duplicate file names merged` : ""})
          </span>
          <br />
          {summary.slots.toLocaleString()} card slots, {summary.uniqueCards.toLocaleString()} unique cards identified
          {summary.unknownIds.length > 0 ? (
            <>
              , <span className="warn-text">{summary.unknownIds.length} unrecognised ID{summary.unknownIds.length === 1 ? "" : "s"}</span> covering {summary.unknownSlots} slot{summary.unknownSlots === 1 ? "" : "s"} (kept as “Unknown card” entries)
              <details>
                <summary className="muted">Show unrecognised IDs</summary>
                <code className="id-list">{summary.unknownIds.join(", ")}</code>
              </details>
            </>
          ) : "."}
          {summary.skipped > 0 && <><br /><span className="muted">{summary.skipped} non-.ydk file(s) skipped.</span></>}
          {summary.ignoredLines > 0 && <><br /><span className="muted">{summary.ignoredLines} unreadable line(s) ignored.</span></>}
          {summary.files === 0 && <><br /><span className="warn-text">No .ydk files found in the selection.</span></>}
        </div>
      )}
    </div>
  );
}
