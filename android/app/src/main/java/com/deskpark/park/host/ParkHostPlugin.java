package com.deskpark.park.host;

import android.view.WindowManager;

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

    private HostServer server;

    @PluginMethod
    public void start(PluginCall call) {
        if (server != null) {
            call.resolve(state());
            return;
        }
        Integer port = call.getInt("port", 8787);
        try {
            server = new HostServer(port == null ? 8787 : port, this);
            server.start();
        } catch (Exception e) {
            server = null;
            call.reject("端口被占用或无法监听：" + e.getMessage());
            return;
        }
        keepScreenOn(true);
        call.resolve(state());
    }

    @PluginMethod
    public void stop(PluginCall call) {
        if (server != null) {
            server.stop();
            server = null;
        }
        keepScreenOn(false);
        call.resolve();
    }

    @PluginMethod
    public void send(PluginCall call) {
        String session = call.getString("session");
        String data = call.getString("data");
        if (server == null || session == null || data == null) {
            call.reject("主机没在运行");
            return;
        }
        boolean ok = server.send(session, data);
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
        boolean running = server != null;
        int port = running ? server.getPort() : 8787;
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
        if (server != null) {
            server.stop();
            server = null;
        }
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
}
