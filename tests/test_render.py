import pathlib
import re
import subprocess

EX = pathlib.Path(__file__).parent.parent / "example"


def render():
    subprocess.run(["quarto", "render", "index.qmd"], cwd=EX, check=True, capture_output=True)
    return (EX / "_site" / "index.html").read_text()


def test_data_embedded_once_and_converted():
    html = render()
    assert html.count('id="stage-data"') == 1
    data = html.split('id="stage-data">')[1].split("</script>")[0].replace(" ", "")
    assert '"start":1949.44' in data  # 1949-06-09 converted
    assert '"span":[1945,2045]' in data


def test_stage_sections_and_overlays():
    html = render()
    assert re.search(r'<section[^>]*class="[^"]*\bstage\b[^"]*"[^>]*data-transition="none"', html)
    assert re.search(r'<div class="pin side-below[^"]*" data-year="1965"', html)
    assert re.search(r'<div class="cover tone-dark[^"]*"', html)
