//
//  ContentView.swift
//  Codebuddy
//
//  Created by Mark Shishlov on 03/11/2026.
//

import SwiftUI

struct ContentView: View {
    @EnvironmentObject private var supabase: SupabaseService

    var body: some View {
        Group {
            if supabase.session != nil {
                MainShellView()
            } else {
                SignInView()
            }
        }
    }
}

private enum AppMode: String, CaseIterable, Identifiable {
    case learn = "Learn"
    case debug = "Debug"
    case practice = "Practice"
    case account = "Account"

    var id: Self { self }

    var systemImage: String {
        switch self {
        case .learn: "book"
        case .practice: "pencil"
        case .debug: "ladybug"
        case .account: "person.circle"
        }
    }

    /// `nil` for Account, which stays neutral rather than taking a mode color.
    var accent: ModeAccent? {
        switch self {
        case .learn: .learn
        case .practice: .practice
        case .debug: .debug
        case .account: nil
        }
    }
}

private struct MainShellView: View {
    @State private var selection: AppMode? = .learn

    /// Everything except Account, which is pinned to the very bottom of the
    /// sidebar instead of scrolling with the rest of the list.
    private let scrollableModes: [AppMode] = [.learn, .debug, .practice]

    var body: some View {
        NavigationSplitView {
            List(scrollableModes, selection: $selection) { mode in
                modeLabel(mode)
            }
            .safeAreaInset(edge: .bottom) {
                VStack(spacing: 0) {
                    Divider()
                    Button {
                        selection = .account
                    } label: {
                        HStack {
                            modeLabel(.account)
                            Spacer()
                        }
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 8)
                    .background(selection == .account ? Theme.surface2 : Color.clear)
                }
            }
            .navigationTitle("CodeBuddy")
            .scrollContentBackground(.hidden)
            .background(Theme.surface)
        } detail: {
            switch selection {
            case .practice:
                PracticeView()
            case .debug:
                DebugView()
            case .account:
                AccountView()
            case .learn, .none:
                LearnView()
            }
        }
        .background(Theme.canvas)
    }

    private func modeLabel(_ mode: AppMode) -> some View {
        Label {
            Text(mode.rawValue)
        } icon: {
            Image(systemName: mode.systemImage)
                .foregroundStyle(mode.accent?.color ?? Theme.ink)
        }
    }
}

#Preview {
    ContentView().environmentObject(SupabaseService.shared)
}
