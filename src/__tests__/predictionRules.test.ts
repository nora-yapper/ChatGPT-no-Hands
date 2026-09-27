import { describe, expect, it } from "vitest";
import { appendToPrompt, fallbackPredictions, isValidPhrase, isValidWord, phrasesOverlap, selectPredictions } from "@/chat/predictionRules";

describe("prediction rules", () => {
  it("validates words and phrases by shape", () => {
    expect(isValidWord("creativity")).toBe(true);
    expect(isValidWord("two words")).toBe(false);
    expect(isValidWord("")).toBe(false);
    expect(isValidPhrase("for my design portfolio")).toBe(true);
    expect(isValidPhrase("too short")).toBe(false);
    expect(isValidPhrase("this phrase has far too many words in it")).toBe(false);
    expect(isValidPhrase("ends with a period.")).toBe(false);
  });

  it("treats rewordings of one idea as overlapping", () => {
    expect(phrasesOverlap("for my website", "for my personal website")).toBe(true);
    expect(phrasesOverlap("for my design portfolio", "with a minimal visual style")).toBe(false);
  });

  it("picks exactly 4 + 4 diverse, non-repeating candidates and tops up from the fallback", () => {
    const out = selectPredictions(
      {
        words: ["website", "Website", "app", "for a", "portfolio", "portfolio", "logo", "poster"],
        phrases: ["for my website", "for a personal website", "for the website", "with a minimal visual style", "that showcases selected projects", "for a fictional design studio", "for a fictional startup"],
      },
      "Create a",
      fallbackPredictions("Create a"),
    );
    expect(out.words).toEqual(["website", "app", "portfolio", "logo"]);
    expect(out.phrases).toHaveLength(4);
    expect(out.phrases[0]).toBe("for my website");
    expect(out.phrases).not.toContain("for a personal website");
    expect(out.phrases).toContain("with a minimal visual style");
  });

  it("drops candidates that repeat the tail of the prompt", () => {
    const out = selectPredictions({ words: ["website", "site"], phrases: ["website for my portfolio", "with a dark palette"] }, "Create a website", fallbackPredictions("Create a website"));
    expect(out.words[0]).toBe("site");
    expect(out.phrases[0]).toBe("with a dark palette");
    expect(out.words).toHaveLength(4);
    expect(out.phrases).toHaveLength(4);
  });

  it("appends with spacing and capitalises the first word", () => {
    expect(appendToPrompt("", "create")).toBe("Create");
    expect(appendToPrompt("Create", "a website")).toBe("Create a website");
    expect(appendToPrompt("Create a website ", "for my portfolio")).toBe("Create a website for my portfolio");
  });

  it("gives every starter and common prompt verb its own full, valid offline 4 + 4", async () => {
    const { STARTERS } = await import("@/chat/predictionRules");
    const generic = fallbackPredictions("Something completely unrelated");
    for (const p of [...STARTERS, "Outline", "Define", "Describe", "Analyze", "Review", "Identify", "Clarify", "Contrast", "Elaborate"]) {
      const f = fallbackPredictions(p);
      expect(f, p).not.toBe(generic);
      const out = selectPredictions({ words: [], phrases: [] }, p, f);
      expect(out.words, p).toHaveLength(4);
      expect(out.phrases, p).toHaveLength(4);
    }
  });

  it("always has an offline fallback of 4 + 4", () => {
    for (const p of ["What", "Create a website", "Explain how AI affects", "Something completely unrelated to the tables here at all"]) {
      const f = fallbackPredictions(p);
      expect(f.words).toHaveLength(4);
      expect(f.phrases).toHaveLength(4);
    }
  });
});

describe("prompt state", () => {
  it("reconstructs the prompt from segments and undoes only the last one", async () => {
    const { buildPrompt, pushSegment, undoSegment } = await import("@/chat/promptState");
    let s = pushSegment([], { text: "Create", source: "prediction", type: "starter" });
    s = pushSegment(s, { text: "a website for", source: "prediction", type: "phrase" });
    s = pushSegment(s, { text: "  my design portfolio ", source: "keyboard", type: "manual" });
    expect(buildPrompt(s)).toBe("Create a website for my design portfolio");
    expect(s[2]).toMatchObject({ source: "keyboard", type: "manual", text: "my design portfolio" });
    s = undoSegment(s);
    expect(buildPrompt(s)).toBe("Create a website for");
    expect(buildPrompt(undoSegment(undoSegment(s)))).toBe("");
    expect(pushSegment(s, { text: "   ", source: "keyboard", type: "manual" })).toBe(s);
  });
});

describe("compass colours", () => {
  it("uses the first starter's colour for phrases and one random pastel for all words; defaults when typed", async () => {
    const { compassTints, PHRASE_TINT, WORD_TINT } = await import("@/components/ChatNoHands/spatial");
    const { STARTERS } = await import("@/chat/predictionRules");
    const a = compassTints("Create", 1234);
    expect(a.phrase).toBe(STARTERS.indexOf("Create"));
    expect(a.word).not.toBe(a.phrase);
    expect(compassTints("Create", 1234)).toEqual(a); // same choice → same colours for the whole prompt
    const others = new Set(Array.from({ length: 40 }, (_, i) => compassTints("Create", i).word));
    expect(others.size).toBeGreaterThan(1); // a new conversation can get a different word colour
    const typed = compassTints(null, 99);
    expect(typed).toEqual({ phrase: PHRASE_TINT, word: WORD_TINT });
  });
});


describe("streamed prediction lines", () => {
  it("parses W/P lines and tolerates list markers and quotes", async () => {
    const { parseCandidateLine } = await import("@/chat/predictionRules");
    expect(parseCandidateLine("W: essay")).toEqual({ kind: "word", text: "essay" });
    expect(parseCandidateLine("- P: \"a cover letter\"")).toEqual({ kind: "phrase", text: "a cover letter" });
    expect(parseCandidateLine("2. p | the pros and cons")).toEqual({ kind: "phrase", text: "the pros and cons" });
    expect(parseCandidateLine("Here are some options:")).toBeNull();
    expect(parseCandidateLine("W:   ")).toBeNull();
  });

  it("accepts candidates one at a time exactly like the whole-set selection", async () => {
    const { PredictionSelector } = await import("@/chat/predictionRules");
    const candidates = { words: ["website", "site", "Site", "for", "with", "that", "using"], phrases: ["website for my portfolio", "for my design portfolio", "with a dark palette", "that loads fast", "using plain HTML only", "for a bakery"] };
    const sel = new PredictionSelector("Create a website");
    const accepted: string[] = [];
    for (let i = 0; i < 7; i++) {
      const w = candidates.words[i] && sel.offerWord(candidates.words[i]);
      const p = candidates.phrases[i] && sel.offerPhrase(candidates.phrases[i]);
      if (w) accepted.push(w);
      if (p) accepted.push(p);
    }
    expect(sel.result()).toEqual(selectPredictions(candidates, "Create a website"));
    expect(accepted).toHaveLength(sel.words.length + sel.phrases.length); // nothing shown is ever withdrawn
  });
});
