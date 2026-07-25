import SwiftUI
import WebKit
import AppKit
import UniformTypeIdentifiers

struct BoothWebView: NSViewRepresentable {
    let url: URL

    func makeCoordinator() -> Coordinator {
        Coordinator()
    }

    func makeNSView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.defaultWebpagePreferences.allowsContentJavaScript = true
        configuration.mediaTypesRequiringUserActionForPlayback = []
        configuration.userContentController.add(context.coordinator, name: "savePhoto")

        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.setValue(false, forKey: "drawsBackground")
        webView.uiDelegate = context.coordinator
        webView.navigationDelegate = context.coordinator
        webView.allowsMagnification = false
        context.coordinator.attach(to: webView)
        webView.load(URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData))
        return webView
    }

    func updateNSView(_ webView: WKWebView, context: Context) {
        if webView.url == nil {
            webView.load(URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData))
        }
    }

    static func dismantleNSView(_ webView: WKWebView, coordinator: Coordinator) {
        coordinator.detach()
        webView.configuration.userContentController.removeScriptMessageHandler(forName: "savePhoto")
    }

    final class Coordinator: NSObject, WKUIDelegate, WKNavigationDelegate, WKScriptMessageHandler {
        private weak var webView: WKWebView?
        private var captureObserver: NSObjectProtocol?

        func attach(to webView: WKWebView) {
            self.webView = webView
            captureObserver = NotificationCenter.default.addObserver(
                forName: .boothCaptureRequested,
                object: nil,
                queue: .main
            ) { [weak self] _ in
                self?.webView?.evaluateJavaScript(
                    "window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', bubbles: true }));"
                )
            }
        }

        func detach() {
            if let captureObserver {
                NotificationCenter.default.removeObserver(captureObserver)
                self.captureObserver = nil
            }
            webView = nil
        }

        deinit {
            detach()
        }

        func webView(
            _ webView: WKWebView,
            requestMediaCapturePermissionFor origin: WKSecurityOrigin,
            initiatedByFrame frame: WKFrameInfo,
            type: WKMediaCaptureType,
            decisionHandler: @escaping (WKPermissionDecision) -> Void
        ) {
            decisionHandler(origin.host == "127.0.0.1" || origin.host == "localhost" ? .grant : .prompt)
        }

        func userContentController(
            _ userContentController: WKUserContentController,
            didReceive message: WKScriptMessage
        ) {
            guard message.name == "savePhoto",
                  let dataURL = message.body as? String,
                  let marker = dataURL.firstIndex(of: ","),
                  let data = Data(base64Encoded: String(dataURL[dataURL.index(after: marker)...]))
            else { return }

            let panel = NSSavePanel()
            panel.title = "Save your Snappy Booth print"
            panel.nameFieldStringValue = "SNAPPY-BOOTH-\(Int(Date().timeIntervalSince1970)).jpg"
            panel.allowedContentTypes = [.jpeg]
            panel.canCreateDirectories = true
            panel.begin { response in
                guard response == .OK, let url = panel.url else { return }
                try? data.write(to: url, options: .atomic)
            }
        }

        func webView(
            _ webView: WKWebView,
            didFailProvisionalNavigation navigation: WKNavigation?,
            withError error: Error
        ) {
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.7) {
                if let url = webView.url {
                    webView.load(URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData))
                }
            }
        }
    }
}
