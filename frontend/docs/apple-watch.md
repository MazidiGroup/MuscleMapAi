# Apple Watch companion — build and verification

Voice-assisted strength logging from the wrist, as a Premium feature. This
document is the part that cannot be automated: what to build it on, and what to
check on real hardware before it ships.

## Where the code lives

| Layer | Path | Runs on |
| --- | --- | --- |
| Wire contract, validation | `src/watch/protocol.ts` | both |
| Command rules (the specification) | `src/watch/commands.ts`, `src/watch/session.ts` | phone, ported to watch |
| Entitlement decision | `src/watch/gate.ts` | phone, ported to watch |
| Spoken-name resolution | `src/watch/resolve.ts`, `src/watch/catalogue.ts` | phone |
| Watch outbox | `src/watch/outbox.ts` | ported to watch |
| Exactly-once apply | `src/watch/apply.ts`, `src/watch/bridge.ts` | phone |
| Snapshot out / merge in | `src/watch/snapshot.ts` | both |
| Ledger persistence | `src/watch/store.ts` (`watchSync` domain) | phone |
| iPhone link | `modules/watch-link/` (local Expo module) | phone |
| watchOS app | `targets/watch/*.swift` | watch |
| Xcode target injection | `plugins/withWatchTarget.js` | prebuild |
| iPhone onboarding / status | `app/watch.tsx` | phone |

`src/watch/*.ts` is the specification. `targets/watch/Rules.swift` is a port of
it, kept structurally identical, and `__tests__/watchParity.test.ts` fails the
build if a shared constant, event name or refusal reason drifts between them.

## Building it

The project is managed Expo — there is no `ios/` directory in the repository, so
the watch target is created at prebuild time by `plugins/withWatchTarget.js`.

```bash
npx expo prebuild -p ios --clean
```

Then open `ios/*.xcworkspace`. You should see a `MuscleMapWatch` target, with
`SDKROOT = watchos`, `TARGETED_DEVICE_FAMILY = 4`, and an **Embed Watch Content**
phase on the iPhone target.

**This has never been run.** It was written on Windows, with no macOS, no Xcode
and no generated project anywhere in reach. Treat the first prebuild as the real
review of the plugin, not as a formality. Known places to look first:

- the watch target's `productType` — the plugin sets the modern single-target
  application type after `xcode` writes the older `watchapp2` one;
- the `MuscleMapWatch` group placement in the project navigator;
- whether `expo-modules-autolinking` picked up `modules/watch-link`
  (`WatchLinkModule` should appear in the generated `ExpoModulesProvider.swift`).

### Signing and App Store Connect — not doable from the repository

1. Register the App ID `com.mazidigroup.apexai.watchkitapp` in the Apple Developer
   portal, as a child of the existing `com.mazidigroup.apexai`.
2. Create or regenerate the provisioning profile for it. EAS will do this on
   `eas build -p ios` with a credentials source that can see the new App ID.
3. Add the watch app to the existing App Store Connect record. A watch app is
   part of the iOS app's record — it is not a separate submission.
4. Watch App Store screenshots are required at submission.

## What to verify on hardware

A simulator is not sufficient sign-off for any of the following. Watch
Connectivity, Siri phrase resolution and haptics all behave differently there.

### Pairing and entitlement

1. Sign in on a **Premium** account, open the iPhone app once, then open the
   watch app. It should show the workout screen, not the locked screen.
2. Sign in on a **non-Premium** account. The watch shows the locked screen with a
   preview of what the feature does; the buttons must not log anything.
3. With a non-Premium account, try each of the six Siri phrases. Every one must
   refuse. This is the check that matters most — the watch UI being locked proves
   nothing about Siri, and gating in the views alone would leave Shortcuts open.
4. Start a workout on iPhone as a **non-Premium** user, then open the watch. A
   session existing must not unlock it (iPhone logging is free).

### Voice

Say each of these with the watch raised, then check the iPhone's Workout tab:

| Say | Expect |
| --- | --- |
| "Start my workout in Muscle Map" | Session begins; the app opens |
| "Log 8 reps in Muscle Map" | Set logged at the weight already shown; spoken confirmation names the exercise, reps and load |
| "Log 8 reps at 85 kilograms" | Working weight becomes 85 kg **and** the set is logged, as one action |
| "Change the weight to 85 kilograms" | Weight changes; no set is created |
| "Next exercise in Muscle Map" | Moves on; the weight resets rather than carrying over |
| "Undo my last set in Muscle Map" | Siri asks for confirmation first; only then is the set removed |
| "End my workout in Muscle Map" | Workout is saved and appears in iPhone History |

Also check the failure paths, which are the point of the design:

- say a rep count you know is out of range ("log two hundred and fifty reps") —
  it must refuse and **not** create a set;
- say an exercise name that matches two catalogue entries ("press") — it must ask
  which one, and create nothing until you answer.

### Units

- Set the iPhone to **pounds**, say "log 5 reps at 100 kilograms". The watch
  should show 220 lb and the iPhone should store 220 lb. If it shows 100 lb, the
  conversion has been replaced by a relabel.
- Set the iPhone to **kilograms** and repeat with pounds spoken.
- Change the unit preference on the iPhone mid-session and confirm the watch
  follows within a few seconds.

### Offline and recovery

This is the section that justifies the whole event design.

1. Put the iPhone in Airplane Mode, or leave it in another room.
2. Record a complete workout on the watch — several exercises, several sets, one
   undo, one edit — and end it.
3. The watch should show "n sets waiting to sync" throughout and never refuse a
   set for being offline.
4. Bring the iPhone back. The workout must appear in History **exactly once**,
   with every set, in the right order, dated from when it was performed and not
   from when it synced.
5. Repeat, and this time force-quit the iPhone app halfway through the sync. The
   remaining events must still land, and the ones already applied must not
   duplicate.
6. Repeat, and this time force-quit the **watch** app after logging a set but
   before it syncs. The set must survive the relaunch.

### Haptics and accessibility

- Every logged set gives a success haptic; every refusal gives a distinct one.
- Turn VoiceOver on. The weight and reps controls must be adjustable with the
  rotor, and the confirmation line must be announced.
- Set the largest accessibility text size. Nothing on the workout screen should
  clip.

### Entitlement expiry mid-session

With a sandbox subscription:

1. Start a workout on the watch while Premium is active.
2. Let the subscription lapse (or sign out on the iPhone) during the session.
3. The session must continue to the end. The **next** session must be gated.

## Privacy

No audio is captured and no transcript is stored anywhere. Siri passes typed
parameter values to the App Intent and the app never sees speech. The App Intent
adapters contain no validation and no storage — `__tests__/watchParity.test.ts`
asserts that `SFSpeechRecognizer`, `AVAudioRecorder`, `AVAudioEngine` and
`AVAudioSession` appear nowhere in the watch target.

The application-context payload carries only what the watch renders: exercise
ids, names, completed sets, the unit and the entitlement answer. Notes, plan
links and superset markers stay on the phone.
