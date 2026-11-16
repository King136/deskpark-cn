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
}
