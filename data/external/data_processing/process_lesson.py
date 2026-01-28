#!/usr/bin/env -S uv run
# /// script
# requires-python = ">=3.11"
# dependencies = [
#     "langchain>=0.3.0",
#     "langchain-openai>=0.2.0",
#     "python-dotenv>=1.0.0",
# ]
# ///
"""
Process a Genki lesson vocabulary file using LangChain and OpenAI API.

Usage:
    uv run process_lesson.py <lesson_number>

Example:
    uv run process_lesson.py 1
    uv run process_lesson.py 01
"""

import argparse
import csv
import json
import os
import sys
from pathlib import Path

from dotenv import load_dotenv
from langchain_openai import ChatOpenAI
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import JsonOutputParser


# Paths relative to this script
SCRIPT_DIR = Path(__file__).parent
PROJECT_ROOT = SCRIPT_DIR.parent.parent.parent
PROCESSED_DIR = SCRIPT_DIR.parent / "processed"
SCHEMA_PATH = PROJECT_ROOT / "data" / "vocab_schema.json"
OUTPUT_CSV = PROJECT_ROOT / "data" / "vocab.csv"


def parse_lesson_arg(lesson_arg: str) -> list[str]:
    """Parse lesson argument into list of 2-digit lesson numbers.

    Supports: "1", "01", "1-5", "01-12"
    """
    if "-" in lesson_arg:
        start, end = lesson_arg.split("-", 1)
        start_num = int(start)
        end_num = int(end)
        return [str(n).zfill(2) for n in range(start_num, end_num + 1)]
    else:
        return [lesson_arg.zfill(2)]


def load_schema() -> dict:
    """Load the vocabulary schema from JSON file."""
    with open(SCHEMA_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


def load_lesson_vocab(lesson_num: str) -> list[dict]:
    """Load vocabulary from a lesson CSV file."""
    lesson_file = PROCESSED_DIR / f"genki_vocab_L{lesson_num}.csv"
    if not lesson_file.exists():
        raise FileNotFoundError(f"Lesson file not found: {lesson_file}")

    vocab_items = []
    with open(lesson_file, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            vocab_items.append(row)
    return vocab_items


def create_batch_prompt_template(schema: dict) -> ChatPromptTemplate:
    """Create the LangChain prompt template for batch vocab processing."""

    # Extract relevant schema info for the prompt
    columns_info = json.dumps(schema["columns"], ensure_ascii=False, indent=2)
    verb_exceptions = json.dumps(schema["verb_exceptions"], ensure_ascii=False, indent=2)
    irregular_verbs = json.dumps(schema["irregular_verbs"], ensure_ascii=False, indent=2)

    template = """You are a Japanese language expert. Given a list of Japanese vocabulary words, generate complete flashcard entries for ALL of them according to the schema.

## Schema for output columns:
{columns_info}

## Verb exceptions (look like Ru-verbs but conjugate as U-verbs):
{verb_exceptions}

## Irregular verbs:
{irregular_verbs}

## Input vocabulary items:
{vocab_items_json}

## Instructions:
1. Process EVERY item in the list above
2. Determine the correct Part of Speech from these options: Noun, Noun (Suru), U-Verb (Trans), U-Verb (Intrans), Ru-Verb (Trans), Ru-Verb (Intrans), Irregular, I-Adjective, Na-Adjective, Adverb, Phrase, Location, Time
3. Map the Japanese 品詞 to the English Part of Speech:
   - n. = Noun (check if it can take する to become Noun (Suru))
   - v. / v1 / v5 = Verb (determine U-Verb vs Ru-Verb, Trans vs Intrans)
   - い-adj / i-adj = I-Adjective
   - な-adj / na-adj = Na-Adjective
   - adv. = Adverb
   - exp. = Phrase
   - suf. = usually Noun or Phrase
4. Generate all conjugated forms according to the patterns in the schema
5. For non-conjugating words (Adverb, Phrase, Location, Time), use "-" for conjugation fields

Return a JSON array where each object has exactly these keys:
- kanji: The word in kanji (or katakana for loanwords, hiragana if no kanji)
- reading: The phonetic reading in hiragana/katakana
- english: English translation
- pos: Part of Speech (from the allowed values)
- polite: Polite/masu-form
- te_form: Te-form
- negative: Short negative (nai-form)
- past: Short past (ta-form)
- notes: Usage notes (optional, can be empty string)

Return ONLY a valid JSON array, no other text. The array must have the same number of items as the input."""

    return ChatPromptTemplate.from_messages([
        ("system", "You are a Japanese language expert specializing in grammar and conjugation."),
        ("human", template)
    ]).partial(
        columns_info=columns_info,
        verb_exceptions=verb_exceptions,
        irregular_verbs=irregular_verbs
    )


def process_vocab_batch(llm, prompt_template, parser, items: list[dict]) -> list[dict]:
    """Process a batch of vocabulary items through the LLM."""

    # Prepare items for the prompt
    vocab_list = []
    for item in items:
        word_kana = item.get("単語", "")
        kanji_form = item.get("漢字表記", "") or word_kana
        pos_japanese = item.get("品詞", "")
        english = item.get("英訳", "")

        vocab_list.append({
            "word_kana": word_kana,
            "kanji_form": kanji_form,
            "pos_japanese": pos_japanese,
            "english": english
        })

    vocab_items_json = json.dumps(vocab_list, ensure_ascii=False, indent=2)

    chain = prompt_template | llm | parser

    result = chain.invoke({"vocab_items_json": vocab_items_json})

    return result


class VocabCSVWriter:
    """Handles incremental writing to vocab.csv with duplicate detection."""

    FIELDNAMES = [
        "Kanji", "Reading (Kana)", "English", "Part of Speech",
        "Polite (Masu-form)", "Te-form", "Short Negative (Nai)",
        "Short Past (Ta)", "Usage/Notes"
    ]

    def __init__(self):
        self.existing_entries = set()
        self.added_count = 0
        self.skipped_count = 0
        self._ensure_header()
        self._load_existing()

    def _ensure_header(self):
        """Ensure CSV file exists with header."""
        if not OUTPUT_CSV.exists() or OUTPUT_CSV.stat().st_size == 0:
            with open(OUTPUT_CSV, "w", encoding="utf-8", newline="") as f:
                writer = csv.DictWriter(f, fieldnames=self.FIELDNAMES)
                writer.writeheader()

    def _load_existing(self):
        """Load existing entries for duplicate detection."""
        with open(OUTPUT_CSV, "r", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for row in reader:
                key = (row.get("Kanji", ""), row.get("Reading (Kana)", ""))
                self.existing_entries.add(key)

    def write_entries(self, entries: list[dict]):
        """Append entries to CSV immediately."""
        with open(OUTPUT_CSV, "a", encoding="utf-8", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=self.FIELDNAMES)

            for entry in entries:
                key = (entry.get("kanji", ""), entry.get("reading", ""))
                if key in self.existing_entries:
                    self.skipped_count += 1
                    continue

                row = {
                    "Kanji": entry.get("kanji", ""),
                    "Reading (Kana)": entry.get("reading", ""),
                    "English": entry.get("english", ""),
                    "Part of Speech": entry.get("pos", ""),
                    "Polite (Masu-form)": entry.get("polite", ""),
                    "Te-form": entry.get("te_form", ""),
                    "Short Negative (Nai)": entry.get("negative", ""),
                    "Short Past (Ta)": entry.get("past", ""),
                    "Usage/Notes": entry.get("notes", "")
                }
                writer.writerow(row)
                self.existing_entries.add(key)
                self.added_count += 1

    def summary(self) -> str:
        return f"Added {self.added_count} entries, skipped {self.skipped_count} duplicates"


def main():
    parser = argparse.ArgumentParser(
        description="Process Genki lesson vocabulary using LangChain and OpenAI"
    )
    parser.add_argument(
        "lesson",
        type=str,
        help="Lesson number or range (e.g., 1, 01, 1-5, 01-12)"
    )
    parser.add_argument(
        "--model",
        type=str,
        default="gpt-5-mini",
        help="OpenAI model to use (default: gpt-5-mini)"
    )
    parser.add_argument(
        "--batch-size",
        type=int,
        default=20,
        help="Number of items to process per API call (default: 20)"
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Process items but don't write to CSV"
    )

    args = parser.parse_args()

    # Load .env file (checks script dir, then project root)
    load_dotenv(SCRIPT_DIR / ".env")
    load_dotenv(PROJECT_ROOT / ".env")

    # Check for API key
    if not os.environ.get("OPENAI_API_KEY"):
        print("Error: OPENAI_API_KEY environment variable not set")
        sys.exit(1)

    # Parse lesson argument
    lesson_nums = parse_lesson_arg(args.lesson)
    print(f"Processing lessons: {', '.join(lesson_nums)}")

    print(f"Loading schema from {SCHEMA_PATH}")
    schema = load_schema()

    # Initialize LangChain components
    llm = ChatOpenAI(model=args.model, temperature=0)
    prompt_template = create_batch_prompt_template(schema)
    json_parser = JsonOutputParser()

    # Initialize CSV writer (unless dry run)
    csv_writer = None if args.dry_run else VocabCSVWriter()
    grand_total_processed = 0
    grand_total_items = 0

    for lesson_num in lesson_nums:
        print(f"\n{'='*50}")
        print(f"Lesson {lesson_num}")
        print('='*50)

        try:
            vocab_items = load_lesson_vocab(lesson_num)
        except FileNotFoundError as e:
            print(f"Skipping: {e}")
            continue

        print(f"Found {len(vocab_items)} vocabulary items")
        grand_total_items += len(vocab_items)

        # Process in batches
        total_batches = (len(vocab_items) + args.batch_size - 1) // args.batch_size
        for batch_num in range(total_batches):
            start_idx = batch_num * args.batch_size
            end_idx = min(start_idx + args.batch_size, len(vocab_items))
            batch = vocab_items[start_idx:end_idx]

            print(f"Processing batch {batch_num + 1}/{total_batches} ({len(batch)} items)...", end=" ", flush=True)

            try:
                results = process_vocab_batch(llm, prompt_template, json_parser, batch)
                grand_total_processed += len(results)

                if args.dry_run:
                    for entry in results:
                        print(f"\n  - {entry.get('kanji')} ({entry.get('reading')}): {entry.get('english')}", end="")
                    print(" ✓")
                else:
                    csv_writer.write_entries(results)
                    print(f"✓ ({len(results)} written)")
            except Exception as e:
                print(f"✗ Error: {e}")
                continue

    print(f"\n{'='*50}")
    print(f"Successfully processed {grand_total_processed}/{grand_total_items} items across {len(lesson_nums)} lesson(s)")
    if csv_writer:
        print(csv_writer.summary())
    print("Done!")


if __name__ == "__main__":
    main()
