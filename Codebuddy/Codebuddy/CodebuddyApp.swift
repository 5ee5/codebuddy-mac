//
//  CodebuddyApp.swift
//  Codebuddy
//
//  Created by Mark Shishlov on 03/11/2026.
//

import SwiftUI

@main
struct CodebuddyApp: App {
    @StateObject private var supabase = SupabaseService.shared

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(supabase)
        }
    }
}
