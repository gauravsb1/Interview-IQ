import sys
import unittest
from types import ModuleType, SimpleNamespace
from unittest.mock import Mock, patch

import intelligence


class TranscriptionTests(unittest.TestCase):
    def test_missing_word_timestamps_do_not_break_the_transcript(self):
        words = [
            SimpleNamespace(start=None, end=None),
            SimpleNamespace(start=0.2, end=0.7),
            SimpleNamespace(start=1.5, end=2.0),
        ]

        metrics = intelligence._speech_metrics("Hello there", 4.0, words)

        self.assertEqual(metrics["speakingRate"], 30)
        self.assertEqual(metrics["pauses"], 1)
        self.assertEqual(metrics["silenceDuration"], 3.0)

    def test_transcription_accepts_recordings_longer_than_five_minutes(self):
        model = Mock()
        model.transcribe.return_value = (
            iter([SimpleNamespace(text=" A long answer. ", words=[])]),
            SimpleNamespace(duration=360.0),
        )
        fake_module = ModuleType("faster_whisper")
        fake_module.WhisperModel = object

        with patch.dict(sys.modules, {"faster_whisper": fake_module}), patch.object(
            intelligence, "_whisper", model
        ):
            result = intelligence.transcribe_audio("recording.webm")

        self.assertEqual(result["text"], "A long answer.")
        self.assertEqual(result["duration"], 360.0)
        model.transcribe.assert_called_once_with("recording.webm", word_timestamps=True, vad_filter=False)

    def test_word_alignment_failure_falls_back_to_plain_transcription(self):
        model = Mock()
        model.transcribe.side_effect = [
            TypeError("word alignment failed"),
            (iter([SimpleNamespace(text=" Spoken answer. ", words=None)]), SimpleNamespace(duration=54.0)),
        ]
        fake_module = ModuleType("faster_whisper")
        fake_module.WhisperModel = object

        with patch.dict(sys.modules, {"faster_whisper": fake_module}), patch.object(
            intelligence, "_whisper", model
        ):
            result = intelligence.transcribe_audio("recording.webm")

        self.assertEqual(result["text"], "Spoken answer.")
        self.assertEqual(result["duration"], 54.0)
        self.assertEqual(model.transcribe.call_count, 2)
        model.transcribe.assert_called_with("recording.webm", vad_filter=False)


if __name__ == "__main__":
    unittest.main()
