// Phase 3 — media contract: network delivery, honest failure states, reduced
// motion, and no eager loading of the whole catalogue.
import assert from "node:assert/strict";
import test from "node:test";

import {
  MEDIA_UNAVAILABLE,
  altText,
  mediaKind,
  mediaRequestPlan,
  shouldPlay,
  showPoster,
} from "../src/components/mediaState";
import { FULL_CATALOG } from "../src/anatomy/exerciseCatalog";

const base = { variantAutoplays: true, reducedMotion: false, focused: true, failed: false, userPlaying: null };

test("media kind is derived from what the record actually has", () => {
  assert.equal(mediaKind(true, true), "animated");
  assert.equal(mediaKind(true, false), "poster-only");
  assert.equal(mediaKind(false, false), "none", "an absent media field is simply 'none'");
});

test("an exercise with no media never claims to have any", () => {
  assert.equal(shouldPlay({ ...base, kind: "none" }), false);
  assert.equal(showPoster("none", false), false);
});

test("a poster stays visible while the animation is not playing", () => {
  assert.equal(showPoster("animated", false), true);
  assert.equal(showPoster("poster-only", true), true, "a poster-only exercise always shows its poster");
});

test("a failed request stops playback and shows connection wording", () => {
  assert.equal(shouldPlay({ ...base, kind: "animated", failed: true }), false);
  assert.ok(/back online/i.test(MEDIA_UNAVAILABLE));
  assert.ok(!/missing|local asset|reinstall/i.test(MEDIA_UNAVAILABLE));
  assert.ok(/details, search and filters still work/i.test(MEDIA_UNAVAILABLE), "catalogue usability is stated first");
});

test("an invalid URL, an HTTP error and an offline request are the same user-visible state", () => {
  for (const _reason of ["invalid-url", "http-500", "offline"]) {
    assert.equal(shouldPlay({ ...base, kind: "animated", failed: true }), false);
  }
  // and it never leaks the reason or the URL
  assert.ok(!/https?:|\/media\/|\.mp4/.test(MEDIA_UNAVAILABLE));
});

test("Reduce Motion never autoplays, but an explicit Play still works", () => {
  assert.equal(shouldPlay({ ...base, kind: "animated", reducedMotion: true }), false);
  assert.equal(shouldPlay({ ...base, kind: "animated", reducedMotion: true, userPlaying: true }), true);
  assert.equal(shouldPlay({ ...base, kind: "animated" }), true, "motion is fine when Reduce Motion is off");
});

test("playback stops when the screen is no longer active", () => {
  assert.equal(shouldPlay({ ...base, kind: "animated", focused: false }), false);
  assert.equal(shouldPlay({ ...base, kind: "animated", focused: false, userPlaying: true }), false);
});

test("list thumbnails never autoplay", () => {
  assert.equal(shouldPlay({ ...base, kind: "animated", variantAutoplays: false }), false);
});

test("an explicit pause survives a re-render", () => {
  assert.equal(shouldPlay({ ...base, kind: "animated", userPlaying: false }), false);
});

test("only the rows a list renders request media", () => {
  const all = FULL_CATALOG.map((e) => e.id);
  const visible = all.slice(0, 12);
  const plan = mediaRequestPlan(visible, all);
  assert.equal(plan.length, 12, `requested ${plan.length} of ${all.length}`);
  assert.ok(plan.length < all.length / 10, "no eager load of the whole catalogue");
  assert.deepEqual(plan, visible, "and each request belongs to the row that asked for it");
});

test("a recycled row cannot show another exercise's media", () => {
  const all = ["a", "b", "c"];
  assert.deepEqual(mediaRequestPlan(["c"], all), ["c"]);
  assert.deepEqual(mediaRequestPlan([], all), [], "a row with no visible id requests nothing");
});

test("alternative text is meaningful and based on the real exercise name", () => {
  assert.equal(altText("Barbell Bench Press"), "Barbell Bench Press demonstration");
  assert.equal(altText(undefined), "Exercise demonstration");
});
