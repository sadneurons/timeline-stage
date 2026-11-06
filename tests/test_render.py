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


def test_invalid_timeline_fails_with_path(tmp_path):
    import shutil
    shutil.copytree(EX, tmp_path / "ex", ignore=shutil.ignore_patterns("_site", ".quarto", "index_files"))
    y = (tmp_path / "ex" / "timeline.yml").read_text().replace("b: b77@2026", "b: nobody@2026")
    (tmp_path / "ex" / "timeline.yml").write_text(y)
    r = subprocess.run(["quarto", "render", "index.qmd"], cwd=tmp_path / "ex", capture_output=True, text=True)
    assert r.returncode != 0 and 'crossings[2]: unknown id "nobody"' in (r.stderr + r.stdout)


def test_example_exercises_every_feature():
    src = (EX / "index.qmd").read_text()
    data = (EX / "timeline.yml").read_text()
    for s in ['colours="false"', 'ends="false"', 'dim="true"', 'side=above', 'side=mid', 'side=below',
              'align=right', '.cover', 'forks-on', 'meets:', 'strands:']:
        assert s in src or s in data, s


def test_event_end_flag_survives_and_bad_dates_are_reported(tmp_path):
    import shutil
    html = render()
    data = html.split('id="stage-data">')[1].split("</script>")[0].replace(" ", "")
    assert '"id":"turing-dies"' in data and '"end":true' in data
    shutil.copytree(EX, tmp_path / "ex", ignore=shutil.ignore_patterns("_site", ".quarto", "index_files"))
    y = (tmp_path / "ex" / "timeline.yml").read_text().replace("start: 1948-06-21", "start: June 1948", 1)
    (tmp_path / "ex" / "timeline.yml").write_text(y)
    r = subprocess.run(["quarto", "render", "index.qmd"], cwd=tmp_path / "ex", capture_output=True, text=True)
    assert r.returncode != 0 and 'lines[0]: start "June 1948" is not a year or ISO date' in (r.stderr + r.stdout)


def test_theme_tokens_for_panels():
    css = (pathlib.Path(__file__).parent.parent / "_extensions/timeline-stage/plugin/stage.css").read_text()
    assert "--stage-panel" in css and "background: rgba(255, 255, 255" not in css
