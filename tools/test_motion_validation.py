"""Contract errors must fail before spending TTS/render time."""
import copy
import json
import subprocess
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


class MotionValidationTest(unittest.TestCase):
    def setUp(self):
        self.episode = json.loads((ROOT / "examples/motion-engine.json").read_text())

    def validate(self, episode):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "episode.json"
            path.write_text(json.dumps(episode, ensure_ascii=False))
            return subprocess.run(["python3", str(ROOT / "tools/validate.py"), str(path)], capture_output=True, text=True)

    def test_example_and_legacy_without_motion(self):
        self.assertEqual(self.validate(self.episode).returncode, 0)
        legacy = copy.deepcopy(self.episode)
        for scene in legacy["scenes"]:
            scene.pop("motion", None)
            scene.pop("transition", None)
            for beat in scene.get("beats", []):
                beat.pop("motion", None)
                beat.pop("transition", None)
        self.assertEqual(self.validate(legacy).returncode, 0)

    def test_invalid_contracts(self):
        invalid = [
            {"actors": {"request-b": {"preset": "recoil", "cue": "missing"}}},
            {"cues": [{"id": "act", "onWord": "ник"}], "actors": {"request-b": {"preset": "transfer", "cue": "act", "to": {"x": 10000, "y": 0}}}},
            {"camera": {"onWord": "несуществует"}},
            {"camera": {"onWord": "ник", "occurrence": 2}},
            {"camera": {"onWord": "ник", "duration": 12}},
            {"camera": {"preset": "unknown"}},
            {"camera": {"target": {"x": 2, "y": 0}}},
            {"camera": {"occurrence": 2}},
            {"cues": [{"id": "act", "onWord": "ник"}, {"id": "act", "onWord": "ник"}]},
        ]
        for plan in invalid:
            with self.subTest(plan=plan):
                episode = copy.deepcopy(self.episode)
                episode["scenes"][0]["beats"][0]["motion"] = plan
                self.assertNotEqual(self.validate(episode).returncode, 0)


if __name__ == "__main__":
    unittest.main()
