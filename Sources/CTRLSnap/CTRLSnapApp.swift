import SwiftUI
import AppKit

extension Notification.Name {
    static let boothCaptureRequested = Notification.Name("com.ctrloverdrive.ctrlsnap.capture-requested")
}

@main
struct CTRLSnapApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate

    var body: some Scene {
        WindowGroup {
            BoothRoot(server: appDelegate.server)
                .frame(minWidth: 1024, minHeight: 700)
                .background(Color.black)
        }
        .windowStyle(.hiddenTitleBar)
        .defaultSize(width: 1440, height: 900)
        .commands {
            CommandGroup(replacing: .newItem) {}
            CommandMenu("Capture") {
                Button("Take Photo") {
                    NotificationCenter.default.post(name: .boothCaptureRequested, object: nil)
                }
                .keyboardShortcut("b", modifiers: [.command, .shift])
            }
        }
    }
}

final class AppDelegate: NSObject, NSApplicationDelegate {
    let server = LocalBoothServer()
    private let globalCaptureHotKey = GlobalCaptureHotKey()

    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.regular)
        NSApp.activate(ignoringOtherApps: true)
        server.start()
        globalCaptureHotKey.install()
    }

    func applicationWillTerminate(_ notification: Notification) {
        globalCaptureHotKey.uninstall()
        server.stop()
    }
}

private struct BoothRoot: View {
    @ObservedObject var server: LocalBoothServer

    var body: some View {
        Group {
            if let url = server.url {
                BoothWebView(url: url)
            } else if let error = server.error {
                VStack(spacing: 18) {
                    Text("SNAPPY BOOTH")
                        .font(.system(size: 52, weight: .black, design: .rounded))
                    Text("LOCAL BOOTH COULD NOT START")
                        .font(.system(.headline, design: .monospaced))
                    Text(error)
                        .foregroundStyle(.secondary)
                        .font(.system(.caption, design: .monospaced))
                    Button("TRY AGAIN") {
                        server.start()
                    }
                    .buttonStyle(.borderedProminent)
                }
                .foregroundStyle(.white)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(Color.black)
            } else {
                VStack(spacing: 16) {
                    ProgressView()
                        .controlSize(.large)
                        .tint(.white)
                    Text("WARMING UP THE PRINT LAB…")
                        .font(.system(.caption, design: .monospaced))
                        .tracking(1.6)
                }
                .foregroundStyle(.white)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(Color.black)
            }
        }
    }
}
