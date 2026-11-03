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

    var id: Self { self }

    var systemImage: String {
        switch self {
        case .learn: "book"
        case .debug: "ladybug"
        }
    }
}

private struct MainShellView: View {
    @EnvironmentObject private var supabase: SupabaseService
    @State private var selection: AppMode? = .learn

    var body: some View {
        NavigationSplitView {
            List(AppMode.allCases, selection: $selection) { mode in
                Label(mode.rawValue, systemImage: mode.systemImage)
            }
            .navigationTitle("CodeBuddy")
            .toolbar {
                ToolbarItem {
                    Button("Sign Out") {
                        Task { await supabase.signOut() }
                    }
                }
            }
        } detail: {
            switch selection {
            case .debug:
                DebugView()
            case .learn, .none:
                LearnView()
            }
        }
    }
}

#Preview {
    ContentView().environmentObject(SupabaseService.shared)
}
