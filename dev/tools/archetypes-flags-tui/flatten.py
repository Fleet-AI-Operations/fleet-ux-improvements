"""Discover boolean fields in archetypes.json and build stable jq paths."""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any, List


@dataclass
class BooleanRow:
    """One editable boolean in archetypes.json."""

    path: List[str | int]
    original: bool
    search_blob: str
    label: str

    @property
    def path_tuple(self) -> tuple:
        return tuple(self.path)

    def patch_entry(self, value: bool) -> dict:
        return {"op": "set_boolean", "path": list(self.path), "value": value}


def _flatten(data: dict[str, Any]) -> List[BooleanRow]:
    rows: List[BooleanRow] = []

    for key, val in data.items():
        if isinstance(val, bool):
            rows.append(
                BooleanRow(
                    path=[key],
                    original=val,
                    search_blob=" ".join(
                        ["global", key, str(val).lower()]
                    ).lower(),
                    label=f"global  |  {key}",
                )
            )

    logs = data.get("logs")
    if isinstance(logs, dict):
        for lk, lv in logs.items():
            if isinstance(lv, bool):
                rows.append(
                    BooleanRow(
                        path=["logs", lk],
                        original=lv,
                        search_blob=" ".join(
                            ["logs", lk, str(lv).lower()]
                        ).lower(),
                        label=f"logs  |  {lk}",
                    )
                )

    for bucket, key in (
        ("corePlugins", "corePlugins"),
        ("devPlugins", "devPlugins"),
    ):
        arr = data.get(key)
        if not isinstance(arr, list):
            continue
        for i, plugin in enumerate(arr):
            if not isinstance(plugin, dict):
                continue
            pname = str(plugin.get("name", ""))
            pver = str(plugin.get("version", ""))
            for pk, pv in plugin.items():
                if isinstance(pv, bool):
                    rows.append(
                        BooleanRow(
                            path=[key, i, pk],
                            original=pv,
                            search_blob=" ".join(
                                [bucket, pname, pver, pk, str(pv).lower()]
                            ).lower(),
                            label=f"{bucket}[{i}]  |  {pname}@{pver}  |  {pk}",
                        )
                    )

    archs = data.get("archetypes")
    if isinstance(archs, list):
        for ai, arch in enumerate(archs):
            if not isinstance(arch, dict):
                continue
            aid = str(arch.get("id", ""))
            aname = str(arch.get("name", ""))
            plugins = arch.get("plugins")
            if not isinstance(plugins, list):
                continue
            for pi, plugin in enumerate(plugins):
                if not isinstance(plugin, dict):
                    continue
                pname = str(plugin.get("name", ""))
                pver = str(plugin.get("version", ""))
                for pk, pv in plugin.items():
                    if isinstance(pv, bool):
                        rows.append(
                            BooleanRow(
                                path=["archetypes", ai, "plugins", pi, pk],
                                original=pv,
                                search_blob=" ".join(
                                    [
                                        aid,
                                        aname,
                                        pname,
                                        pver,
                                        pk,
                                        str(pv).lower(),
                                    ]
                                ).lower(),
                                label=f"{aid}  |  {pname}@{pver}  |  {pk}",
                            )
                        )

    return rows


def load_archetypes(path: Path) -> tuple[dict[str, Any], List[BooleanRow]]:
    text = path.read_text(encoding="utf-8")
    data = json.loads(text)
    if not isinstance(data, dict):
        raise ValueError("archetypes.json must be a JSON object")
    return data, _flatten(data)
