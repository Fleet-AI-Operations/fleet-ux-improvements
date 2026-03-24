"""Interactive Textual UI for toggling boolean flags in archetypes.json."""

from __future__ import annotations

import asyncio
import json
import subprocess
import sys
from pathlib import Path

from rapidfuzz import fuzz
from textual import on
from textual.app import App, ComposeResult
from textual.binding import Binding
from textual.containers import Container, VerticalScroll
from textual.events import Key
from textual.reactive import reactive
from textual.widgets import DataTable, Footer, Header, Input, RichLog, Static

from flatten import BooleanRow, load_archetypes


WORKFLOW_FILE = "archetypes-boolean-apply.yml"


def repo_root_from(start: Path) -> Path:
    """Resolve git repo root; start should be a path inside the repo."""
    out = subprocess.run(
        ["git", "rev-parse", "--show-toplevel"],
        cwd=start,
        capture_output=True,
        text=True,
        check=False,
    )
    if out.returncode != 0:
        raise RuntimeError(
            "Not inside a git repository (git rev-parse --show-toplevel failed)."
        )
    return Path(out.stdout.strip())


def token_backspace(query: str) -> str:
    """Remove the last whitespace-separated token."""
    parts = query.split()
    if not parts:
        return ""
    return " ".join(parts[:-1])


class ArchetypesFlagApp(App[None]):
    """Browse and toggle booleans, then dispatch the apply workflow."""

    CSS = """
    Screen { background: $surface; }
    #summary_panel { height: auto; max-height: 70%; margin: 1 2; }
    #summary_log { min-height: 8; max-height: 28; border: solid $primary; }
    #confirm_hint { margin-top: 1; color: $text-muted; }
    DataTable { height: 1fr; margin: 0 1; }
    #search_line { margin: 0 1; color: $accent; }
    """

    BINDINGS = [
        Binding("q", "quit", "Quit"),
        Binding("escape", "maybe_leave_summary", "Back"),
    ]

    query_text: reactive[str] = reactive("")
    cursor_row: reactive[int] = reactive(0)
    view_mode: reactive[str] = reactive("edit")  # "edit" | "summary"

    def __init__(self, archetypes_path: Path) -> None:
        super().__init__()
        self._archetypes_path = archetypes_path
        self._repo_root = repo_root_from(archetypes_path.parent)
        _, self._rows = load_archetypes(archetypes_path)
        self._filtered: list[int] = list(range(len(self._rows)))
        self._overrides: dict[tuple, bool] = {}

    def compose(self) -> ComposeResult:
        yield Header(show_clock=True)
        with Container(id="edit_panel"):
            yield Static("", id="search_line")
            table = DataTable(zebra_stripes=True, cursor_type="row", id="flag_table")
            table.can_focus = True
            yield table
        with VerticalScroll(id="summary_panel"):
            yield RichLog(id="summary_log", wrap=True, markup=True)
            yield Static(
                "Type Y then Enter to open the GitHub Actions workflow, or n then Enter to return.",
                id="confirm_hint",
            )
            yield Input(placeholder="Y / n", id="confirm_input")
        yield Footer()

    def on_mount(self) -> None:
        self.query_one("#summary_panel").display = False
        table = self.query_one("#flag_table", DataTable)
        table.focus()
        table.add_columns("On", "Setting")
        self.refresh_table()

    def effective(self, row: BooleanRow) -> bool:
        key = row.path_tuple
        if key in self._overrides:
            return self._overrides[key]
        return row.original

    def compute_filtered(self) -> list[int]:
        n = len(self._rows)
        if n == 0:
            return []
        q = self.query_text.strip().lower()
        if not q:
            return list(range(n))
        scored: list[tuple[int, int]] = []
        for i in range(n):
            row = self._rows[i]
            score = fuzz.token_set_ratio(q, row.search_blob)
            scored.append((score, i))
        scored.sort(key=lambda x: (-x[0], x[1]))
        return [i for _, i in scored]

    def refresh_table(self) -> None:
        table = self.query_one("#flag_table", DataTable)
        self._filtered = self.compute_filtered()
        table.clear(columns=False)
        if table.column_count == 0:
            table.add_columns("On", "Setting")
        for _pos, row_i in enumerate(self._filtered):
            r = self._rows[row_i]
            on = self.effective(r)
            sym = "[x]" if on else "[ ]"
            table.add_row(sym, r.label)
        self.query_one("#search_line", Static).update(
            "Search: "
            + repr(self.query_text)
            + "  |  Backspace token  Ctrl+W clear  |  Up/Down  Space toggle  Enter summary  Esc back"
        )
        if not self._filtered:
            return
        self.cursor_row = max(
            0, min(self.cursor_row, len(self._filtered) - 1)
        )
        table.move_cursor(row=self.cursor_row)

    def watch_query_text(self, _value: str) -> None:
        if self.view_mode == "edit":
            self.cursor_row = 0
            self.refresh_table()

    def watch_view_mode(self, mode: str) -> None:
        edit = self.query_one("#edit_panel")
        summ = self.query_one("#summary_panel")
        if mode == "summary":
            edit.display = False
            summ.display = True
            self.call_later(lambda: self.query_one("#confirm_input", Input).focus())
        else:
            edit.display = True
            summ.display = False
            self.call_later(self._focus_table_and_refresh)

    def _focus_table_and_refresh(self) -> None:
        self.query_one("#flag_table", DataTable).focus()
        self.refresh_table()

    def _row_at_cursor(self) -> BooleanRow | None:
        if not self._filtered or self.cursor_row >= len(self._filtered):
            return None
        return self._rows[self._filtered[self.cursor_row]]

    def action_quit(self) -> None:
        self.exit()

    def action_maybe_leave_summary(self) -> None:
        if self.view_mode == "summary":
            self.view_mode = "edit"

    async def on_key(self, event: Key) -> None:
        if self.view_mode == "summary":
            return
        key = event.key
        if key == "up":
            event.prevent_default()
            if self._filtered:
                self.cursor_row = max(0, self.cursor_row - 1)
                tbl = self.query_one("#flag_table", DataTable)
                tbl.move_cursor(row=self.cursor_row)
            return
        if key == "down":
            event.prevent_default()
            if self._filtered:
                self.cursor_row = min(
                    len(self._filtered) - 1, self.cursor_row + 1
                )
                tbl = self.query_one("#flag_table", DataTable)
                tbl.move_cursor(row=self.cursor_row)
            return
        if key == "enter":
            event.prevent_default()
            await self._open_summary()
            return
        if key == "space":
            event.prevent_default()
            row = self._row_at_cursor()
            if row:
                cur = self.effective(row)
                newv = not cur
                if newv == row.original:
                    self._overrides.pop(row.path_tuple, None)
                else:
                    self._overrides[row.path_tuple] = newv
                self.refresh_table()
            return
        if key in ("ctrl+w", "ctrl+backspace"):
            event.prevent_default()
            self.query_text = ""
            return
        if key == "backspace":
            event.prevent_default()
            self.query_text = token_backspace(self.query_text)
            return
        char = event.character
        if char and len(char) == 1 and char.isprintable():
            event.prevent_default()
            self.query_text = f"{self.query_text}{char}"
            return

    async def _open_summary(self) -> None:
        changes: list[tuple[BooleanRow, bool, bool]] = []
        for row in self._rows:
            newv = self.effective(row)
            if newv != row.original:
                changes.append((row, row.original, newv))
        log = self.query_one("#summary_log", RichLog)
        log.clear()
        if not changes:
            log.write(
                "[yellow]No changes — nothing to dispatch.[/] "
                "Press n then Enter to return."
            )
        else:
            log.write("[bold]Pending changes:[/]\n")
            for row, old, new in changes:
                log.write(f"  • {row.label}\n")
                log.write(f"    {old} → {new}\n")
            log.write(
                f"\n[bold]{len(changes)}[/] boolean(s) will be sent to "
                f"[cyan]{WORKFLOW_FILE}[/]."
            )
        self.query_one("#confirm_input", Input).value = ""
        self.view_mode = "summary"

    @on(Input.Submitted, "#confirm_input")
    async def confirm_submitted(self, event: Input.Submitted) -> None:
        if self.view_mode != "summary":
            return
        val = event.value.strip().upper()
        if val == "N" or val == "":
            self.view_mode = "edit"
            return
        if val != "Y":
            log = self.query_one("#summary_log", RichLog)
            log.write(
                "\n[red]Expected Y to dispatch or n to return.[/] Try again."
            )
            self.query_one("#confirm_input", Input).value = ""
            return
        patches = self._build_patch_list()
        if not patches:
            log = self.query_one("#summary_log", RichLog)
            log.write("\n[yellow]No patches; nothing dispatched.[/]")
            self.view_mode = "edit"
            return
        log = self.query_one("#summary_log", RichLog)
        log.write("\n[bold]Dispatching workflow…[/]")

        def run_dispatch() -> str | None:
            try:
                self._run_gh_dispatch(patches, "main")
                return None
            except Exception as e:  # noqa: BLE001
                return str(e)

        err = await asyncio.to_thread(run_dispatch)
        self._dispatch_done(err)

    def _build_patch_list(self) -> list[dict]:
        out: list[dict] = []
        for row in self._rows:
            newv = self.effective(row)
            if newv == row.original:
                continue
            out.append(row.patch_entry(newv))
        return out

    def _run_gh_dispatch(self, patches: list[dict], base_ref: str) -> None:
        proc_chk = subprocess.run(
            ["gh", "auth", "status"],
            cwd=self._repo_root,
            capture_output=True,
            text=True,
        )
        if proc_chk.returncode != 0:
            raise RuntimeError(
                "gh is not authenticated. Run `gh auth login` with repo + workflow scopes."
            )
        owner_repo = subprocess.check_output(
            [
                "gh",
                "repo",
                "view",
                "--json",
                "nameWithOwner",
                "-q",
                ".nameWithOwner",
            ],
            cwd=self._repo_root,
            text=True,
        ).strip()
        body = {
            "ref": base_ref,
            "inputs": {
                "patch_json": json.dumps(patches, separators=(",", ":")),
                "base_ref": base_ref,
            },
        }
        proc = subprocess.run(
            [
                "gh",
                "api",
                "--method",
                "POST",
                f"repos/{owner_repo}/actions/workflows/{WORKFLOW_FILE}/dispatches",
                "--input",
                "-",
            ],
            input=json.dumps(body).encode(),
            cwd=self._repo_root,
            capture_output=True,
        )
        if proc.returncode != 0:
            msg = proc.stderr.decode() or proc.stdout.decode() or "gh api failed"
            raise RuntimeError(msg)

    def _dispatch_done(self, err: str | None) -> None:
        log = self.query_one("#summary_log", RichLog)
        if err:
            log.write(f"\n[red]Dispatch failed:[/]\n{err}\n")
            log.write(
                "\n[yellow]Fix the error above, then try again, or press n then Enter / Esc to return.[/]"
            )
            self.query_one("#confirm_input", Input).value = ""
            return
        log.write(
            "\n[green]Workflow dispatch submitted.[/] "
            "Check Actions on GitHub for a new run of "
            f"'{WORKFLOW_FILE}'."
        )
        self.view_mode = "edit"


def main() -> None:
    here = Path(__file__).resolve()
    try:
        root = repo_root_from(here.parent)
    except RuntimeError as e:
        print(e, file=sys.stderr)
        sys.exit(1)
    arch = root / "archetypes.json"
    if not arch.is_file():
        print(f"archetypes.json not found at {arch}", file=sys.stderr)
        sys.exit(1)
    app = ArchetypesFlagApp(arch)
    app.run()


if __name__ == "__main__":
    main()
