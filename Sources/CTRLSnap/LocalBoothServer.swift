import Foundation
import Network
import Darwin

final class LocalBoothServer: ObservableObject, @unchecked Sendable {
    @Published private(set) var url: URL?
    @Published private(set) var error: String?

    private let queue = DispatchQueue(label: "com.ctrloverdrive.ctrlsnap.local-server")
    private var listener: NWListener?
    private let port: NWEndpoint.Port = 47832
    private lazy var webRoot = Bundle.main.resourceURL!.appendingPathComponent("WebApp", isDirectory: true)
    private lazy var photoRoot: URL = {
        let root = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("Snappy Booth/Photos", isDirectory: true)
        try? FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        return root
    }()

    func start() {
        guard listener == nil else { return }
        error = nil

        do {
            pruneExpiredPhotos()
            let listener = try NWListener(using: .tcp, on: port)
            listener.newConnectionHandler = { [weak self] connection in
                self?.handle(connection)
            }
            listener.stateUpdateHandler = { [weak self] state in
                guard let self else { return }
                switch state {
                case .ready:
                    Task { @MainActor [self] in
                        self.url = URL(string: "http://127.0.0.1:\(self.port.rawValue)/")
                    }
                case .failed(let failure):
                    Task { @MainActor [self] in
                        self.listener = nil
                        self.error = failure.localizedDescription
                    }
                default:
                    break
                }
            }
            self.listener = listener
            listener.start(queue: queue)
        } catch {
            self.error = error.localizedDescription
        }
    }

    func stop() {
        listener?.cancel()
        listener = nil
        url = nil
    }

    private func handle(_ connection: NWConnection) {
        connection.start(queue: queue)
        receive(on: connection, accumulated: Data())
    }

    private func receive(on connection: NWConnection, accumulated: Data) {
        connection.receive(minimumIncompleteLength: 1, maximumLength: 16 * 1024 * 1024) {
            [weak self] data, _, isComplete, receiveError in
            guard let self else {
                connection.cancel()
                return
            }
            var buffer = accumulated
            if let data { buffer.append(data) }

            if self.requestIsComplete(buffer) {
                self.respond(to: buffer, on: connection)
            } else if receiveError == nil && !isComplete && buffer.count < 18 * 1024 * 1024 {
                self.receive(on: connection, accumulated: buffer)
            } else {
                self.send(status: "400 Bad Request", body: Data("Bad request".utf8), mime: "text/plain", on: connection)
            }
        }
    }

    private func requestIsComplete(_ data: Data) -> Bool {
        guard let marker = data.range(of: Data("\r\n\r\n".utf8)) else { return false }
        let header = String(decoding: data[..<marker.lowerBound], as: UTF8.self)
        let length = header
            .split(separator: "\r\n")
            .first { $0.lowercased().hasPrefix("content-length:") }
            .flatMap { Int($0.split(separator: ":", maxSplits: 1)[1].trimmingCharacters(in: .whitespaces)) } ?? 0
        return data.count >= marker.upperBound + length
    }

    private func respond(to requestData: Data, on connection: NWConnection) {
        guard let marker = requestData.range(of: Data("\r\n\r\n".utf8)) else {
            send(status: "400 Bad Request", body: Data(), mime: "text/plain", on: connection)
            return
        }
        let header = String(decoding: requestData[..<marker.lowerBound], as: UTF8.self)
        guard let requestLine = header.split(separator: "\r\n").first else {
            send(status: "400 Bad Request", body: Data(), mime: "text/plain", on: connection)
            return
        }
        let parts = requestLine.split(separator: " ")
        guard parts.count >= 2 else {
            send(status: "400 Bad Request", body: Data(), mime: "text/plain", on: connection)
            return
        }
        let method = String(parts[0])
        let path = String(parts[1]).removingPercentEncoding ?? String(parts[1])
        let body = requestData[marker.upperBound...]

        if method == "POST" && path == "/api/outfit-hype" {
            analyzeOutfit(Data(body), on: connection)
            return
        }
        if method == "POST" && path == "/api/photos" {
            savePhoto(Data(body), on: connection)
            return
        }
        if method == "GET" && path.hasPrefix("/api/photos/") {
            let id = String(path.dropFirst("/api/photos/".count))
            guard id.allSatisfy({ $0.isLetter || $0.isNumber }) else {
                send(status: "400 Bad Request", body: Data(), mime: "text/plain", on: connection)
                return
            }
            let photoURL = photoRoot.appendingPathComponent("\(id).jpg")
            guard let photo = try? Data(contentsOf: photoURL) else {
                send(status: "404 Not Found", body: Data("Print expired".utf8), mime: "text/plain", on: connection)
                return
            }
            send(status: "200 OK", body: photo, mime: "image/jpeg", extra: "Cache-Control: no-store\r\n", on: connection)
            return
        }
        guard method == "GET" || method == "HEAD" else {
            send(status: "405 Method Not Allowed", body: Data(), mime: "text/plain", on: connection)
            return
        }
        serveFile(path: path, headOnly: method == "HEAD", on: connection)
    }

    private func analyzeOutfit(_ jsonData: Data, on connection: NWConnection) {
        guard
            let json = try? JSONSerialization.jsonObject(with: jsonData) as? [String: Any],
            let dataURL = json["dataUrl"] as? String,
            dataURL.count <= 12 * 1024 * 1024,
            dataURL.hasPrefix("data:image/jpeg;base64,") || dataURL.hasPrefix("data:image/png;base64,"),
            let marker = dataURL.firstIndex(of: ","),
            let imageData = Data(base64Encoded: String(dataURL[dataURL.index(after: marker)...])),
            imageData.count <= 8 * 1024 * 1024
        else {
            sendJSON(status: "400 Bad Request", object: ["error": "invalid_image"], on: connection)
            return
        }

        guard let apiKey = openAIKey() else {
            sendJSON(status: "503 Service Unavailable", object: ["error": "vision_not_configured"], on: connection)
            return
        }

        let prompt = """
        Look only at visible clothing, accessories, colors, patterns, or a clear statement piece worn by the guest or group. \
        Write one short, goofy, lightly sarcastic but genuinely complimentary hype line. Make them feel good. \
        Do not infer identity, age, ethnicity, health, religion, gender, or any other sensitive trait. \
        Do not mention being an AI or describe the photo. Maximum 18 words. Return only the line.
        """
        let payload: [String: Any] = [
            "model": "gpt-4.1-mini",
            "store": false,
            "max_output_tokens": 80,
            "input": [
                [
                    "role": "user",
                    "content": [
                        ["type": "input_text", "text": prompt],
                        ["type": "input_image", "image_url": dataURL, "detail": "low"],
                    ],
                ],
            ],
        ]

        guard
            let url = URL(string: "https://api.openai.com/v1/responses"),
            let requestBody = try? JSONSerialization.data(withJSONObject: payload)
        else {
            sendJSON(status: "500 Internal Server Error", object: ["error": "vision_request_failed"], on: connection)
            return
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.timeoutInterval = 16
        request.httpBody = requestBody
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(apiKey)", forHTTPHeaderField: "Authorization")

        URLSession.shared.dataTask(with: request) { [weak self] data, response, _ in
            guard let self else {
                connection.cancel()
                return
            }
            guard
                let httpResponse = response as? HTTPURLResponse,
                (200..<300).contains(httpResponse.statusCode),
                let data,
                let line = self.outfitLine(from: data)
            else {
                self.sendJSON(status: "502 Bad Gateway", object: ["error": "vision_unavailable"], on: connection)
                return
            }
            self.sendJSON(
                status: "200 OK",
                object: ["line": line],
                extra: "Cache-Control: no-store\r\n",
                on: connection
            )
        }.resume()
    }

    private func outfitLine(from responseData: Data) -> String? {
        guard
            let root = try? JSONSerialization.jsonObject(with: responseData) as? [String: Any],
            let output = root["output"] as? [[String: Any]]
        else {
            return nil
        }

        for item in output where item["type"] as? String == "message" {
            guard let content = item["content"] as? [[String: Any]] else { continue }
            for part in content where part["type"] as? String == "output_text" {
                guard let text = part["text"] as? String else { continue }
                var clean = text.split(whereSeparator: \.isWhitespace).joined(separator: " ")
                if clean.count >= 2,
                   (clean.hasPrefix("\"") && clean.hasSuffix("\"")) ||
                   (clean.hasPrefix("'") && clean.hasSuffix("'")) {
                    clean.removeFirst()
                    clean.removeLast()
                }
                clean = String(clean.prefix(240))
                if !clean.isEmpty { return clean }
            }
        }
        return nil
    }

    private func openAIKey() -> String? {
        if let value = validOpenAIKey(ProcessInfo.processInfo.environment["OPENAI_API_KEY"]) {
            return value
        }

        let workspaceRoot = Bundle.main.bundleURL
            .deletingLastPathComponent()
            .deletingLastPathComponent()
        let environmentFile = workspaceRoot.appendingPathComponent(".env.local")
        guard let contents = try? String(contentsOf: environmentFile, encoding: .utf8) else {
            return nil
        }

        for rawLine in contents.split(separator: "\n", omittingEmptySubsequences: false) {
            let line = rawLine.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !line.isEmpty, !line.hasPrefix("#") else { continue }
            let parts = line.split(separator: "=", maxSplits: 1, omittingEmptySubsequences: false)
            guard parts.count == 2, parts[0].trimmingCharacters(in: .whitespaces) == "OPENAI_API_KEY" else {
                continue
            }
            var value = parts[1].trimmingCharacters(in: .whitespacesAndNewlines)
            if value.count >= 2,
               (value.hasPrefix("\"") && value.hasSuffix("\"")) ||
               (value.hasPrefix("'") && value.hasSuffix("'")) {
                value.removeFirst()
                value.removeLast()
            }
            return validOpenAIKey(value)
        }
        return nil
    }

    private func validOpenAIKey(_ value: String?) -> String? {
        guard let value, value.hasPrefix("sk-"), value.count > 20 else { return nil }
        return value
    }

    private func savePhoto(_ jsonData: Data, on connection: NWConnection) {
        guard
            let json = try? JSONSerialization.jsonObject(with: jsonData) as? [String: Any],
            let dataURL = json["dataUrl"] as? String,
            let marker = dataURL.firstIndex(of: ","),
            let jpeg = Data(base64Encoded: String(dataURL[dataURL.index(after: marker)...]))
        else {
            send(status: "400 Bad Request", body: Data("{\"error\":\"Invalid photo\"}".utf8), mime: "application/json", on: connection)
            return
        }

        let id = String(UUID().uuidString.replacingOccurrences(of: "-", with: "").prefix(10)).lowercased()
        do {
            try jpeg.write(to: photoRoot.appendingPathComponent("\(id).jpg"), options: .atomic)
            let host = lanIPv4Address() ?? "127.0.0.1"
            let publicURL = "http://\(host):\(port.rawValue)/api/photos/\(id)"
            let payload = try JSONSerialization.data(withJSONObject: ["id": id, "url": publicURL])
            send(status: "200 OK", body: payload, mime: "application/json", extra: "Cache-Control: no-store\r\n", on: connection)
        } catch {
            send(status: "500 Internal Server Error", body: Data(), mime: "text/plain", on: connection)
        }
    }

    private func sendJSON(
        status: String,
        object: [String: Any],
        extra: String = "",
        on connection: NWConnection
    ) {
        let body = (try? JSONSerialization.data(withJSONObject: object)) ?? Data("{}".utf8)
        send(status: status, body: body, mime: "application/json", extra: extra, on: connection)
    }

    private func serveFile(path: String, headOnly: Bool, on connection: NWConnection) {
        var relative = path.split(separator: "?", maxSplits: 1).first.map(String.init) ?? "/"
        if relative == "/" { relative = "/index.html" }
        guard !relative.contains("..") else {
            send(status: "403 Forbidden", body: Data(), mime: "text/plain", on: connection)
            return
        }

        let fileURL = webRoot.appendingPathComponent(String(relative.dropFirst()))
        guard let data = try? Data(contentsOf: fileURL) else {
            send(status: "404 Not Found", body: Data("Not found".utf8), mime: "text/plain", on: connection)
            return
        }
        send(
            status: "200 OK",
            body: headOnly ? Data() : data,
            mime: mimeType(for: fileURL.pathExtension),
            declaredLength: data.count,
            on: connection
        )
    }

    private func send(
        status: String,
        body: Data,
        mime: String,
        declaredLength: Int? = nil,
        extra: String = "",
        on connection: NWConnection
    ) {
        let header =
            "HTTP/1.1 \(status)\r\n" +
            "Content-Type: \(mime)\r\n" +
            "Content-Length: \(declaredLength ?? body.count)\r\n" +
            "Connection: close\r\n" +
            extra +
            "\r\n"
        var response = Data(header.utf8)
        response.append(body)
        connection.send(content: response, completion: .contentProcessed { _ in
            connection.cancel()
        })
    }

    private func mimeType(for ext: String) -> String {
        switch ext.lowercased() {
        case "html": return "text/html; charset=utf-8"
        case "js": return "text/javascript; charset=utf-8"
        case "css": return "text/css; charset=utf-8"
        case "png": return "image/png"
        case "jpg", "jpeg": return "image/jpeg"
        case "svg": return "image/svg+xml"
        case "woff2": return "font/woff2"
        case "json": return "application/json"
        default: return "application/octet-stream"
        }
    }

    private func lanIPv4Address() -> String? {
        var pointer: UnsafeMutablePointer<ifaddrs>?
        guard getifaddrs(&pointer) == 0, let first = pointer else { return nil }
        defer { freeifaddrs(pointer) }

        var current: UnsafeMutablePointer<ifaddrs>? = first
        var fallback: String?
        while let interface = current?.pointee {
            defer { current = interface.ifa_next }
            guard let address = interface.ifa_addr, address.pointee.sa_family == UInt8(AF_INET) else { continue }
            let flags = Int32(interface.ifa_flags)
            guard (flags & IFF_UP) != 0, (flags & IFF_LOOPBACK) == 0 else { continue }

            var host = [CChar](repeating: 0, count: Int(NI_MAXHOST))
            let length = socklen_t(address.pointee.sa_len)
            guard getnameinfo(address, length, &host, socklen_t(host.count), nil, 0, NI_NUMERICHOST) == 0 else { continue }
            let value = String(cString: host)
            let name = String(cString: interface.ifa_name)
            if name == "en0" || name == "en1" { return value }
            fallback = fallback ?? value
        }
        return fallback
    }

    private func pruneExpiredPhotos() {
        let cutoff = Date().addingTimeInterval(-8 * 60 * 60)
        let files = (try? FileManager.default.contentsOfDirectory(
            at: photoRoot,
            includingPropertiesForKeys: [.contentModificationDateKey]
        )) ?? []
        for file in files {
            let modified = try? file.resourceValues(forKeys: [.contentModificationDateKey]).contentModificationDate
            if let modified, modified < cutoff {
                try? FileManager.default.removeItem(at: file)
            }
        }
    }
}
