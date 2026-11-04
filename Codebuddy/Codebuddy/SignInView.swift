import SwiftUI

struct SignInView: View {
    @EnvironmentObject private var supabase: SupabaseService
    @State private var email = ""
    @State private var password = ""
    @State private var errorMessage: String?
    @State private var isSubmitting = false

    var body: some View {
        VStack(spacing: 16) {
            Text("Sign in to CodeBuddy")
                .font(.display(.title2))
                .foregroundStyle(Theme.ink)

            TextField("Email", text: $email)
                .textContentType(.username)
                .onSubmit(signIn)

            SecureField("Password", text: $password)
                .textContentType(.password)
                .onSubmit(signIn)

            if let errorMessage {
                Text(errorMessage)
                    .foregroundStyle(Theme.danger)
                    .font(.callout)
                    .multilineTextAlignment(.center)
            }

            Button(action: signIn) {
                if isSubmitting {
                    ProgressView()
                        .frame(maxWidth: .infinity)
                } else {
                    Text("Sign In")
                        .frame(maxWidth: .infinity)
                }
            }
            .buttonStyle(.brand)
            .keyboardShortcut(.defaultAction)
            .disabled(isSubmitting || email.isEmpty || password.isEmpty)
        }
        .padding(32)
        .frame(width: 320)
        .panelStyle()
        .padding(40)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Theme.canvas)
    }

    private func signIn() {
        guard !isSubmitting else { return }
        isSubmitting = true
        errorMessage = nil
        Task {
            do {
                try await supabase.signIn(email: email, password: password)
            } catch {
                errorMessage = error.localizedDescription
            }
            isSubmitting = false
        }
    }
}

#Preview {
    SignInView().environmentObject(SupabaseService.shared)
}
