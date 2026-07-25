import Foundation

struct OpenHomeBridgeClient: Sendable {
    let baseURL: URL
    let token: String
    var timeout: TimeInterval = 1.2

    func send(
        type: String,
        text: String? = nil,
        name: String? = nil,
        data: [String: String]? = nil
    ) async throws -> Bool {
        let allowedTypes = ["speak", "prompt", "action", "ping"]
        guard allowedTypes.contains(type) else { return false }

        var payload: [String: Any] = ["type": type]
        if let text { payload["text"] = text }
        if let name { payload["name"] = name }
        if let data { payload["data"] = data }

        var request = URLRequest(
            url: baseURL.appendingPathComponent("event"),
            timeoutInterval: timeout
        )
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(token, forHTTPHeaderField: "X-OPENHOME-BRIDGE-TOKEN")
        request.httpBody = try JSONSerialization.data(withJSONObject: payload)

        let (_, response) = try await URLSession.shared.data(for: request)
        return (response as? HTTPURLResponse).map { 200..<300 ~= $0.statusCode } ?? false
    }

    func isReady() async -> Bool {
        var request = URLRequest(
            url: baseURL.appendingPathComponent("health"),
            timeoutInterval: timeout
        )
        request.cachePolicy = .reloadIgnoringLocalCacheData
        do {
            let (_, response) = try await URLSession.shared.data(for: request)
            return (response as? HTTPURLResponse)?.statusCode == 200
        } catch {
            return false
        }
    }
}
