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
    case practice = "Practice"
    case debug = "Debug"
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

    var body: some View {
        NavigationSplitView {
            List(AppMode.allCases, selection: $selection) { mode in
                Label {
                    Text(mode.rawValue)
                } icon: {
                    Image(systemName: mode.systemImage)
                        .foregroundStyle(mode.accent?.color ?? Theme.ink)
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
}

#Preview {
    ContentView().environmentObject(SupabaseService.shared)
}
