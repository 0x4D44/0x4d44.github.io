"""Tests for model-zoo/tools/stories.py. Run from the worktree root:
python3 -m unittest model-zoo/tests/test_stories.py
"""
import importlib.util
import json
import os
import re
import tempfile
import unittest

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
_spec = importlib.util.spec_from_file_location(
    "stories", os.path.join(os.path.dirname(HERE), "tools", "stories.py"))
S = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(S)


class Metrics(unittest.TestCase):
    def test_tokenize(self):
        self.assertEqual(S.tokenize("Don’t STOP, it's 3 o'clock!"),
                         ["don't", "stop", "it's", "o'clock"])

    def test_ttr_and_mattr(self):
        self.assertAlmostEqual(S.ttr(["a", "a", "b", "c"]), 0.75)
        # windows of 2 over a a b c: (a a)=0.5, (a b)=1, (b c)=1 -> 2.5/3
        self.assertAlmostEqual(S.mattr(["a", "a", "b", "c"], window=2), 2.5 / 3)
        # shorter than window falls back to plain TTR
        self.assertAlmostEqual(S.mattr(["a", "a"], window=50), 0.5)

    def test_distinct_n(self):
        t = [["a", "b", "a", "b"]]
        self.assertAlmostEqual(S.distinct_n(t, 1), 0.5)       # a,b / 4
        self.assertAlmostEqual(S.distinct_n(t, 2), 2 / 3)     # ab,ba,ab
        self.assertAlmostEqual(S.distinct_n(t + [["a", "b"]], 2), 2 / 4)  # pooled

    def test_jaccard_and_self_overlap(self):
        self.assertAlmostEqual(S.jaccard({1, 2, 3}, {2, 3, 4}), 0.5)
        self.assertEqual(S.jaccard({1}, {2}), 0.0)
        # trigram sets: {abc,bcd}, {bcd,cde}, {xyz}: pairs 1/3, 0, 0 -> 1/9
        docs = [list("abcd"), list("bcde"), list("xyz")]
        self.assertAlmostEqual(S.self_overlap(docs), 1 / 9)

    def test_yule_k(self):
        # a a b c: n=4, sum f^2 = 6 -> 10000 * 2 / 16
        self.assertAlmostEqual(S.yule_k(["a", "a", "b", "c"]), 1250.0)
        self.assertEqual(S.yule_k(["a", "b", "c"]), 0.0)

    def test_mtld_forward_partial_factor(self):
        # a b a c d e c, threshold 0.72.
        # a=1.0, ab=1.0, aba=2/3 <= 0.72 -> full factor 1, reset.
        # c=1.0, cd=1.0, cde=1.0, cdec=3/4=0.75 > 0.72, stream ends.
        # partial factor = (1 - 0.75) / (1 - 0.72) = 0.25/0.28 = 0.892857...
        # factors = 1.892857, MTLD forward = 7 / 1.892857 = 3.69811...
        toks = list("abacdec")
        self.assertAlmostEqual(S.mtld_pass(toks), 7 / (1 + 0.25 / 0.28))
        self.assertAlmostEqual(S.mtld_pass(toks), 3.698113, places=5)
        # backward pass of the same text: c e d c a b a
        # c,ce,ced=1.0, cedc=3/4 (no), cedca=4/5=.8, cedcab=5/6, cedcaba=5/7=.714 <= .72
        # -> 1 factor at the very end, no partial: 7/1 = 7
        self.assertAlmostEqual(S.mtld_pass(toks[::-1]), 7.0)
        self.assertAlmostEqual(S.mtld(toks), (3.698113 + 7.0) / 2, places=4)

    def test_mtld_repeated_word_is_low(self):
        # a, aa=0.5 -> a factor every 2 tokens: 20 tokens / 10 factors = 2
        self.assertAlmostEqual(S.mtld(["a"] * 20), 2.0)

    def test_mtld_no_repeats_is_length(self):
        # no factor completes; partial factor is (1-1)/(0.28)=0, so by convention MTLD = length
        toks = ["w%d" % i for i in range(30)]
        self.assertEqual(S.mtld(toks), 30.0)

    def test_mtld_threshold_matters(self):
        toks = list("abacdec")
        self.assertNotAlmostEqual(S.mtld_pass(toks, 0.72), S.mtld_pass(toks, 0.60))

    def test_names(self):
        n = S.names('The day was bright. Marta met Mr Jones on Monday in Paris. "Hello," said Tom.')
        self.assertEqual(n, {"Jones": 1, "Paris": 1, "Tom": 1})

    def test_ai_rate(self):
        toks = ["the", "whisper", "of", "a", "tapestry"] + ["x"] * 995
        self.assertAlmostEqual(S.ai_rate([toks]), 2.0)

    def test_pca(self):
        rng = np.random.default_rng(0)
        x = rng.normal(size=(200, 5)) * np.array([10, 3, 1, 0.5, 0.1]) + 7
        coords, ratio = S.pca2(x)
        self.assertEqual(coords.shape, (200, 2))
        self.assertGreater(coords[:, 0].var(), coords[:, 1].var())
        self.assertGreater(ratio[0], ratio[1])
        self.assertAlmostEqual(abs(coords.mean()), 0.0, places=6)

    def test_spread_and_closest_pair(self):
        v = [[1, 0], [1, 0], [0, 1]]
        self.assertEqual(S.closest_pair(["a", "b", "c"], v)[:2], ("a", "b"))
        self.assertAlmostEqual(S.cos_dist_spread([[1, 0], [1, 0]]), 0.0)
        self.assertGreater(S.cos_dist_spread([[1, 0], [0, 1]]), 0.2)


WP_SENTENCE = ("the lighthouse keeper counted seventeen purple umbrellas drifting past the "
               "window every single tuesday morning without fail")


class EndToEnd(unittest.TestCase):
    def test_no_human_text_in_output(self):
        with tempfile.TemporaryDirectory() as d:
            os.makedirs(os.path.join(d, "human"))
            os.makedirs(os.path.join(d, "embeddings"))
            with open(os.path.join(d, "_models.json"), "w") as f:
                json.dump({"m1": {"provider": "openai"}}, f)
            rows = []
            for i in range(3):
                rows.append({"model": "m1@thinking", "sample": i, "ok": True,
                             "text": "Title %d\n\nZed walked home. It was late and Zed was tired %d." % (i % 2, i)})
            rows.append({"model": "m1@thinking", "sample": 9, "ok": False, "text": ""})
            with open(os.path.join(d, "q33-story.jsonl"), "w") as f:
                f.write("\n".join(json.dumps(r) for r in rows) + "\n{broken json")
            wp = [{"source": "wp", "group": "wp-00", "id": "wp-%d" % i,
                   "text": "Quentin said %s. Then story number %d ended quietly at dawn." % (WP_SENTENCE, i)}
                  for i in range(3)]
            with open(os.path.join(d, "human", "writingprompts.jsonl"), "w") as f:
                f.write("\n".join(json.dumps(r) for r in wp) + "\n")
            gb = [{"group": "Saki", "id": "pg-%d" % i, "text": "Clovis spoke at length number %d." % i}
                  for i in range(2)]
            with open(os.path.join(d, "human", "gutenberg.jsonl"), "w") as f:
                f.write("\n".join(json.dumps(r) for r in gb) + "\n")
            rng = np.random.default_rng(1)
            emb = {"m1@thinking-s0": rng.normal(size=8).tolist(),
                   "m1@thinking-s1": rng.normal(size=8).tolist(),
                   "wp-0": rng.normal(size=8).tolist(), "wp-1": rng.normal(size=8).tolist(),
                   "wp-2": rng.normal(size=8).tolist(), "pg-0": rng.normal(size=8).tolist()}
            with open(os.path.join(d, "embeddings", "stories.json"), "w") as f:
                json.dump(emb, f)

            out = S.build(data_dir=d)
            blob = json.dumps(out)

            words = re.findall(r"[a-z]+", " ".join(r["text"] for r in wp).lower())
            for i in range(len(words) - 7):
                self.assertNotIn(" ".join(words[i:i + 8]), blob.lower())
            for w in ("lighthouse keeper", "umbrellas", "Quentin"):
                self.assertNotIn(w.lower(), blob.lower())

            g = out["groups"]["m1@thinking"]
            self.assertEqual((g["kind"], g["provider"], g["n"]), ("model", "openai", 3))
            self.assertAlmostEqual(g["title_repeat"], 0.6667, places=3)  # Title 0, 1, 0: two repeat
            self.assertEqual(g["names_top"][0], {"name": "Zed", "count": 3})
            self.assertEqual(out["groups"]["wp-00"]["kind"], "writingprompts")
            self.assertIn("names_distinct", out["groups"]["wp-00"])
            self.assertNotIn("names_top", out["groups"]["wp-00"])
            self.assertEqual(out["groups"]["Saki"]["kind"], "gutenberg")
            self.assertEqual(len(out["points"]), 6)
            self.assertIsNone(out["groups"]["Saki"]["spread"])  # only one vector
            self.assertIn("closest_pair", g)
            for k in ("groups", "points", "method", "generated"):
                self.assertIn(k, out)


if __name__ == "__main__":
    unittest.main()
