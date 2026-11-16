package com.deskpark.park;

import android.graphics.Color;
import android.os.Bundle;
import android.view.View;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;

import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;

import com.deskpark.park.host.ParkHostPlugin;
import com.getcapacitor.BridgeActivity;

/**
 * 闲亭 Android 壳。
 *
 * 两件事：
 * 1. 让 WebView 真正铺满整屏。系统栏的占位（status bar / 挖孔）交给网页的 env(safe-area-inset-*)
 *    处理，壳里不再额外加 padding —— 否则横屏时上面会多出一条纸白空带、左边多一条挖孔留白。
 * 2. 给网页一个 ParkHost.setOrientation()，用来在"竖屏锁定"的手机上也能强制逆时针横屏。
 */
public class MainActivity extends BridgeActivity {

  @Override
  public void onCreate(Bundle savedInstanceState) {
    // 局域网主机插件要在 bridge 起来之前注册
    registerPlugin(ParkHostPlugin.class);
    super.onCreate(savedInstanceState);

    WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
    getWindow().setStatusBarColor(Color.TRANSPARENT);
    getWindow().setNavigationBarColor(Color.TRANSPARENT);
    getWindow().addFlags(WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS);
    if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.R) {
      getWindow().setDecorFitsSystemWindows(false);
    }

    // 内容区不吃任何 inset：整块交给网页自己排
    View content = findViewById(android.R.id.content);
    if (content != null) {
      ViewCompat.setOnApplyWindowInsetsListener(content, (v, insets) -> WindowInsetsCompat.CONSUMED);
    }

    android.webkit.WebView web = getBridge() != null ? getBridge().getWebView() : null;
    if (web != null) {
      web.setFitsSystemWindows(false);
      web.post(
        () -> {
          web.addJavascriptInterface(new ParkHost(), "ParkHost");
        }
      );
    }
  }

  /** 暴露给网页的宿主能力 */
  public class ParkHost {

    private android.speech.tts.TextToSpeech tts;
    private boolean ttsReady = false;
    private String pendingSpeech = null;

    /** 报牌语音：WebView 本身不实现 SpeechSynthesis，这里用系统 TTS 兜住 */
    @JavascriptInterface
    public void speak(final String text) {
      if (text == null || text.isEmpty()) return;
      runOnUiThread(() -> {
        try {
          if (tts == null) {
            tts = new android.speech.tts.TextToSpeech(getApplicationContext(), status -> {
              ttsReady = status == android.speech.tts.TextToSpeech.SUCCESS;
              if (ttsReady && tts != null) {
                tts.setLanguage(java.util.Locale.CHINA);
                tts.setSpeechRate(1.12f);
                tts.setPitch(1.02f);
                if (pendingSpeech != null) {
                  tts.speak(pendingSpeech, android.speech.tts.TextToSpeech.QUEUE_FLUSH, null, "park-cue");
                  pendingSpeech = null;
                }
              }
            });
          }
          if (ttsReady) {
            tts.speak(text, android.speech.tts.TextToSpeech.QUEUE_FLUSH, null, "park-cue");
          } else {
            pendingSpeech = text; // 引擎还在初始化，留着等就绪再说
          }
        } catch (Throwable ignored) {
        }
      });
    }

    @JavascriptInterface
    public void setOrientation(final String mode) {
      runOnUiThread(
        () -> {
          String m = mode == null ? "auto" : mode;
          switch (m) {
            case "landscape": // 逆时针横屏
              setRequestedOrientation(android.content.pm.ActivityInfo.SCREEN_ORIENTATION_REVERSE_LANDSCAPE);
              break;
            case "portrait":
              setRequestedOrientation(android.content.pm.ActivityInfo.SCREEN_ORIENTATION_PORTRAIT);
              break;
            default:
              setRequestedOrientation(
                android.content.pm.ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED
              );
              break;
          }
        }
      );
    }

    /** 全屏沉浸 / 恢复系统栏 */
    @JavascriptInterface
    public void setSystemBars(final String visible) {
      runOnUiThread(
        () -> {
          androidx.core.view.WindowInsetsControllerCompat c = WindowCompat.getInsetsController(
            getWindow(),
            getWindow().getDecorView()
          );
          if ("1".equals(visible)) {
            c.show(WindowInsetsCompat.Type.systemBars());
          } else {
            c.hide(WindowInsetsCompat.Type.systemBars());
          }
        }
      );
    }

    /** 当前方向 */
    @JavascriptInterface
    public String orientation() {
      int o = getResources().getConfiguration().orientation;
      return o == android.content.res.Configuration.ORIENTATION_LANDSCAPE ? "landscape" : "portrait";
    }
  }
}
