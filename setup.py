"""Setuptools build hook that bundles the shared data and schema into the wheel."""

from __future__ import annotations

import os
import shutil

from setuptools import find_namespace_packages, setup
from setuptools.command.build_py import build_py as _build_py

ROOT = os.path.dirname(os.path.abspath(__file__))


class build_py(_build_py):
    """Copy root-level data and schema into the openjlpt package before building."""

    def run(self) -> None:
        for name in ("data", "schema"):
            src = os.path.join(ROOT, name)
            dst = os.path.join(ROOT, "openjlpt", name)
            if os.path.exists(dst):
                shutil.rmtree(dst)
            if os.path.isdir(src):
                shutil.copytree(src, dst)
        super().run()


setup(
    cmdclass={"build_py": build_py},
    packages=find_namespace_packages(
        include=["openjlpt"],
        exclude=[
            "openjlpt.data",
            "openjlpt.data.*",
            "openjlpt.schema",
            "openjlpt.schema.*",
        ],
    ),
    package_data={"openjlpt": ["data/**/*", "schema/**/*", "py.typed"]},
)
