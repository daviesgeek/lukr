"""Renderer contract checks, using only the Python standard library."""

from pathlib import Path
import subprocess
import sys
import tempfile
import unittest


SKILL = Path(__file__).resolve().parents[1]
RENDERER = SKILL / "scripts" / "render_plan.py"


class RendererTests(unittest.TestCase):
    def render(self, fragment: str):
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        work = Path(directory.name)
        source = work / "fragment.html"
        output = work / "nested" / "plan.html"
        source.write_text(fragment, encoding="utf-8")
        result = subprocess.run(
            [sys.executable, str(RENDERER), str(source), "-o", str(output)],
            cwd=work,
            capture_output=True,
            text=True,
        )
        return result, output

    def test_complete_document_from_unrelated_working_directory(self):
        fragment = """<header class="plan-header"><h1>更新 &amp; review</h1></header>
<section><h2>Approach</h2><ol class="steps"><li><h3>Implement</h3>
<p>Update <code>src/index.ts</code>.</p></li></ol></section>
<section><h2>Scope</h2><dl class="facts"><div><dt>Scope</dt><dd>Small</dd></div></dl>
<aside class="callout">Keep the API unchanged.</aside></section>
<section><h2>Validation</h2><details><summary>Checks</summary><h3>Commands</h3>
<pre><code>python3 -m unittest</code></pre><table><caption>Results</caption>
<tr><th>Check</th><th>Result</th></tr><tr><td>Render</td><td>Pass</td></tr>
</table></details></section>"""
        result, output = self.render(fragment)
        self.assertEqual(result.returncode, 0, result.stderr)
        page = output.read_text(encoding="utf-8")
        self.assertTrue(page.startswith("<!doctype html>"))
        self.assertEqual(page.count("<html "), 1)
        self.assertEqual(page.count("<body>"), 1)
        self.assertIn(fragment, page)
        self.assertNotIn("<!-- PLAN_CONTENT -->", page)
        self.assertEqual(page.count("<!-- LUKR_VERSION_SELECTOR -->"), 1)
        self.assertIn('id="lukr-version-slot"', page)

    def test_rejected_fragments_do_not_create_output(self):
        for fragment in (
            "<html><body>Plan</body></html>",
            "<style>p { color: red; }</style>",
            "<script>alert(1)</script>",
            '<p style="color:red">Plan</p>',
            '<link rel="stylesheet" href="custom.css">',
            '<img src="https://example.com/image.png">',
            '<iframe src="other.html"></iframe>',
        ):
            with self.subTest(fragment=fragment):
                result, output = self.render(fragment)
                self.assertNotEqual(result.returncode, 0)
                self.assertIn("invalid plan fragment", result.stderr)
                self.assertFalse(output.exists())


if __name__ == "__main__":
    unittest.main()
