import SwiftUI

/// Mirrors the web app's `/practice` page: an exercise picker, the exercise's
/// brief and hints, an editable solution, and the results of checking it.
/// Checking runs entirely on-device (see `checkAnswer`) — code is never sent
/// anywhere. Progress persists to `practice_progress` via PostgREST.
struct PracticeView: View {
    @StateObject private var progressStore = PracticeProgressStore()

    @State private var selectedId: String = EXERCISES[0].id
    @State private var drafts: [String: String] = [:]
    @State private var hintsOpened: [String: Set<Int>] = [:]
    @State private var checks: [String: PracticeCheck] = [:]
    @State private var solvedIds: Set<String> = []
    @State private var saveTask: Task<Void, Never>?

    private var exercise: Exercise { getExercise(selectedId) ?? EXERCISES[0] }

    private func draft(for id: String) -> String {
        drafts[id] ?? getExercise(id)?.starterCode ?? ""
    }

    var body: some View {
        HSplitView {
            exercisePicker
                .frame(minWidth: 220, idealWidth: 240, maxWidth: 300)

            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    exerciseHeader
                    hintsSection
                    editorSection
                    actionRow
                    if let check = checks[selectedId] {
                        PracticeResultsView(check: check, isStale: isStale(check))
                    }
                }
                .padding(24)
                .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
        .navigationTitle("Practice")
        .task { await loadProgress() }
    }

    private func isStale(_ check: PracticeCheck) -> Bool {
        draft(for: selectedId).trimmingCharacters(in: .whitespacesAndNewlines) != check.checkedCode.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    // MARK: - Picker

    private var exercisePicker: some View {
        List(EXERCISES, selection: Binding(get: { selectedId }, set: { if let v = $0 { selectedId = v } })) { ex in
            HStack {
                VStack(alignment: .leading, spacing: 4) {
                    Text(ex.title).font(.headline)
                    HStack(spacing: 6) {
                        Text(ex.language.label)
                        difficultyMeter(ex.difficulty)
                    }
                    .font(.caption)
                    .foregroundStyle(.secondary)
                }
                Spacer()
                if solvedIds.contains(ex.id) {
                    Image(systemName: "checkmark.circle.fill").foregroundStyle(.green)
                }
            }
            .tag(ex.id)
        }
        .navigationTitle("Exercises")
    }

    private func difficultyMeter(_ d: ExerciseDifficulty) -> some View {
        HStack(spacing: 2) {
            ForEach(0..<3, id: \.self) { i in
                Circle()
                    .fill(i < d.filledBars ? AnyShapeStyle(.secondary) : AnyShapeStyle(.quaternary))
                    .frame(width: 5, height: 5)
            }
        }
    }

    // MARK: - Header

    private var exerciseHeader: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(exercise.title).font(.largeTitle.bold())
            Text(exercise.description).foregroundStyle(.secondary)
            VStack(alignment: .leading, spacing: 4) {
                Text("Your solution should").font(.headline)
                ForEach(exercise.requirements, id: \.self) { req in
                    Text("\u{2022}  \(req)")
                }
            }
        }
    }

    // MARK: - Hints

    private var hintsSection: some View {
        let opened = hintsOpened[selectedId] ?? []
        return VStack(alignment: .leading, spacing: 6) {
            Text("Hints (\(opened.count) of \(exercise.hints.count) used)").font(.headline)
            ForEach(Array(exercise.hints.enumerated()), id: \.offset) { idx, hint in
                DisclosureGroup(
                    isExpanded: Binding(get: { opened.contains(idx) }, set: { if $0 { openHint(idx) } }),
                    content: { Text(hint).font(.callout).foregroundStyle(.secondary).padding(.vertical, 4) },
                    label: { Text("Hint \(idx + 1)") }
                )
            }
        }
    }

    private func openHint(_ idx: Int) {
        var set = hintsOpened[selectedId] ?? []
        guard !set.contains(idx) else { return }
        set.insert(idx)
        hintsOpened[selectedId] = set
        scheduleSave(immediate: true)
    }

    // MARK: - Editor

    private var editorSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Starter code (for reference)").font(.headline)
            Text(exercise.starterCode)
                .font(.system(.callout, design: .monospaced))
                .padding(8)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(.quaternary, in: RoundedRectangle(cornerRadius: 6))

            Text("Your solution").font(.headline)
            TextEditor(text: Binding(
                get: { draft(for: selectedId) },
                set: { newValue in
                    drafts[selectedId] = newValue
                    scheduleSave(immediate: false)
                }
            ))
            .font(.system(.body, design: .monospaced))
            .frame(height: 220)
            .overlay(RoundedRectangle(cornerRadius: 6).stroke(.quaternary))
        }
    }

    // MARK: - Actions

    private var actionRow: some View {
        let error = validatePracticeSubmission(draft(for: selectedId), starterCode: exercise.starterCode)
        return VStack(alignment: .leading, spacing: 8) {
            HStack {
                Button("Check answer", action: submitCheck).disabled(error != nil)
                Button("Reset to starter code", role: .destructive, action: resetToStarter)
            }
            if let error {
                Text(error).font(.caption).foregroundStyle(.secondary)
            }
        }
    }

    private func submitCheck() {
        let code = draft(for: selectedId)
        guard validatePracticeSubmission(code, starterCode: exercise.starterCode) == nil else { return }
        let trimmed = code.trimmingCharacters(in: .whitespacesAndNewlines)
        let result = checkAnswer(exercise, trimmed)
        checks[selectedId] = result
        if result.verdict == .correct { solvedIds.insert(selectedId) }

        let id = selectedId
        let hints = hintsOpened[id]?.count ?? 0
        saveTask?.cancel()
        saveTask = Task { await progressStore.save(exerciseId: id, draft: code, hintsUsed: hints, verdict: result.verdict) }
    }

    private func resetToStarter() {
        drafts[selectedId] = exercise.starterCode
        checks[selectedId] = nil
    }

    // MARK: - Persistence

    private func loadProgress() async {
        await progressStore.load()
        for (id, row) in progressStore.progress {
            drafts[id] = row.draft
            hintsOpened[id] = Set(0..<row.hintsUsed)
            if row.solvedAt != nil { solvedIds.insert(id) }
        }
    }

    private func scheduleSave(immediate: Bool) {
        saveTask?.cancel()
        let id = selectedId
        let code = draft(for: id)
        let hints = hintsOpened[id]?.count ?? 0
        saveTask = Task {
            if !immediate {
                try? await Task.sleep(nanoseconds: 1_500_000_000)
            }
            guard !Task.isCancelled else { return }
            await progressStore.save(exerciseId: id, draft: code, hintsUsed: hints)
        }
    }
}

private struct PracticeResultsView: View {
    let check: PracticeCheck
    let isStale: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Image(systemName: verdictIcon).foregroundStyle(verdictColor)
                Text(VERDICT_LABELS[check.verdict] ?? "").font(.headline)
            }
            Text(check.summary)
            Text("CodeBuddy read your code and worked out the results from it. Your code was never run, and nothing was sent anywhere.")
                .font(.caption)
                .foregroundStyle(.secondary)

            if isStale {
                Text("You've changed your code since this check. Choose Check answer again to update it.")
                    .font(.caption)
                    .foregroundStyle(.orange)
            }

            if !check.checks.isEmpty {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Requirements").font(.headline)
                    ForEach(check.checks) { c in
                        HStack(alignment: .top, spacing: 8) {
                            Image(systemName: icon(for: c.status)).foregroundStyle(color(for: c.status))
                            VStack(alignment: .leading, spacing: 2) {
                                Text(c.label).bold()
                                if let detail = c.detail {
                                    Text(detail).font(.caption).foregroundStyle(.secondary)
                                }
                            }
                        }
                    }
                }
            }

            if !check.tests.isEmpty {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Test cases").font(.headline)
                    ForEach(check.tests) { t in
                        VStack(alignment: .leading, spacing: 2) {
                            Text(t.label).bold()
                            Text(t.call).font(.system(.caption, design: .monospaced)).foregroundStyle(.secondary)
                            HStack(spacing: 16) {
                                Text("Expected: \(t.expected)")
                                Text("Your code: \(t.actual ?? "Can't tell without running it")")
                            }
                            .font(.caption)
                        }
                        .padding(.bottom, 4)
                    }
                }
            }

            if let hint = check.hint {
                HStack(alignment: .top, spacing: 8) {
                    Image(systemName: "lightbulb")
                    Text(hint)
                }
                .font(.callout)
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(.quaternary, in: RoundedRectangle(cornerRadius: 8))
    }

    private var verdictIcon: String {
        switch check.verdict {
        case .correct: "checkmark.circle.fill"
        case .partial, .unverified: "info.circle.fill"
        case .incorrect: "xmark.circle.fill"
        }
    }
    private var verdictColor: Color {
        switch check.verdict {
        case .correct: .green
        case .partial, .unverified: .blue
        case .incorrect: .red
        }
    }
    private func icon(for status: CheckStatus) -> String {
        switch status {
        case .pass: "checkmark.circle.fill"
        case .fail: "xmark.circle.fill"
        case .unverified: "info.circle.fill"
        }
    }
    private func color(for status: CheckStatus) -> Color {
        switch status {
        case .pass: .green
        case .fail: .red
        case .unverified: .blue
        }
    }
}

#Preview {
    PracticeView()
}
