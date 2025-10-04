#!/usr/bin/env python3
"""
Markdown to DOCX converter
Usage: python md_to_docx.py <input.md> [output.docx]
"""

import sys
import os
from pathlib import Path

try:
    import pypandoc
except ImportError:
    print("Error: pypandoc not installed")
    print("Install with: pip install pypandoc")
    sys.exit(1)

def convert_md_to_docx(input_file, output_file=None):
    """Convert Markdown file to DOCX"""
    input_path = Path(input_file)

    if not input_path.exists():
        print(f"Error: File not found: {input_file}")
        sys.exit(1)

    if output_file is None:
        output_file = input_path.with_suffix('.docx')

    print(f"Converting {input_file} to {output_file}...")

    try:
        pypandoc.convert_file(
            str(input_path),
            'docx',
            outputfile=str(output_file),
            extra_args=[
                '--reference-doc=reference.docx',  # Optional: custom template
                '--toc',  # Table of contents
            ]
        )
        print(f"✓ Successfully created: {output_file}")
    except Exception as e:
        print(f"Error during conversion: {e}")
        sys.exit(1)

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print("Usage: python md_to_docx.py <input.md> [output.docx]")
        print("\nExamples:")
        print("  python md_to_docx.py docs/시스템_요구사항_검토문서.md")
        print("  python md_to_docx.py docs/시스템_설계_문서.md docs/설계문서_v3.docx")
        sys.exit(1)

    input_file = sys.argv[1]
    output_file = sys.argv[2] if len(sys.argv) > 2 else None

    convert_md_to_docx(input_file, output_file)
