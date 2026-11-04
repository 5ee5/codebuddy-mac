import SwiftUI

struct DebugView: View {
    @EnvironmentObject private var supabase: SupabaseService

    @State private var language: ProgrammingLanguage = .python
    @State private var code = ""
    @State private var problem = ""
    @State private var isSubmitting = false
    @State private var errorMessage: String?
    @State private var answer: DebugResponse?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Label("Debug", systemImage: "ladybug")
                    .font(.display(.largeTitle))
                    .foregroundStyle(Theme.debug)

                Picker("Language", selection: $language) {
                    ForEach(ProgrammingLanguage.allCases) { language in
                        Text(language.label).tag(language)
                    }
                }
                .frame(maxWidth: 220)

                Text("Your code").font(.headline)
                TextEditor(text: $code)
                    .font(.system(.body, design: .monospaced))
                    .frame(height: 180)
                    .padding(6)
                    .background(Theme.codeBackground, in: RoundedRectangle(cornerRadius: 6))
                    .overlay(RoundedRectangle(cornerRadius: 6).stroke(Theme.line))
                    .placeholder("Paste the code that's misbehaving\u{2026}", show: code.isEmpty)

                Text("What went wrong").font(.headline)
                TextEditor(text: $problem)
                    .frame(height: 80)
                    .padding(6)
                    .background(Theme.surface, in: RoundedRectangle(cornerRadius: 6))
                    .overlay(RoundedRectangle(cornerRadius: 6).stroke(Theme.line))
                    .placeholder("What error did you see, or what did you expect to happen instead?", show: problem.isEmpty)

                Button(action: submit) {
                    if isSubmitting {
                        ProgressView()
                    } else {
                        Text("Find the bug")
                    }
                }
                .buttonStyle(.mode(.debug))
                .disabled(
                    isSubmitting
                        || code.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                        || problem.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                )

                if let errorMessage {
                    Text(errorMessage).foregroundStyle(Theme.danger)
                }

                if isSubmitting {
                    LoadingPlaceholder(message: "Reading through your code\u{2026}")
                } else if let answer {
                    DebugAnswerView(answer: answer)
                } else {
                    EmptyStatePlaceholder(
                        icon: "ladybug",
                        title: "Paste the code that's misbehaving",
                        message: "Add your code and describe what went wrong, and CodeBuddy will diagnose it and suggest a fix.",
                        accent: Theme.debug
                    )
                }
            }
            .padding(24)
        }
        .background(Theme.canvas)
        .navigationTitle("Debug")
    }

    private func submit() {
        guard !isSubmitting, let token = supabase.accessToken else { return }
        isSubmitting = true
        errorMessage = nil
        let request = DebugRequest(language: language, code: code, problem: problem)
        Task {
            defer { isSubmitting = false }
            do {
                let result = try await AssistantAPIClient.debug(request, accessToken: token)
                switch result {
                case let .answered(response, _, _, _, _):
                    answer = response
                case let .error(_, message):
                    errorMessage = message
                }
            } catch {
                errorMessage = "Couldn’t reach the CodeBuddy server. Check your connection and try again."
            }
        }
    }
}

private struct DebugAnswerView: View {
    let answer: DebugResponse

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(answer.diagnosis).font(.headline).foregroundStyle(Theme.debug)
            Text(answer.explanation)

            if answer.outcome == "needs_more_info", !answer.missingInfo.isEmpty {
                VStack(alignment: .leading, spacing: 4) {
                    Text("CodeBuddy needs more information:").font(.subheadline.bold())
                    ForEach(answer.missingInfo, id: \.self) { item in
                        Text("\u{2022}  \(item)")
                    }
                }
            }

            if let corrected = answer.correctedCode {
                Text("Corrected code").font(.headline)
                Text(corrected.code)
                    .font(.system(.body, design: .monospaced))
                    .padding(8)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(Theme.codeBackground, in: RoundedRectangle(cornerRadius: 6))
                    .overlay(RoundedRectangle(cornerRadius: 6).stroke(Theme.line))

                ForEach(answer.changes, id: \.change) { change in
                    VStack(alignment: .leading) {
                        Text(change.change).bold()
                        Text(change.reason).foregroundStyle(Theme.muted)
                    }
                }
            }

            if !answer.nextSteps.isEmpty {
                Text("Next steps").font(.headline).foregroundStyle(Theme.debug)
                ForEach(answer.nextSteps, id: \.self) { step in
                    Text("\u{2022}  \(step)")
                }
            }
        }
        .padding(16)
        .panelStyle()
    }
}

#Preview {
    DebugView().environmentObject(SupabaseService.shared)
}
