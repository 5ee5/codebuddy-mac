import Auth
import SwiftUI

/// Mirrors the web app's `/account` page: signed-in email, change password,
/// sign out. Delete Account and GitHub connect stay web-only for now — both
/// need a Bearer-token API route that doesn't exist yet.
struct AccountView: View {
    @EnvironmentObject private var supabase: SupabaseService

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                Label("Account", systemImage: "person.circle")
                    .font(.display(.largeTitle))
                    .foregroundStyle(Theme.ink)

                if let email = supabase.email {
                    Text("Signed in as **\(email)**")
                        .foregroundStyle(Theme.muted)
                }

                ChangePasswordSection()

                Button {
                    Task { await supabase.signOut() }
                } label: {
                    Text("Sign Out")
                }
                .buttonStyle(.secondaryPanel)
            }
            .padding(24)
        }
        .background(Theme.canvas)
        .navigationTitle("Account")
    }
}

private enum PasswordLimits {
    static let min = 8
    static let max = 72
}

private struct ChangePasswordSection: View {
    @EnvironmentObject private var supabase: SupabaseService

    @State private var password = ""
    @State private var confirm = ""
    @State private var passwordError: String?
    @State private var confirmError: String?
    @State private var message: String?
    @State private var messageIsError = true
    @State private var isSubmitting = false

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Change your password").font(.headline)
            Text("If someone gave you your first password, replace it with one only you know.")
                .font(.callout)
                .foregroundStyle(.secondary)

            SecureField("New password", text: $password)
                .textContentType(.password)
            if let passwordError {
                Text(passwordError).foregroundStyle(Theme.danger).font(.caption)
            } else {
                Text("At least \(PasswordLimits.min) characters.")
                    .font(.caption)
                    .foregroundStyle(Theme.muted)
            }

            SecureField("Type it again", text: $confirm)
                .textContentType(.password)
            if let confirmError {
                Text(confirmError).foregroundStyle(Theme.danger).font(.caption)
            }

            if let message {
                Text(message)
                    .foregroundStyle(messageIsError ? Theme.danger : Theme.success)
                    .font(.callout)
            }

            Button(action: submit) {
                if isSubmitting {
                    ProgressView()
                } else {
                    Text("Change password")
                }
            }
            .buttonStyle(.brand)
            .disabled(isSubmitting)
        }
        .padding(16)
        .frame(maxWidth: 420, alignment: .leading)
        .panelStyle()
    }

    private func submit() {
        guard !isSubmitting else { return }
        passwordError = nil
        confirmError = nil
        message = nil

        if password.count < PasswordLimits.min {
            passwordError = "Use at least \(PasswordLimits.min) characters."
        } else if password.utf8.count > PasswordLimits.max {
            passwordError = "Use at most \(PasswordLimits.max) characters."
        }
        if passwordError == nil && confirm != password {
            confirmError = "The two passwords don’t match."
        }
        guard passwordError == nil, confirmError == nil else { return }

        isSubmitting = true
        Task {
            defer { isSubmitting = false }
            do {
                try await supabase.changePassword(password)
                messageIsError = false
                message = "Your password has been changed."
                password = ""
                confirm = ""
            } catch let error as AuthError {
                messageIsError = true
                switch error.errorCode {
                case .samePassword:
                    passwordError = "That’s already your password. Choose a different one."
                case .weakPassword:
                    passwordError = "That password is too easy to guess. Choose a longer or less common one."
                case .reauthenticationNeeded:
                    message = "For your security, sign out, sign in again, then change your password."
                default:
                    message = "Sign-in isn’t working right now. Try again in a little while."
                }
            } catch {
                messageIsError = true
                message = "Sign-in isn’t working right now. Try again in a little while."
            }
        }
    }
}

#Preview {
    AccountView().environmentObject(SupabaseService.shared)
}
