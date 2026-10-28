import json
import unittest
from pathlib import Path

from pf_pipeline import run


ROOT = Path(__file__).resolve().parents[1]
CASES = ROOT / "data" / "gigel" / "cases"


class PfPipelineTests(unittest.TestCase):
    def test_clean_case_has_no_flags(self):
        result = run(CASES / "case_0001_pf_gigel_curat")
        self.assertEqual(result["flags"], [])
        self.assertEqual(result["risk_draft"]["level"], "low")
        self.assertIsNone(result["decision"])

    def test_altered_case_contains_expected_flags(self):
        case_dir = CASES / "case_0006_pf_gigel_fluturas_talcioc"
        result = run(case_dir)
        produced = {flag["rule_id"] for flag in result["flags"]}
        expected = {flag["rule_id"] for flag in json.loads((case_dir / "expected_flags.json").read_text())}
        self.assertTrue(expected <= produced)
        self.assertIn("R-PF-015", produced)
        self.assertEqual(result["risk_draft"]["level"], "critical")
        self.assertIsNone(result["decision"])


if __name__ == "__main__":
    unittest.main()
