import SwiftUI

@main
struct EnterNowApp: App {
    @StateObject private var cueEngine = BackgroundCueEngine()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(cueEngine)
        }
    }
}

struct ContentView: View {
    @EnvironmentObject private var cueEngine: BackgroundCueEngine

    var body: some View {
        VStack(spacing: 24) {
            Text("Enter Now")
                .font(.largeTitle.bold())

            Text(cueEngine.statusText)
                .foregroundStyle(.secondary)

            Text(cueEngine.elapsedText)
                .font(.system(.title, design: .monospaced))

            Text("ENTER NOW CUES")
                .font(.caption)
                .foregroundStyle(.secondary)

            Text("\(cueEngine.cueCount)")
                .font(.system(size: 56, weight: .bold, design: .rounded))

            Button(cueEngine.isRunning ? "End Session" : "Start Session") {
                if cueEngine.isRunning {
                    cueEngine.endSession()
                } else {
                    cueEngine.startSession()
                }
            }
            .buttonStyle(.borderedProminent)
        }
        .padding(32)
    }
}
