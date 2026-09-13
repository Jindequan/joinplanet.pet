import Expo
import EXNotifications
import React
import ReactAppDependencyProvider
import UserNotifications

@UIApplicationMain
public class AppDelegate: ExpoAppDelegate {
  var window: UIWindow?

  var reactNativeDelegate: ExpoReactNativeFactoryDelegate?
  var reactNativeFactory: RCTReactNativeFactory?

  public override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    // Register actionable care categories before React/Expo starts. A remote
    // notification can arrive during a cold launch, before the JS provider
    // has finished importing expo-notifications; registering here keeps the
    // system notification actionable in that window as well.
    // Initialize Expo's native notification delegate at the same boundary so
    // a tap/action received while JS is still booting is queued and delivered
    // once the EmitterModule subscribes.
    _ = NotificationCenterManager.shared
    registerCareNotificationCategories()

    let delegate = ReactNativeDelegate()
    let factory = ExpoReactNativeFactory(delegate: delegate)
    delegate.dependencyProvider = RCTAppDependencyProvider()

    reactNativeDelegate = delegate
    reactNativeFactory = factory
    bindReactNativeFactory(factory)

#if os(iOS) || os(tvOS)
    window = UIWindow(frame: UIScreen.main.bounds)
    factory.startReactNative(
      withModuleName: "main",
      in: window,
      launchOptions: launchOptions)
#endif

    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }

  private func registerCareNotificationCategories() {
    let accept = UNNotificationAction(
      identifier: "care_accept",
      title: "我来做",
      options: [.foreground]
    )
    let decline = UNNotificationAction(
      identifier: "care_decline",
      title: "我也不行",
      options: [.foreground, .destructive]
    )
    let delegate = UNNotificationAction(
      identifier: "care_delegate",
      title: "给其他人",
      options: [.foreground]
    )
    let batchAccept = UNNotificationAction(
      identifier: "care_batch_accept",
      title: "我来做",
      options: [.foreground]
    )
    let batchDecline = UNNotificationAction(
      identifier: "care_batch_decline",
      title: "我也不行",
      options: [.foreground, .destructive]
    )
    let batchDelegate = UNNotificationAction(
      identifier: "care_batch_delegate",
      title: "给其他人",
      options: [.foreground]
    )

    let requestCategory = UNNotificationCategory(
      identifier: "care_request",
      actions: [accept, decline, delegate],
      intentIdentifiers: []
    )
    let batchCategory = UNNotificationCategory(
      identifier: "care_handoff_batch",
      actions: [batchAccept, batchDecline, batchDelegate],
      intentIdentifiers: []
    )
    UNUserNotificationCenter.current().setNotificationCategories([requestCategory, batchCategory])
  }

  // Linking API
  public override func application(
    _ app: UIApplication,
    open url: URL,
    options: [UIApplication.OpenURLOptionsKey: Any] = [:]
  ) -> Bool {
    return super.application(app, open: url, options: options) || RCTLinkingManager.application(app, open: url, options: options)
  }

  // Universal Links
  public override func application(
    _ application: UIApplication,
    continue userActivity: NSUserActivity,
    restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void
  ) -> Bool {
    let result = RCTLinkingManager.application(application, continue: userActivity, restorationHandler: restorationHandler)
    return super.application(application, continue: userActivity, restorationHandler: restorationHandler) || result
  }
}

class ReactNativeDelegate: ExpoReactNativeFactoryDelegate {
  // Extension point for config-plugins

  override func sourceURL(for bridge: RCTBridge) -> URL? {
    // needed to return the correct URL for expo-dev-client.
    bridge.bundleURL ?? bundleURL()
  }

  override func bundleURL() -> URL? {
#if DEBUG
    return RCTBundleURLProvider.sharedSettings().jsBundleURL(forBundleRoot: ".expo/.virtual-metro-entry")
#else
    return Bundle.main.url(forResource: "main", withExtension: "jsbundle")
#endif
  }
}

/// iOS 27 requires applications to participate in the scene lifecycle. The
/// React/Expo factory is still created by AppDelegate, so the scene delegate
/// only attaches that already-configured window to the active UIWindowScene.
/// This keeps one React root alive while satisfying UIKit's lifecycle contract.
final class SceneDelegate: UIResponder, UIWindowSceneDelegate {
  var window: UIWindow?

  func scene(
    _ scene: UIScene,
    willConnectTo session: UISceneSession,
    options connectionOptions: UIScene.ConnectionOptions
  ) {
    guard let windowScene = scene as? UIWindowScene,
          let appDelegate = UIApplication.shared.delegate as? AppDelegate,
          let appWindow = appDelegate.window else {
      return
    }

    appWindow.windowScene = windowScene
    window = appWindow
    appWindow.makeKeyAndVisible()
  }

  func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
    for context in URLContexts {
      _ = RCTLinkingManager.application(
        UIApplication.shared,
        open: context.url,
        options: [:]
      )
    }
  }

  func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
    _ = RCTLinkingManager.application(
      UIApplication.shared,
      continue: userActivity,
      restorationHandler: { _ in }
    )
  }
}
