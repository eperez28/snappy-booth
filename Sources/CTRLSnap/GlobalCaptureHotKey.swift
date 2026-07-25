import AppKit
import Carbon.HIToolbox

final class GlobalCaptureHotKey {
    private static let signature: OSType = 0x534E4150 // "SNAP"
    private static let identifier: UInt32 = 1

    private var hotKeyRef: EventHotKeyRef?
    private var eventHandlerRef: EventHandlerRef?

    @discardableResult
    func install() -> Bool {
        uninstall()

        var eventType = EventTypeSpec(
            eventClass: OSType(kEventClassKeyboard),
            eventKind: UInt32(kEventHotKeyPressed)
        )
        let context = UnsafeMutableRawPointer(Unmanaged.passUnretained(self).toOpaque())
        let handlerStatus = InstallEventHandler(
            GetApplicationEventTarget(),
            { _, event, context in
                guard let event, let context else { return OSStatus(eventNotHandledErr) }

                var hotKeyID = EventHotKeyID()
                let parameterStatus = GetEventParameter(
                    event,
                    EventParamName(kEventParamDirectObject),
                    EventParamType(typeEventHotKeyID),
                    nil,
                    MemoryLayout<EventHotKeyID>.size,
                    nil,
                    &hotKeyID
                )
                guard
                    parameterStatus == noErr,
                    hotKeyID.signature == GlobalCaptureHotKey.signature,
                    hotKeyID.id == GlobalCaptureHotKey.identifier
                else {
                    return OSStatus(eventNotHandledErr)
                }

                _ = Unmanaged<GlobalCaptureHotKey>.fromOpaque(context).takeUnretainedValue()
                DispatchQueue.main.async {
                    NSApp.activate(ignoringOtherApps: true)
                    NotificationCenter.default.post(name: .boothCaptureRequested, object: nil)
                }
                return noErr
            },
            1,
            &eventType,
            context,
            &eventHandlerRef
        )
        guard handlerStatus == noErr else {
            eventHandlerRef = nil
            return false
        }

        let hotKeyID = EventHotKeyID(
            signature: Self.signature,
            id: Self.identifier
        )
        let hotKeyStatus = RegisterEventHotKey(
            UInt32(kVK_ANSI_B),
            UInt32(cmdKey | shiftKey),
            hotKeyID,
            GetApplicationEventTarget(),
            0,
            &hotKeyRef
        )
        if hotKeyStatus != noErr {
            uninstall()
            return false
        }
        return true
    }

    func uninstall() {
        if let hotKeyRef {
            UnregisterEventHotKey(hotKeyRef)
            self.hotKeyRef = nil
        }
        if let eventHandlerRef {
            RemoveEventHandler(eventHandlerRef)
            self.eventHandlerRef = nil
        }
    }

    deinit {
        uninstall()
    }
}
