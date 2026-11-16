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
    private final AtomicLong seq = new AtomicLong();
    private volatile boolean running;
    private ServerSocket server;

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

    public void stop() {
        running = false;
        try {
            if (server != null) server.close();
        } catch (IOException ignored) {
        }
        for (Conn c : conns.values()) c.close();
        conns.clear();
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
            for (NetworkInterface ni : Collections.list(NetworkInterface.getNetworkInterfaces())) {
                if (!ni.isUp() || ni.isLoopback()) continue;
                for (InetAddress addr : Collections.list(ni.getInetAddresses())) {
                    if (addr.isLoopbackAddress() || addr.getHostAddress() == null) continue;
                    String host = addr.getHostAddress();
                    if (host.contains(":")) continue; // IPv6 暂不提供给用户
                    String item = host + ":" + port;
                    if (!out.contains(item)) out.add(item);
                }
            }
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

        private String readAsciiUntilBlank() throws IOException {
            ByteArrayOutputStream buf = new ByteArrayOutputStream();
            int c;
            while ((c = in.read()) != -1) {
                buf.write(c);
                byte[] a = buf.toByteArray();
                int n = a.length;
                if (n >= 4 && a[n - 1] == '\n' && a[n - 2] == '\r' && a[n - 3] == '\n' && a[n - 4] == '\r') break;
            }
            return new String(buf.toByteArray(), StandardCharsets.UTF_8);
        }

        private boolean handshake() throws Exception {
            String req = readAsciiUntilBlank();
            if (req.isEmpty()) return false;
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
