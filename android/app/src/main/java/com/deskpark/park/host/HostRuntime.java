package com.deskpark.park.host;

/**
 * 主机运行时的唯一持有者：插件负责开关，前台服务负责保活，两边都通过它拿到同一个 server。
 */
public final class HostRuntime {

    private static HostServer server;

    private HostRuntime() {}

    public static synchronized void start(int port, HostServer.Listener listener) throws Exception {
        if (server != null) return;
        server = new HostServer(port, listener);
        server.start();
    }

    public static synchronized void stop() {
        if (server != null) {
            server.stop();
            server = null;
        }
    }

    public static synchronized boolean running() {
        return server != null;
    }

    public static synchronized int port() {
        return server != null ? server.getPort() : 8787;
    }

    /** 网页层把房间摘要同步过来，/api/lan 才能报告真实房间数 */
    public static synchronized void setLan(String json) {
        if (server != null) server.setLan(json);
    }

    /** 网页层把房间完整快照同步过来，/api/room 才能提供房号预览与接棒快照 */
    public static synchronized void setSnapshot(String code, String json) {
        if (server != null) server.setSnapshot(code, json);
    }

    public static synchronized void clearSnapshots() {
        if (server != null) server.clearSnapshots();
    }

    public static synchronized java.util.List<String> addresses() {
        return HostServer.addresses(port());
    }

    public static synchronized boolean send(String session, String text) {
        return server != null && server.send(session, text);
    }
}
