// Siri and Shortcuts.
//
// Every intent is an ADAPTER: it collects typed parameters, hands a
// `WorkoutCommand` to the same store the buttons use, and speaks the outcome.
// No intent contains a rule. That is what makes "voice and touch execute the
// same validated command path" true rather than aspirational — there is only
// one path, and this file cannot reach around it.
//
// Parameters are typed (`Int`, `Double`, an enum for the unit) rather than
// parsed out of a transcript. App Intents resolves and re-asks for a missing or
// unparseable value itself, which is both better at it and, more importantly,
// never produces a confident wrong number.
//
// Nothing here records audio or keeps a transcript. The intent receives values,
// not speech.

import AppIntents
import Foundation

// MARK: - Shared parameter types

enum SpokenWeightUnit: String, AppEnum {
  case kilograms
  case pounds

  static var typeDisplayRepresentation: TypeDisplayRepresentation { "Weight unit" }

  static var caseDisplayRepresentations: [SpokenWeightUnit: DisplayRepresentation] = [
    .kilograms: DisplayRepresentation(title: "kilograms", synonyms: ["kilos", "kg", "kilogram"]),
    .pounds: DisplayRepresentation(title: "pounds", synonyms: ["lbs", "lb", "pound"]),
  ]

  var unit: WeightUnit { self == .kilograms ? .kg : .lb }
}

/// One place that turns a store outcome into something Siri can say, so no
/// intent invents its own phrasing for a refusal.
@MainActor
private func speak(_ outcome: CommandOutcome) throws -> some IntentResult & ProvidesDialog {
  switch outcome {
  case let .applied(_, _, feedback):
    return .result(dialog: IntentDialog(stringLiteral: feedback.message))
  case let .clarify(feedback, _):
    return .result(dialog: IntentDialog(stringLiteral: feedback.message))
  case let .refused(_, feedback):
    return .result(dialog: IntentDialog(stringLiteral: feedback.message))
  }
}

// MARK: - Intents

struct StartWorkoutIntent: AppIntent {
  static var title: LocalizedStringResource = "Start my workout"
  static var description = IntentDescription("Starts a workout you can log from your wrist.")
  /// Opening the app is what makes the result visible and the session
  /// controllable without another command.
  static var openAppWhenRun = true

  @MainActor
  func perform() async throws -> some IntentResult & ProvidesDialog {
    try speak(WatchStore.shared.run(.startWorkout, source: .watchVoice))
  }
}

struct LogSetIntent: AppIntent {
  static var title: LocalizedStringResource = "Log a set"
  static var description = IntentDescription(
    "Records a set against the exercise you are on. Say a weight to change it at the same time.")
  static var openAppWhenRun = false

  // Two SDK constraints, both discovered by compiling:
  //   · the range is typed as the parameter is, and `reps` is an Int (matching
  //     `Number.isInteger(reps)` in protocol.ts), so a (Double, Double) range
  //     does not type-check against `Int.ValueType`;
  //   · `inclusiveRange` is macro-expanded and rejects anything that is not a
  //     compile-time literal, so `WatchLimits.minReps` cannot be named here.
  // The literals are therefore a second copy of the constant, and
  // __tests__/watchParity.test.ts pins them to MIN_REPS/MAX_REPS so the copy
  // cannot drift from the specification.
  @Parameter(title: "Reps", inclusiveRange: (1, 200))
  var reps: Int

  /// Optional: with no weight the set inherits the working weight, which is the
  /// whole point — "log 8 reps" has to be enough.
  @Parameter(title: "Weight")
  var weight: Double?

  @Parameter(title: "Unit")
  var unit: SpokenWeightUnit?

  static var parameterSummary: some ParameterSummary {
    Summary("Log \(\.$reps) reps at \(\.$weight) \(\.$unit)")
  }

  @MainActor
  func perform() async throws -> some IntentResult & ProvidesDialog {
    let store = WatchStore.shared
    var explicit: WeightValue?
    if let weight {
      // With no unit spoken, the number is in the unit the user already uses.
      let resolved = unit?.unit ?? store.snapshot.unit
      explicit = WeightValue(value: weight, unit: resolved)
    }
    return try speak(store.run(.logSet(reps: reps, weight: explicit, warmup: false), source: .watchVoice))
  }
}

struct SetWeightIntent: AppIntent {
  static var title: LocalizedStringResource = "Change the weight"
  static var description = IntentDescription("Sets the load the next set will use.")
  static var openAppWhenRun = false

  @Parameter(title: "Weight")
  var weight: Double

  @Parameter(title: "Unit")
  var unit: SpokenWeightUnit?

  static var parameterSummary: some ParameterSummary {
    Summary("Change the weight to \(\.$weight) \(\.$unit)")
  }

  @MainActor
  func perform() async throws -> some IntentResult & ProvidesDialog {
    let store = WatchStore.shared
    let resolved = unit?.unit ?? store.snapshot.unit
    return try speak(
      store.run(.setWeight(WeightValue(value: weight, unit: resolved)), source: .watchVoice))
  }
}

struct NextExerciseIntent: AppIntent {
  static var title: LocalizedStringResource = "Next exercise"
  static var description = IntentDescription("Moves to the next exercise in this workout.")
  static var openAppWhenRun = false

  @MainActor
  func perform() async throws -> some IntentResult & ProvidesDialog {
    try speak(WatchStore.shared.run(.nextExercise, source: .watchVoice))
  }
}

struct PreviousExerciseIntent: AppIntent {
  static var title: LocalizedStringResource = "Previous exercise"
  static var description = IntentDescription("Goes back to the previous exercise.")
  static var openAppWhenRun = false

  @MainActor
  func perform() async throws -> some IntentResult & ProvidesDialog {
    try speak(WatchStore.shared.run(.previousExercise, source: .watchVoice))
  }
}

/// Undo asks first. The store answers a bare undo with `needs_confirmation` and
/// no queued change, so the confirmation prompt is the only way through — a
/// misheard "undo" cannot remove a set on its own.
struct UndoLastSetIntent: AppIntent {
  static var title: LocalizedStringResource = "Undo my last set"
  static var description = IntentDescription("Removes the last set you recorded, after confirming.")
  static var openAppWhenRun = false

  @MainActor
  func perform() async throws -> some IntentResult & ProvidesDialog {
    let store = WatchStore.shared
    let asked = store.run(.undoLastSet(confirmed: false), source: .watchVoice)

    if case let .refused(reason, feedback) = asked, reason == .needsConfirmation {
      try await requestConfirmation(result: .result(dialog: IntentDialog(stringLiteral: feedback.message)))
      return try speak(store.run(.undoLastSet(confirmed: true), source: .watchVoice))
    }
    return try speak(asked)
  }
}

struct EndWorkoutIntent: AppIntent {
  static var title: LocalizedStringResource = "End my workout"
  static var description = IntentDescription("Finishes the workout and saves it to your history.")
  static var openAppWhenRun = false

  @MainActor
  func perform() async throws -> some IntentResult & ProvidesDialog {
    try speak(WatchStore.shared.run(.endWorkout, source: .watchVoice))
  }
}

struct PauseWorkoutIntent: AppIntent {
  static var title: LocalizedStringResource = "Pause my workout"
  static var description = IntentDescription("Holds the rest timer until you resume.")
  static var openAppWhenRun = false

  @MainActor
  func perform() async throws -> some IntentResult & ProvidesDialog {
    try speak(WatchStore.shared.run(.pauseWorkout, source: .watchVoice))
  }
}

struct ResumeWorkoutIntent: AppIntent {
  static var title: LocalizedStringResource = "Resume my workout"
  static var description = IntentDescription("Starts the rest timer running again.")
  static var openAppWhenRun = false

  @MainActor
  func perform() async throws -> some IntentResult & ProvidesDialog {
    try speak(WatchStore.shared.run(.resumeWorkout, source: .watchVoice))
  }
}

// MARK: - Shortcuts

/// The phrases Siri offers without the user configuring anything. Every phrase
/// includes the app name because that is what makes an app-specific phrase
/// resolvable at all.
struct MuscleMapShortcuts: AppShortcutsProvider {
  static var appShortcuts: [AppShortcut] {
    AppShortcut(
      intent: StartWorkoutIntent(),
      phrases: [
        "Start my workout in \(.applicationName)",
        "Begin a workout in \(.applicationName)",
      ],
      shortTitle: "Start workout",
      systemImageName: "play.fill")

    AppShortcut(
      intent: LogSetIntent(),
      phrases: [
        "Log a set in \(.applicationName)",
        "Record a set in \(.applicationName)",
      ],
      shortTitle: "Log a set",
      systemImageName: "checkmark")

    AppShortcut(
      intent: SetWeightIntent(),
      phrases: [
        "Change the weight in \(.applicationName)",
        "Set the weight in \(.applicationName)",
      ],
      shortTitle: "Change weight",
      systemImageName: "scalemass")

    AppShortcut(
      intent: NextExerciseIntent(),
      phrases: ["Next exercise in \(.applicationName)"],
      shortTitle: "Next exercise",
      systemImageName: "chevron.right")

    AppShortcut(
      intent: UndoLastSetIntent(),
      phrases: [
        "Undo my last set in \(.applicationName)",
        "Undo that in \(.applicationName)",
      ],
      shortTitle: "Undo last set",
      systemImageName: "arrow.uturn.backward")

    AppShortcut(
      intent: EndWorkoutIntent(),
      phrases: [
        "End my workout in \(.applicationName)",
        "Finish my workout in \(.applicationName)",
      ],
      shortTitle: "End workout",
      systemImageName: "stop.fill")
  }
}
