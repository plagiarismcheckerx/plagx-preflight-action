# Plagx Preflight Draft Check

*A free academic writing tool by Plagiarism Checker X.*

**Plagx Preflight Draft Check is a free GitHub Action that checks essays, papers, theses and documentation on every push or pull request.** It checks the word count and structure, matches in-text citations against the reference list, and gives punctuation and basic grammar suggestions, as annotations on the exact line plus a job summary with readability stats.

- **Word count** limits per file, with the reference list excluded
- **Citation check**: APA or MLA citations with no reference entry, and references never cited
- **Punctuation**: unmatched quotes and brackets, double spaces, repeated punctuation
- **Basic grammar**: repeated words, a/an, sentence capitals, common confusions such as "should of"
- **Required headings** such as Introduction and Conclusion
- Runs offline on the runner; your text never leaves it

Works with plain text (`.txt`) and Markdown (`.md`). Powered by [Plagx Preflight](https://github.com/plagiarismcheckerx/plagx-preflight).

**[Try the live demo →](https://plagiarismcheckerx.github.io/plagx-preflight/)**

Developer downloads: [npm](https://www.npmjs.com/package/plagx-preflight) · [Docker Hub](https://hub.docker.com/r/plagiarismcheckerx/plagx-preflight) · [GitLab](https://gitlab.com/plagiarism-checker-x/plagx-preflight) · [GitHub](https://github.com/plagiarismcheckerx/plagx-preflight)

> Plagx Preflight is a free academic writing utility by Plagiarism Checker X. It checks length, structure, references, punctuation and basic grammar, and every result is a suggestion. Plagiarism checking and AI-generated text detection are available in Plagiarism Checker X, linked at the end of this page.

## Usage

Create `.github/workflows/draft-check.yml` in your repository:

```yaml
name: Draft check
on: [push, pull_request]

jobs:
  preflight:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
      - uses: plagiarismcheckerx/plagx-preflight-action@v1
        with:
          files: 'docs/**/*.md'
```

### All options

```yaml
      - uses: plagiarismcheckerx/plagx-preflight-action@v1
        with:
          files: |
            thesis/*.md
            essays/**/*.txt
          min-words: 1500
          max-words: 2000
          style: mla                 # apa (default) or mla
          required-headings: Introduction, Conclusion
          checks: length,references  # default: all except passive-voice
          fail-on: warning           # error (default), warning or never
          summary: true              # add results to the job summary (default: true)
```

| Input | Default | Description |
|---|---|---|
| `files` | required | Files to check, separated by spaces or new lines. Wildcards such as `docs/**/*.md` work. |
| `min-words`, `max-words` | none | Word limits per file (reference list excluded). |
| `style` | `apa` | Citation style to look for: `apa` or `mla`. |
| `required-headings` | none | Headings each file should contain, separated by commas or new lines. |
| `checks` | all except `passive-voice` | Comma-separated: `length`, `references`, `punctuation`, `grammar`, `passive-voice`. |
| `fail-on` | `error` | `error`: fail on errors such as a citation missing from the reference list. `warning`: also on warnings. `never`: report only. |
| `summary` | `true` | Add stats and suggestions to the job summary. |

| Output | Description |
|---|---|
| `files` | Number of files checked |
| `words` | Total words (reference lists excluded) |
| `errors`, `warnings`, `infos` | Number of suggestions at each level |

## What a run shows

- Annotations on the exact line and column, such as `Suggestion: "the the" looks like a repeated word.`; errors and warnings as annotations, info as notices
- A job summary with words, reading time and Flesch reading ease per file, and a collapsible list of suggestions

## Good to know

- Every result is a suggestion, and the grammar rules are deliberately conservative.
- The reference list starts at a heading such as References, Bibliography or Works Cited.

## Development

The action runs the Plagx Preflight library from `lib/` with no install step. To update it from a local copy of [plagx-preflight](https://github.com/plagiarismcheckerx/plagx-preflight):

```bash
npm run sync   # copies ../plagx-preflight/src into lib/
npm test
```

## Plagx Preflight Draft Check - Free Draft & Grammar Checker

An open-source GitHub Action for students, researchers and developers. Check length, structure, citations, punctuation and basic grammar before you submit.

Developed by Plagiarism Checker X.

Plagx Preflight gives writing suggestions; it does not detect plagiarism or AI-generated text. For full document checks, explore [Plagiarism Checker X](https://plagiarismcheckerx.com/?utm_source=plagx-preflight-action) and its [AI Content Detector](https://plagiarismcheckerx.com/ai-content-detector?utm_source=plagx-preflight-action).

## License

MIT © Plagiarism Checker X
