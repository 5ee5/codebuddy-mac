import SwiftUI
#if canImport(AppKit)
import AppKit
#elseif canImport(UIKit)
import UIKit
#endif

/// Mirrors the web app's "annotated notebook" palette — warm paper and ink
/// neutrals, a highlighter accent, and one accent color per mode — so the
/// native app reads as the same product. Source of truth:
/// `codebuddy-web/src/app/globals.css`.
enum Theme {
    static let canvas = dynamic(light: 0xF6F4EE, dark: 0x131210)
    static let surface = dynamic(light: 0xFFFDF8, dark: 0x1A1916)
    static let surface2 = dynamic(light: 0xEFECE4, dark: 0x24221E)
    static let codeBackground = dynamic(light: 0xF4F1E9, dark: 0x161512)
    static let line = dynamic(light: 0xE2DDD0, dark: 0x33312B)
    static let lineStrong = dynamic(light: 0xCBC4B4, dark: 0x4A463E)
    static let lineInput = dynamic(light: 0x8B8576, dark: 0x78725F)
    static let ink = dynamic(light: 0x1D1C19, dark: 0xEEEBE3)
    static let muted = dynamic(light: 0x5F5A4F, dark: 0xAAA496)
    static let subtle = dynamic(light: 0x716B5D, dark: 0x8A8476)

    static let brand = ink
    static let brandInk = dynamic(light: 0xFFFDF8, dark: 0x1A1916)
    static let highlight = dynamic(light: 0xFFE17A, dark: 0x5B4A0F)

    static let learn = dynamic(light: 0x1D4FC4, dark: 0x93B4FF)
    static let learnSoft = dynamic(light: 0xE9EEFB, dark: 0x1C2640)
    static let learnInk = dynamic(light: 0xFFFFFF, dark: 0x0F1730)

    static let debug = dynamic(light: 0xB54708, dark: 0xF5A65B)
    static let debugSoft = dynamic(light: 0xFBEEE2, dark: 0x382514)
    static let debugInk = dynamic(light: 0xFFFFFF, dark: 0x2A1606)

    static let practice = dynamic(light: 0x1B7A4A, dark: 0x6DD49C)
    static let practiceSoft = dynamic(light: 0xE5F3EA, dark: 0x142E1F)
    static let practiceInk = dynamic(light: 0xFFFFFF, dark: 0x0A2615)

    static let status = dynamic(light: 0xB7791F, dark: 0xE7B24F)
    static let danger = dynamic(light: 0xB42318, dark: 0xFF9A8F)
    static let dangerSoft = dynamic(light: 0xFCEBEA, dark: 0x3A1B18)
    static let success = dynamic(light: 0x1B7A4A, dark: 0x6DD49C)
    static let focus = dynamic(light: 0x1D4FC4, dark: 0x93B4FF)

    private static func dynamic(light: UInt32, dark: UInt32) -> Color {
        #if canImport(AppKit)
        Color(NSColor(name: nil) { appearance in
            appearance.bestMatch(from: [.aqua, .darkAqua]) == .darkAqua ? NSColor(hex: dark) : NSColor(hex: light)
        })
        #elseif canImport(UIKit)
        Color(UIColor { trait in
            trait.userInterfaceStyle == .dark ? UIColor(hex: dark) : UIColor(hex: light)
        })
        #else
        Color(hex: light)
        #endif
    }
}

/// One of the app's three modes, each with its own accent from `Theme`.
enum ModeAccent {
    case learn, debug, practice

    var color: Color {
        switch self {
        case .learn: Theme.learn
        case .debug: Theme.debug
        case .practice: Theme.practice
        }
    }
    var soft: Color {
        switch self {
        case .learn: Theme.learnSoft
        case .debug: Theme.debugSoft
        case .practice: Theme.practiceSoft
        }
    }
    var ink: Color {
        switch self {
        case .learn: Theme.learnInk
        case .debug: Theme.debugInk
        case .practice: Theme.practiceInk
        }
    }
}

private extension Color {
    init(hex: UInt32) {
        self.init(
            .sRGB,
            red: Double((hex >> 16) & 0xFF) / 255,
            green: Double((hex >> 8) & 0xFF) / 255,
            blue: Double(hex & 0xFF) / 255,
            opacity: 1
        )
    }
}

#if canImport(AppKit)
private extension NSColor {
    convenience init(hex: UInt32) {
        self.init(
            srgbRed: CGFloat((hex >> 16) & 0xFF) / 255,
            green: CGFloat((hex >> 8) & 0xFF) / 255,
            blue: CGFloat(hex & 0xFF) / 255,
            alpha: 1
        )
    }
}
#elseif canImport(UIKit)
private extension UIColor {
    convenience init(hex: UInt32) {
        self.init(
            red: CGFloat((hex >> 16) & 0xFF) / 255,
            green: CGFloat((hex >> 8) & 0xFF) / 255,
            blue: CGFloat(hex & 0xFF) / 255,
            alpha: 1
        )
    }
}
#endif

// MARK: - Shared controls

/// Flat, bordered surface: hairline border, small radius, no shadow — mirrors
/// the web app's `panel` style.
struct PanelBackground: ViewModifier {
    func body(content: Content) -> some View {
        content
            .background(Theme.surface, in: RoundedRectangle(cornerRadius: 10))
            .overlay(RoundedRectangle(cornerRadius: 10).stroke(Theme.line))
    }
}

extension View {
    func panelStyle() -> some View { modifier(PanelBackground()) }
}

/// The ink call-to-action button: dark fill, light text, used outside a mode.
struct BrandButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.body.weight(.semibold))
            .padding(.horizontal, 16)
            .padding(.vertical, 8)
            .background(Theme.brand.opacity(configuration.isPressed ? 0.85 : 1), in: RoundedRectangle(cornerRadius: 6))
            .foregroundStyle(Theme.brandInk)
    }
}

/// A mode-colored call to action, for the primary action inside Learn/Debug/Practice.
struct ModeButtonStyle: ButtonStyle {
    let mode: ModeAccent

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.body.weight(.semibold))
            .padding(.horizontal, 16)
            .padding(.vertical, 8)
            .background(mode.color.opacity(configuration.isPressed ? 0.85 : 1), in: RoundedRectangle(cornerRadius: 6))
            .foregroundStyle(mode.ink)
    }
}

/// Bordered, surface-colored secondary button.
struct SecondaryButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.body.weight(.semibold))
            .padding(.horizontal, 16)
            .padding(.vertical, 8)
            .background(configuration.isPressed ? Theme.surface2 : Theme.surface, in: RoundedRectangle(cornerRadius: 6))
            .overlay(RoundedRectangle(cornerRadius: 6).stroke(Theme.lineStrong))
            .foregroundStyle(Theme.ink)
    }
}

extension ButtonStyle where Self == BrandButtonStyle {
    static var brand: BrandButtonStyle { BrandButtonStyle() }
}
extension ButtonStyle where Self == SecondaryButtonStyle {
    static var secondaryPanel: SecondaryButtonStyle { SecondaryButtonStyle() }
}
extension ButtonStyle where Self == ModeButtonStyle {
    static func mode(_ mode: ModeAccent) -> ModeButtonStyle { ModeButtonStyle(mode: mode) }
}
