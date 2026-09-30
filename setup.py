"""Setuptools build hook that bundles the shared data and schema into the wheel."""

from __future__ import annotations

import os
import shutil

from setuptools import setup
from setuptools.command.build_py import build_py as _build_py

ROOT = os.path.dirname(os.path.abspath(__file__))


class build_py(_build_py):
    """Copy the repository's data/ and schema/ into the built package (not the source tree)."""

    def run(self) -> None:
        super().run()
        if self.editable_mode:
            return  # editable installs read ../data directly
        for name in ("data", "schema"):
            src = os.path.join(ROOT, name)
            dst = os.path.join(self.build_lib, "openjlpt", name)
            if os.path.exists(dst):
                shutil.rmtree(dst)
            if os.path.isdir(src):
                shutil.copytree(src, dst)


setup(
    cmdclass={"build_py": build_py},
    packages=["openjlpt"],
    package_data={"openjlpt": ["py.typed"]},
)
