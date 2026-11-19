package com.deskpark.park.host;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.NetworkInterface;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;

/**
 * 局域网主机的最小 WebSocket 服务端（纯文本帧）。
 *
 * 只做一件事：把每条连接上的报文原样交给 JS 侧的 HostCore（就是线上服务端那份 Hub），
 * 再把 Hub 的回复写回连接。协议解析、房间与规则都不在这里，避免两套实现。
 */
public class HostServer {

    public interface Listener {
        void onOpen(String session);

        void onText(String session, String text);

        void onClose(String session);
    }

    private static final String GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";

    private final int port;
    private final Listener listener;
    private final Map<String, Conn> conns = new ConcurrentHashMap<>();
    private final Map<String, String> snapshots = new ConcurrentHashMap<>();
    private final AtomicLong seq = new AtomicLong();
    private volatile boolean running;
    private ServerSocket server;
    private volatile String lanJson = "{\"name\":\"闲亭\",\"rooms\":[]}";

    public HostServer(int port, Listener listener) {
        this.port = port;
        this.listener = listener;
    }

    public int getPort() {
        return server != null ? server.getLocalPort() : port;
    }

    public void start() throws IOException {
        server = new ServerSocket();
        server.setReuseAddress(true);
        server.bind(new InetSocketAddress(port));
        running = true;
        Thread acceptor = new Thread(this::acceptLoop, "park-host-accept");
        acceptor.setDaemon(true);
        acceptor.start();
    }

    /** 让网页层把当前房间摘要写进来，/api/lan 就能报告真实房间数 */
    public void setLan(String json) {
        if (json != null && !json.isEmpty()) lanJson = json;
    }

    /** 网页层把房间完整快照写进来（Hub.diskState 同构），/api/room 提供预览与接棒 */
    public void setSnapshot(String code, String json) {
        if (code == null || code.isEmpty()) return;
        if (json == null || json.isEmpty()) snapshots.remove(code);
        else snapshots.put(code, json);
    }

    public void clearSnapshots() {
        snapshots.clear();
    }

    public void stop() {
        running = false;
        try {
            if (server != null) server.close();
        } catch (IOException ignored) {
        }
        for (Conn c : conns.values()) c.close();
        conns.clear();
        snapshots.clear();
    }

    public boolean send(String session, String text) {
        Conn c = conns.get(session);
        if (c == null) return false;
        return c.writeText(text);
    }

    private void acceptLoop() {
        while (running) {
            try {
                Socket socket = server.accept();
                String id = "s" + seq.incrementAndGet() + "-" + UUID.randomUUID().toString().substring(0, 8);
                Conn conn = new Conn(id, socket);
                Thread t = new Thread(() -> conn.run(), "park-host-" + id);
                t.setDaemon(true);
                t.start();
            } catch (IOException e) {
                if (running) continue;
                break;
            }
        }
    }

    /** 局域网 IPv4 地址，给别台手机填 */
    public static List<String> addresses(int port) {
        List<String> out = new ArrayList<>();
        try {
            List<String> wifi = new ArrayList<>();
            List<String> other = new ArrayList<>();
            for (NetworkInterface ni : Collections.list(NetworkInterface.getNetworkInterfaces())) {
                if (!ni.isUp() || ni.isLoopback()) continue;
                String niName = ni.getName() == null ? "" : ni.getName().toLowerCase();
                // 蜂窝、虚拟网卡上的地址朋友连不到，排除掉只留 Wi-Fi / 以太网
                boolean cellular = niName.startsWith("rmnet") || niName.startsWith("ccmni")
                        || niName.startsWith("dummy") || niName.startsWith("p2p");
                for (InetAddress addr : Collections.list(ni.getInetAddresses())) {
                    if (addr.isLoopbackAddress() || addr.isLinkLocalAddress() || addr.getHostAddress() == null) continue;
                    String host = addr.getHostAddress();
                    if (host.contains(":")) continue; // IPv6 暂不提供给用户
                    String item = host + ":" + port;
                    boolean priv = host.startsWith("192.168.") || host.startsWith("10.")
                            || host.startsWith("172.16.") || host.startsWith("172.17.") || host.startsWith("172.18.")
                            || host.startsWith("172.19.") || host.startsWith("172.2") || host.startsWith("172.30.")
                            || host.startsWith("172.31.");
                    if (!cellular && priv) {
                        if (!wifi.contains(item)) wifi.add(item);
                    } else if (!cellular) {
                        if (!other.contains(item)) other.add(item);
                    }
                }
            }
            out.addAll(wifi);
            out.addAll(other);
        } catch (Exception ignored) {
        }
        if (out.isEmpty()) out.add("127.0.0.1:" + port);
        return out;
    }

    private class Conn {
        private final String id;
        private final Socket socket;
        private InputStream in;
        private OutputStream out;
        private final Object writeLock = new Object();
        private volatile boolean open;
        private String fragment = null;

        Conn(String id, Socket socket) {
            this.id = id;
            this.socket = socket;
        }

        void run() {
            try {
                socket.setTcpNoDelay(true);
                in = socket.getInputStream();
                out = socket.getOutputStream();
                if (!handshake()) return;
                open = true;
                conns.put(id, this);
                listener.onOpen(id);
                readLoop();
            } catch (Exception ignored) {
            } finally {
                close();
                if (open) listener.onClose(id);
                conns.remove(id);
            }
        }

        /** 同一端口兼顾 HTTP：给浏览器/其它手机一个可探测的应答 */
        private void serveHttp(String requestLine, String head) throws IOException {
            String path = "/";
            String query = "";
            String[] parts = requestLine.split(" ");
            if (parts.length >= 2) {
                String target = parts[1];
                int q = target.indexOf('?');
                if (q >= 0) {
                    path = target.substring(0, q);
                    query = target.substring(q + 1);
                } else {
                    path = target;
                }
            }
            String cors = "Access-Control-Allow-Origin: *\r\n"
                    + "Access-Control-Allow-Headers: *\r\n"
                    + "Cache-Control: no-store\r\n"
                    + "Connection: close\r\n";
            if (path.startsWith("/api/lan")) {
                byte[] body = lanJson.getBytes(StandardCharsets.UTF_8);
                out.write(("HTTP/1.1 200 OK\r\nContent-Type: application/json; charset=utf-8\r\n"
                        + cors + "Content-Length: " + body.length + "\r\n\r\n").getBytes(StandardCharsets.UTF_8));
                out.write(body);
            } else if (path.startsWith("/api/room")) {
                // 房号预览与接棒快照：知道房号是唯一凭据
                String code = queryParams(query).get("code");
                byte[] body;
                int status;
                if (code == null || code.isEmpty()) {
                    status = 400;
                    body = "{\"error\":\"missing code\"}".getBytes(StandardCharsets.UTF_8);
                } else {
                    String snap = snapshots.get(code.toUpperCase());
                    if (snap == null) {
                        status = 404;
                        body = "{\"error\":\"no-room\"}".getBytes(StandardCharsets.UTF_8);
                    } else {
                        status = 200;
                        body = snap.getBytes(StandardCharsets.UTF_8);
                    }
                }
                out.write(("HTTP/1.1 " + status + (status == 200 ? " OK" : " Not Found")
                        + "\r\nContent-Type: application/json; charset=utf-8\r\n"
                        + cors + "Content-Length: " + body.length + "\r\n\r\n").getBytes(StandardCharsets.UTF_8));
                out.write(body);
            } else if (path.equals("/health")) {
                out.write(("HTTP/1.1 200 OK\r\nContent-Type: text/plain; charset=utf-8\r\n"
                        + cors + "Content-Length: 2\r\n\r\nok").getBytes(StandardCharsets.UTF_8));
            } else {
                String html = "<!doctype html><meta charset=utf-8><title>闲亭主机</title>"
                        + "<body style='font:16px/1.6 system-ui;padding:24px;background:#f6f2e8;color:#20302a'>"
                        + "<h2>闲亭 · 这台手机正在当主机</h2>"
                        + "<p>WebSocket 端口已经开着。朋友在自己手机的「我的 → 联机与局域网」里填本机地址即可入座。</p>"
                        + "<p><a href='/api/lan'>查看房间状态</a></p></body>";
                byte[] body = html.getBytes(StandardCharsets.UTF_8);
                out.write(("HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\n"
                        + cors + "Content-Length: " + body.length + "\r\n\r\n").getBytes(StandardCharsets.UTF_8));
                out.write(body);
            }
            out.flush();
        }

        /** 最小 query 解析：?code=AB12&full=1 */
        private static java.util.Map<String, String> queryParams(String query) {
            java.util.Map<String, String> map = new java.util.HashMap<>();
            if (query == null || query.isEmpty()) return map;
            for (String pair : query.split("&")) {
                int eq = pair.indexOf('=');
                if (eq <= 0) continue;
                try {
                    map.put(pair.substring(0, eq),
                            java.net.URLDecoder.decode(pair.substring(eq + 1), "UTF-8"));
                } catch (Exception ignored) {
                }
            }
            return map;
        }

        private String readAsciiUntilBlank() throws IOException {
            // 逐字节读到空行（\r\n\r\n）。缓存头最多几 KB，
            // 用 ByteArrayOutputStream 直接写、只在尾部比对，避免每读一个字节就整体拷贝。
            ByteArrayOutputStream buf = new ByteArrayOutputStream();
            int b1 = -1, b2 = -1, b3 = -1;
            int c;
            while ((c = in.read()) != -1) {
                buf.write(c);
                if (b3 == '\r' && b2 == '\n' && b1 == '\r' && c == '\n') break;
                b3 = b2;
                b2 = b1;
                b1 = c;
            }
            return new String(buf.toByteArray(), StandardCharsets.UTF_8);
        }

        private boolean handshake() throws Exception {
            String req = readAsciiUntilBlank();
            if (req.isEmpty()) return false;
            String firstLine = req.split("\r\n")[0];
            if (!req.toLowerCase().contains("sec-websocket-key:")) {
                serveHttp(firstLine, req);
                return false;
            }
            if (firstLine.isEmpty()) return false;
            String key = null;
            for (String line : req.split("\r\n")) {
                String lower = line.toLowerCase();
                if (lower.startsWith("sec-websocket-key:")) key = line.substring(line.indexOf(':') + 1).trim();
            }
            if (key == null) {
                out.write("HTTP/1.1 400 Bad Request\r\n\r\n".getBytes(StandardCharsets.UTF_8));
                out.flush();
                return false;
            }
            String accept = java.util.Base64.getEncoder().encodeToString(
                    MessageDigest.getInstance("SHA-1").digest((key + GUID).getBytes(StandardCharsets.UTF_8)));
            String resp = "HTTP/1.1 101 Switching Protocols\r\n"
                    + "Upgrade: websocket\r\n"
                    + "Connection: Upgrade\r\n"
                    + "Sec-WebSocket-Accept: " + accept + "\r\n\r\n";
            out.write(resp.getBytes(StandardCharsets.UTF_8));
            out.flush();
            return true;
        }

        private void readLoop() throws IOException {
            while (running && !socket.isClosed()) {
                int b0 = in.read();
                if (b0 == -1) return;
                int b1 = in.read();
                boolean fin = (b0 & 0x80) != 0;
                int opcode = b0 & 0x0F;
                boolean masked = (b1 & 0x80) != 0;
                long len = b1 & 0x7F;
                if (len == 126) {
                    len = ((in.read() & 0xFF) << 8) | (in.read() & 0xFF);
                } else if (len == 127) {
                    len = 0;
                    for (int i = 0; i < 8; i++) len = (len << 8) | (in.read() & 0xFF);
                }
                byte[] mask = new byte[4];
                if (masked) for (int i = 0; i < 4; i++) mask[i] = (byte) in.read();
                if (len > 1 << 20) return; // 单帧上限 1MB，异常连接直接断开
                byte[] payload = new byte[(int) len];
                int read = 0;
                while (read < payload.length) {
                    int n = in.read(payload, read, payload.length - read);
                    if (n < 0) return;
                    read += n;
                }
                if (masked) for (int i = 0; i < payload.length; i++) payload[i] ^= mask[i % 4];

                if (opcode == 0x8) return; // close
                if (opcode == 0x9) { // ping
                    writeFrame(0xA, payload);
                    continue;
                }
                if (opcode == 0xA) continue; // pong
                if (opcode == 0x1 || opcode == 0x0) {
                    String chunk = new String(payload, StandardCharsets.UTF_8);
                    if (opcode == 0x0 && fragment != null) fragment += chunk;
                    else fragment = chunk;
                    if (fin) {
                        String text = fragment;
                        fragment = null;
                        listener.onText(id, text);
                    }
                }
            }
        }

        boolean writeText(String text) {
            try {
                writeFrame(0x1, text.getBytes(StandardCharsets.UTF_8));
                return true;
            } catch (IOException e) {
                close();
                return false;
            }
        }

        private void writeFrame(int opcode, byte[] payload) throws IOException {
            synchronized (writeLock) {
                ByteArrayOutputStream buf = new ByteArrayOutputStream();
                buf.write(0x80 | opcode);
                int n = payload.length;
                if (n < 126) {
                    buf.write(n);
                } else if (n < 65536) {
                    buf.write(126);
                    buf.write((n >> 8) & 0xFF);
                    buf.write(n & 0xFF);
                } else {
                    buf.write(127);
                    for (int i = 7; i >= 0; i--) buf.write((int) (((long) n >> (8 * i)) & 0xFF));
                }
                buf.write(payload);
                out.write(buf.toByteArray());
                out.flush();
            }
        }

        void close() {
            try {
                socket.close();
            } catch (IOException ignored) {
            }
        }
    }
}
