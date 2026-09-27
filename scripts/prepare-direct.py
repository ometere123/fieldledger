#!/usr/bin/env python3
"""Adapt the v0.6 RC6 GenVM bundle cache for gltest 0.29 Direct Mode.
No contract code or VM implementation is modified. Requires the real v0.6 bundle.
"""
from pathlib import Path
import os, zipfile, sys
cache=Path(os.environ.get('GLTEST_DIRECT_CACHE',Path.home()/'.cache/gltest-direct'))
version='v0.6.0-rc6'
bundle=Path(os.environ.get('GENVM_BUNDLE',cache/'bundles-v2'/f'genvm-universal-{version}.tar.xz'))
if not bundle.is_file():
    sys.exit(f'Missing v0.6 RC6 bundle: {bundle}. Install the matching GenVM/gltest release or set GENVM_BUNDLE.')
legacy=cache/f'genvm-universal-{version}.tar.xz'
if not legacy.exists():legacy.symlink_to(bundle.resolve())
for kind,digest in [('py-genlayer','5jycge4q8k23462jtb0b9fyey1s9qz928sz2nbrd9mg4sxqg2qng'),('py-lib-genlayer-std','kzr02ndm9et4qkmbqpq5djjt5sme2yt76n7sz1qbzax0knt6mam0')]:
    target=cache/'extracted'/version/kind/digest
    if target.exists():continue
    source=cache/'extracted'/'local'/kind/digest
    target.parent.mkdir(parents=True,exist_ok=True)
    if source.is_dir():target.symlink_to(source.resolve());continue
    archive=cache/'trees-v2'/version/'runners'/kind/digest[:2]/(digest[2:]+'.zip')
    if not archive.is_file():sys.exit(f'Missing SDK runner {digest}: {archive}')
    target.mkdir()
    with zipfile.ZipFile(archive) as z:z.extractall(target)
print('Prepared real v0.6 runner and standard library for Direct Mode:',version)
