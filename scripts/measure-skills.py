"""Source size comparison; tiktoken 0.12.0, cl100k_base. Not a package dependency.

python3 -m pip install --target .context/tokenizer tiktoken==0.12.0
PYTHONPATH=.context/tokenizer python3 scripts/measure-skills.py
"""
import json
import re
from pathlib import Path

import tiktoken

ROOT = Path(__file__).resolve().parent.parent
ENCODING = tiktoken.get_encoding("cl100k_base")


def size(source):
    return {"lines": len(source.splitlines()), "tokens": len(ENCODING.encode(source))}


def read(path):
    return (ROOT / path).read_text()


def proposal():
    doc = read("docs/skills.md")
    match = re.search(r"<!-- measure:domain-forma -->\n```lisp\n(.*?)```", doc, re.S)
    if not match:
        raise ValueError("Missing domain macro measurement block")
    return match.group(1)


print(json.dumps({
    "tokenizer": "tiktoken 0.12.0 / cl100k_base",
    "agent_before": size(read("examples/skills/before/SKILL.md")),
    "agent_after_forma": size(read("examples/skills/dispatch.lisp")),
    "agent_after_typescript": size(read("examples/skills/dispatch.ts")),
    "domain_before": size(read("examples/skills/domain-before.lisp")),
    "domain_macro_proposal": size(proposal()),
}, indent=2))
