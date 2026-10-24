import json
from pathlib import Path
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'tools'))
import webapp


class ProfileBuildTests(unittest.TestCase):
    def read(self, profile):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'profile.json').write_text(json.dumps(profile))
            config = root / 'config.properties'
            config.write_text('home_profile=profile.json\n')
            return webapp.read_config(str(config))

    def test_relative_profile_keeps_exact_app_ids_and_icons(self):
        profile = {'items': [{'id': 'com.example.player', 'icon': 'data:image/png;base64,test'}]}
        self.assertEqual(self.read(profile)['homeProfile'], profile)

    def test_invalid_profile_fails_before_packaging(self):
        for profile in [[], {}, {'items': [None]}, {'items': [{'id': ''}]}, {'items': [{'id': ' player'}]}]:
            with self.subTest(profile=profile), self.assertRaises(SystemExit):
                self.read(profile)


if __name__ == '__main__':
    unittest.main()
