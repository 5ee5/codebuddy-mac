import SwiftUI

struct LearnView: View {
    @EnvironmentObject private var supabase: SupabaseService

    @State private var level: LearnerLevel = .beginner
    @State private var topic = ""
    @State private var question = ""
    @State private var isSubmitting = false
    @State private var errorMessage: String?
    @State private var answer: LearnResponse?
    @State private var remainingToday: Int?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Label("Learn", systemImage: "book")
                    .font(.largeTitle.bold())
                    .foregroundStyle(Theme.learn)

                Picker("Level", selection: $level) {
                    ForEach(LearnerLevel.allCases) { level in
                        Text(level.label).tag(level)
                    }
                }
                .pickerStyle(.segmented)

                TextField("Topic (optional)", text: $topic)
                    .textFieldStyle(.roundedBorder)

                TextEditor(text: $question)
                    .frame(height: 100)
                    .padding(6)
                    .background(Theme.surface, in: RoundedRectangle(cornerRadius: 6))
                    .overlay(RoundedRectangle(cornerRadius: 6).stroke(Theme.line))

                HStack {
                    Button(action: submit) {
                        if isSubmitting {
                            ProgressView()
                        } else {
                            Text("Ask")
                        }
                    }
                    .buttonStyle(.mode(.learn))
                    .disabled(isSubmitting || question.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)

                    if let remainingToday {
                        Text("\(remainingToday) questions left today")
                            .font(.caption)
                            .foregroundStyle(Theme.muted)
                    }
                }

                if let errorMessage {
                    Text(errorMessage).foregroundStyle(Theme.danger)
                }

                if let answer {
                    LearnAnswerView(answer: answer) { followUp in
                        question = followUp
                    }
                }
            }
            .padding(24)
        }
        .background(Theme.canvas)
        .navigationTitle("Learn")
    }

    private func submit() {
        guard !isSubmitting, let token = supabase.accessToken else { return }
        isSubmitting = true
        errorMessage = nil
        let request = LearnRequest(question: question, level: level, topic: topic.isEmpty ? nil : topic)
        Task {
            defer { isSubmitting = false }
            do {
                let result = try await AssistantAPIClient.learn(request, accessToken: token)
                switch result {
                case let .answered(response, _, _, remaining, _):
                    answer = response
                    remainingToday = remaining
                case let .error(_, message):
                    errorMessage = message
                }
            } catch {
                errorMessage = "Couldn’t reach the CodeBuddy server. Check your connection and try again."
            }
        }
    }
}

private struct LearnAnswerView: View {
    let answer: LearnResponse
    let onFollowUp: (String) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(answer.explanation)

            if let example = answer.example {
                Text(example.code)
                    .font(.system(.body, design: .monospaced))
                    .padding(8)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(Theme.codeBackground, in: RoundedRectangle(cornerRadius: 6))
                    .overlay(RoundedRectangle(cornerRadius: 6).stroke(Theme.line))
            }

            if !answer.keyPoints.isEmpty {
                VStack(alignment: .leading, spacing: 4) {
                    ForEach(answer.keyPoints, id: \.self) { point in
                        Text("\u{2022}  \(point)")
                    }
                }
            }

            if !answer.followUpQuestions.isEmpty {
                VStack(alignment: .leading, spacing: 6) {
                    Text("Follow-up questions").font(.headline).foregroundStyle(Theme.learn)
                    ForEach(answer.followUpQuestions, id: \.self) { followUp in
                        Button(followUp) { onFollowUp(followUp) }
                            .buttonStyle(.secondaryPanel)
                    }
                }
            }
        }
        .padding(16)
        .panelStyle()
    }
}

#Preview {
    LearnView().environmentObject(SupabaseService.shared)
}
