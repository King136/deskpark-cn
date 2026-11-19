package com.deskpark.park.host;

import android.content.Intent;
import android.os.Build;
import android.view.WindowManager;

import androidx.core.content.ContextCompat;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.List;

/**
 * 把 HostServer 暴露给网页：start / stop / send / status，
 * 连接事件用 hostEvent 推回 JS，业务逻辑全在 JS 侧的 HostCore。
 */
@CapacitorPlugin(name = "ParkHost")
public class ParkHostPlugin extends Plugin implements HostServer.Listener {

    @PluginMethod
    public void start(PluginCall call) {
        if (HostRuntime.running()) {
            call.resolve(state());
            return;
        }
        Integer port = call.getInt("port", 8787);
        try {
            HostRuntime.start(port == null ? 8787 : port, this);
        } catch (Exception e) {
            HostRuntime.stop();
            call.reject("端口被占用或无法监听：" + e.getMessage());
            return;
        }
        startKeepAlive();
        call.resolve(state());
    }

    @PluginMethod
    public void stop(PluginCall call) {
        stopKeepAlive();
        HostRuntime.stop();
        keepScreenOn(false);
        call.resolve();
    }

    /** 前台服务保活：锁屏/切后台不断线 */
    private void startKeepAlive() {
        Intent intent = new Intent(getContext(), ParkHostService.class);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            ContextCompat.startForegroundService(getContext(), intent);
        } else {
            getContext().startService(intent);
        }
        keepScreenOn(true);
    }

    private void stopKeepAlive() {
        try {
            getContext().stopService(new Intent(getContext(), ParkHostService.class));
        } catch (Exception ignored) {
        }
    }

    @PluginMethod
    public void send(PluginCall call) {
        String session = call.getString("session");
        String data = call.getString("data");
        if (!HostRuntime.running() || session == null || data == null) {
            call.reject("主机没在运行");
            return;
        }
        boolean ok = HostRuntime.send(session, data);
        if (!ok) {
            call.reject("连接已断开");
            return;
        }
        call.resolve();
    }

    @PluginMethod
    public void status(PluginCall call) {
        call.resolve(state());
    }

    private JSObject state() {
        JSObject o = new JSObject();
        boolean running = HostRuntime.running();
        int port = running ? HostRuntime.port() : 8787;
        o.put("running", running);
        o.put("port", port);
        JSArray list = new JSArray();
        if (running) for (String a : HostServer.addresses(port)) list.put(a);
        o.put("addresses", list);
        return o;
    }

    /** 当主机期间别让屏幕睡过去，避免 WebView 被挂起把主机带崩 */
    private void keepScreenOn(boolean on) {
        if (getActivity() == null) return;
        getActivity().runOnUiThread(() -> {
            if (on) getActivity().getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            else getActivity().getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        });
    }

    @Override
    protected void handleOnDestroy() {
        stopKeepAlive();
        HostRuntime.stop();
        keepScreenOn(false);
        super.handleOnDestroy();
    }

    @Override
    public void onOpen(String session) {
        notify("open", session, null);
    }

    @Override
    public void onText(String session, String text) {
        notify("message", session, text);
    }

    @Override
    public void onClose(String session) {
        notify("close", session, null);
    }

    private void notify(String type, String session, String data) {
        JSObject e = new JSObject();
        e.put("type", type);
        if (session != null) e.put("session", session);
        if (data != null) e.put("data", data);
        notifyListeners("hostEvent", e);
    }

  /** 网页层同步房间摘要，供 /api/lan 探测使用 */
  @PluginMethod
  public void setLan(PluginCall call) {
    HostRuntime.setLan(call.getString("json", "{\"name\":\"闲亭\",\"rooms\":[]}"));
    call.resolve();
  }

  /** 网页层同步房间完整快照，供 /api/room 房号预览与接棒使用 */
  @PluginMethod
  public void setRoomSnapshot(PluginCall call) {
    String code = call.getString("code", "");
    String json = call.getString("json", "");
    if (code != null && !code.isEmpty()) HostRuntime.setSnapshot(code, json);
    call.resolve();
  }

  private android.media.SoundPool pool;
  private final java.util.Map<String, Integer> clipIds = new java.util.HashMap<>();

  private void loadClips() {
    try {
      pool = new android.media.SoundPool.Builder().setMaxStreams(2).build();
      android.content.res.AssetManager am = getContext().getAssets();
      String[] names = am.list("public/clips");
      if (names == null) return;
      for (String f : names) {
        if (!f.endsWith(".mp3")) continue;
        String key = f.substring(0, f.length() - 4);
        int id = pool.load(am.openFd("public/clips/" + f), 1);
        clipIds.put(key, id);
      }
    } catch (Throwable ignored) {
    }
  }

  private android.speech.tts.TextToSpeech tts;
  private boolean ttsReady = false;
  private String pending = null;

  @Override
  public void load() {
    loadClips();
    try {
      tts = new android.speech.tts.TextToSpeech(getContext(), status -> {
        ttsReady = status == android.speech.tts.TextToSpeech.SUCCESS;
        if (ttsReady && tts != null) {
          tts.setLanguage(java.util.Locale.CHINA);
          tts.setSpeechRate(1.12f);
          tts.setPitch(1.02f);
          if (pending != null) {
            tts.speak(pending, android.speech.tts.TextToSpeech.QUEUE_FLUSH, null, "park-cue");
            pending = null;
          }
        }
      });
    } catch (Throwable ignored) {
    }
  }

  /** 状态栏 / 导航栏跟随网页主题 */
  @PluginMethod
  public void setBarTheme(PluginCall call) {
    final String theme = call.getString("theme", "light");
    getActivity().runOnUiThread(() -> {
      boolean dark = "dark".equals(theme);
      int color = dark ? 0xFF121314 : 0xFFF4F1EA;
      getActivity().getWindow().setStatusBarColor(color);
      getActivity().getWindow().setNavigationBarColor(color);
      // FLAG_LAYOUT_NO_LIMITS 下状态栏区域由窗口底色兜底，必须一起刷
      getActivity().getWindow().getDecorView().setBackgroundColor(color);
      androidx.core.view.WindowInsetsControllerCompat c =
        androidx.core.view.WindowCompat.getInsetsController(
          getActivity().getWindow(),
          getActivity().getWindow().getDecorView()
        );
      c.setAppearanceLightStatusBars(!dark);
      c.setAppearanceLightNavigationBars(!dark);
    });
    call.resolve();
  }

  /** 任意底色：牌局顶栏比大厅浅，交给网页按真实取色回传 */
  @PluginMethod
  public void setBarColor(PluginCall call) {
    final String hex = call.getString("color", "#121314");
    getActivity().runOnUiThread(() -> {
      int color;
      try {
        color = android.graphics.Color.parseColor(hex);
      } catch (Exception e) {
        color = 0xFF121314;
      }
      // 状态栏本身保持透明：不透明色会盖住网页自己的顶栏，正是"牌局里颜色不统一"的原因
      getActivity().getWindow().setStatusBarColor(android.graphics.Color.TRANSPARENT);
      getActivity().getWindow().setNavigationBarColor(android.graphics.Color.TRANSPARENT);
      getActivity().getWindow().getDecorView().setBackgroundColor(color);
      double lum = 0.299 * android.graphics.Color.red(color)
        + 0.587 * android.graphics.Color.green(color)
        + 0.114 * android.graphics.Color.blue(color);
      androidx.core.view.WindowInsetsControllerCompat c =
        androidx.core.view.WindowCompat.getInsetsController(
          getActivity().getWindow(),
          getActivity().getWindow().getDecorView()
        );
      c.setAppearanceLightStatusBars(lum > 150);
      c.setAppearanceLightNavigationBars(lum > 150);
    });
    call.resolve();
  }

  /** 本机 Wi-Fi 网段，网页据此扫同网段主机（window 桥注入失败时的备用通道） */
  @PluginMethod
  public void lanIp(PluginCall call) {
    String ip = "";
    try {
      java.util.List<java.net.NetworkInterface> list =
        java.util.Collections.list(java.net.NetworkInterface.getNetworkInterfaces());
      for (java.net.NetworkInterface ni : list) {
        if (!ni.isUp() || ni.isLoopback()) continue;
        String name = ni.getName() == null ? "" : ni.getName().toLowerCase();
        if (name.startsWith("rmnet") || name.startsWith("ccmni") || name.startsWith("dummy")) continue;
        for (java.net.InetAddress addr : java.util.Collections.list(ni.getInetAddresses())) {
          if (addr.isLoopbackAddress() || !(addr instanceof java.net.Inet4Address)) continue;
          ip = addr.getHostAddress();
          break;
        }
        if (!ip.isEmpty()) break;
      }
    } catch (Exception ignored) {
      /* 拿不到就返回空 */
    }
    call.resolve(new com.getcapacitor.JSObject().put("ip", ip));
  }

  /** 报牌语音（Capacitor 通道） */
  @PluginMethod
  public void speak(PluginCall call) {
    final String key = call.getString("key", "");
    if (key != null && !key.isEmpty() && pool != null && clipIds.containsKey(key)) {
      try {
        pool.play(clipIds.get(key), 1f, 1f, 1, 0, 1f);
        JSObject ok = new JSObject();
        ok.put("ok", true);
        call.resolve(ok);
        return;
      } catch (Throwable ignored) {
      }
    }
    final String text = call.getString("text", "");
    if (key != null && !key.isEmpty() && pool != null && !clipIds.containsKey(key)) {
      try {
        android.media.ToneGenerator tg = new android.media.ToneGenerator(android.media.AudioManager.STREAM_MUSIC, 70);
        tg.startTone(android.media.ToneGenerator.TONE_PROP_BEEP, 120);
      } catch (Throwable ignored) {
      }
    }
    if (text == null || text.isEmpty()) {
      call.resolve();
      return;
    }
    getActivity().runOnUiThread(() -> {
      try {
        if (ttsReady && tts != null) {
          tts.speak(text, android.speech.tts.TextToSpeech.QUEUE_FLUSH, null, "park-cue");
        } else {
          pending = text;
        }
      } catch (Throwable ignored) {
      }
      JSObject ok = new JSObject();
      ok.put("ok", ttsReady);
      call.resolve(ok);
    });
  }
}
