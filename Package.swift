// swift-tools-version: 5.10

import PackageDescription

let package = Package(
    name: "CTRLSnap",
    platforms: [.macOS(.v14)],
    products: [
        .executable(name: "CTRLSnap", targets: ["CTRLSnap"])
    ],
    targets: [
        .executableTarget(
            name: "CTRLSnap",
            path: "Sources/CTRLSnap"
        )
    ]
)
