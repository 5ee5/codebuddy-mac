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
                Text("Debug")
                    .font(.largeTitle.bold())

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
                    .overlay(RoundedRectangle(cornerRadius: 6).stroke(.quaternary))

                Text("What went wrong").font(.headline)
                TextEditor(text: $problem)
                    .frame(height: 80)
                    .overlay(RoundedRectangle(cornerRadius: 6).stroke(.quaternary))

                Button(action: submit) {
                    if isSubmitting {
                        ProgressView()
                    } else {
                        Text("Find the bug")
                    }
                }
                .disabled(
                    isSubmitting
                        || code.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                        || problem.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                )

                if let errorMessage {
                    Text(errorMessage).foregroundStyle(.red)
                }

                if let answer {
                    DebugAnswerView(answer: answer)
                }
            }
            .padding(24)
        }
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
            Text(answer.diagnosis).font(.headline)
            Text(answer.explanation)

            if answer.outcome == "needs_more_info", !answer.missingInfo.isEmpty {
                VStack(alignment: .leading, spacing: 4) {
                    Text("CodeBuddy needs more information:").font(.subheadline.bold())
                    ForEach(answer.missingInfo, id: \.self) { item in
                        Text("•  \(item)")
                    }
                }
            }

            if let corrected = answer.correctedCode {
                Text("Corrected code").font(.headline)
                Text(corrected.code)
                    .font(.system(.body, design: .monospaced))
                    .padding(8)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(.quaternary, in: RoundedRectangle(cornerRadius: 6))

                ForEach(answer.changes, id: \.change) { change in
                    VStack(alignment: .leading) {
                        Text(change.change).bold()
                        Text(change.reason).foregroundStyle(.secondary)
                    }
                }
            }

            if !answer.nextSteps.isEmpty {
                Text("Next steps").font(.headline)
                ForEach(answer.nextSteps, id: \.self) { step in
                    Text("•  \(step)")
                }
            }
        }
    }
}

#Preview {
    DebugView().environmentObject(SupabaseService.shared)
}
